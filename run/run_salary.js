import { ApiPromise, WsProvider } from '@polkadot/api'
import { blake2AsHex } from '@polkadot/util-crypto'
import { log } from 'console'

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// --- endpoints (xcm mode: collectives 8000, asset-hub 8001, relay 8002) ---
const COLLECTIVES_WS = 'ws://127.0.0.1:8000'
const ASSET_HUB_WS = 'ws://127.0.0.1:8002'
const RELAY_WS = 'ws://127.0.0.1:8003'

// Account injected as the sole rank-3 Fellow via configs/polkadot-collectives_local.yml.
const FELLOW = '14Md8aehwVoc1kFWfBHfjqTjMAH91R3TpZkEKvmV893fSfQ8'
// Account on AssetHub that holds HOLLAR and is debited by the salary PayOverXcm.
const SALARY_ACCOUNT_AH = '13w7NdvSR1Af8xsQTArDtZmVvjE8XhWNdL4yed3iFHrUNCnS'
// payout() pays the caller, so HOLLAR lands on the Fellow's account on AssetHub.
const BENEFICIARY_AH = FELLOW

// HOLLAR identifier on AssetHub. Number -> pallet `assets`; object (Location) -> pallet
// `foreignAssets`. HOLLAR is Hydration (parachain 2034) general-index 222, foreign asset on AH.
const HOLLAR_ON_AH = {
  parents: 1,
  interior: { X2: [{ Parachain: 2034 }, { GeneralIndex: 222 }] },
}

const FELLOWS_TRACK = 3 // rank-3 FellowshipOrigins::Fellows track

// Preimage of the call that updates FellowshipCore params + Parameters pallet values
// (switches the fellowship salary from USDT to HOLLAR; budget 250k -> 400k; 6 -> 18 decimals).
/*
https://dev.papi.how/extrinsics#networkId=polkadot_collectives&endpoint=wss%3A%2F%2Fcollectives-polkadot-rpc.n.dwellir.com&data=0x2802082e0000000105010100a10f010200c91f057903000000da2b851f0bb4540000000000003f09240100504e9d2cbbd22c2d000000000000000100a09c3a5976a5595a000000000000000100a0bc9336db9566690100000000000001000040b2bac9e0191e020000000000000100501efc55b72bcdd2020000000000000100a0fc45f1a4768087030000000000000100a0fc45f1a4768087030000000000000100a0fc45f1a4768087030000000000000100a0fc45f1a476808703000000000000240100a054e4215d699616000000000000000100504e9d2cbbd22c2d00000000000000010050de499bed4ab3b4000000000000000100002059dd64f00c0f010000000000000100a0bc9336db95666901000000000000010050fea278523bc0c301000000000000010050fea278523bc0c301000000000000010050fea278523bc0c301000000000000010050fea278523bc0c301000000000000000000
*/
const PREIMAGE =
  '0x2802082e0000000105010100a10f010200c91f057903000000da2b851f0bb4540000000000003f09240100504e9d2cbbd22c2d000000000000000100a09c3a5976a5595a000000000000000100a0bc9336db9566690100000000000001000040b2bac9e0191e020000000000000100501efc55b72bcdd2020000000000000100a0fc45f1a4768087030000000000000100a0fc45f1a4768087030000000000000100a0fc45f1a4768087030000000000000100a0fc45f1a476808703000000000000240100a054e4215d699616000000000000000100504e9d2cbbd22c2d00000000000000010050de499bed4ab3b4000000000000000100002059dd64f00c0f010000000000000100a0bc9336db95666901000000000000010050fea278523bc0c301000000000000010050fea278523bc0c301000000000000010050fea278523bc0c301000000000000010050fea278523bc0c301000000000000000000'

const PREIMAGE_HASH = blake2AsHex(PREIMAGE, 256)
const PREIMAGE_LEN = (PREIMAGE.length - 2) / 2

// Mock signature accepted by chopsticks when `mock-signature-host: true`.
const signFake = (tx, addr, options) => {
  tx.signFake(addr, options)
  const sig = new Uint8Array(64)
  sig.fill(0xcd)
  sig.set([0xde, 0xad, 0xbe, 0xef])
  tx.signature.set(sig)
}

const signAndSend = async (tx, addr, nonce) => {
  if (nonce === undefined) nonce = (await api.query.system.account(addr)).nonce
  signFake(tx, addr, { nonce, genesisHash: api.genesisHash, runtimeVersion: api.runtimeVersion, blockHash: api.genesisHash })
  await tx.send()
}

const head = async () => Number((await provider.send('chain_getHeader', [])).number)

const logEvents = async (title) => {
  const events = await api.query.system.events()
  log(`--- events (${title}) ---`)
  for (const { event } of events) log(`  ${event.section}.${event.method} ${JSON.stringify(event.data.toHuman())}`)
  return events
}

// Send one extrinsic as the Fellow, build a block, report success vs. expectation.
const sendAndCheck = async (tx, label, expectSuccess) => {
  await signAndSend(tx, FELLOW)
  await provider.send('dev_newBlock', [])
  const events = await logEvents(`${label} @ block ${await head()}`)
  const succeeded = !events.some(({ event }) => api.events.system.ExtrinsicFailed.is(event))
  const verdict = succeeded === expectSuccess ? 'PASS' : 'MISMATCH'
  log(`${label}: expected ${expectSuccess ? 'SUCCESS' : 'FAILURE'}, got ${succeeded ? 'SUCCESS' : 'FAILURE'} -> ${verdict}`)
  return succeeded
}

const setCycleStart = async (newStart) => {
  const s = (await api.query.fellowshipSalary.status()).unwrap().toJSON()
  s.cycleStart = newStart
  await provider.send('dev_setStorage', [{ FellowshipSalary: { Status: s } }])
}

const readCycle = async () => (await api.query.fellowshipSalary.status()).toHuman()
const readBudget = async () => (await api.query.fellowshipSalary.status()).unwrap().budget.toBigInt()

// Per-rank salary arrays as BigInt, straight from storage.
const readSalaries = async () => {
  const p = await api.query.fellowshipCore.params()
  return {
    active: [...p.activeSalary].map((x) => x.toBigInt()),
    passive: [...p.passiveSalary].map((x) => x.toBigInt()),
  }
}

// HOLLAR balance of `account` on AssetHub (0 if no record / asset unknown).
const readHollar = async (account) => {
  if (HOLLAR_ON_AH == null || !apiAh) return null
  const pallet = typeof HOLLAR_ON_AH === 'number' ? apiAh.query.assets : apiAh.query.foreignAssets
  if (!pallet?.account) {
    log('WARN: expected asset pallet not found on the 8001 chain — is it really AssetHub? skipping HOLLAR check')
    return null
  }
  const rec = await pallet.account(HOLLAR_ON_AH, account)
  return rec.isSome ? rec.unwrap().balance.toBigInt() : 0n
}

const printRef = async (label, index) => {
  const i = await api.query.fellowshipReferenda.referendumInfoFor(index)
  log(`[${label}] block ${await head()}: ${JSON.stringify(i.toHuman())}`)
  return i.unwrap()
}

// Build a relay block then an AH block so a queued XCM gets delivered + executed.
const relayXcm = async () => {
  if (providerRelay) await providerRelay.send('dev_newBlock', [])
  if (providerAh) await providerAh.send('dev_newBlock', [])
}

// 4th arg raises the request timeout above the 60s default (long multi-block builds).
const provider = new WsProvider(COLLECTIVES_WS, 3, {}, 600_000)
const api = await ApiPromise.create({ provider, noInitWarn: true })
while (provider.isConnected === false) {
  log('Waiting for collectives connection...')
  await sleep(1000)
}

// AssetHub + relay are optional: only needed for the XCM payout leg.
let providerAh = null
let apiAh = null
let providerRelay = null
try {
  providerAh = new WsProvider(ASSET_HUB_WS, 3, {}, 600_000)
  apiAh = await ApiPromise.create({ provider: providerAh, noInitWarn: true })
  providerRelay = new WsProvider(RELAY_WS, 3, {}, 600_000)
  await apiAh.isReady
} catch (e) {
  log(`AssetHub/relay not reachable, running collectives-only: ${e}`)
  providerAh = null
  apiAh = null
  providerRelay = null
}

// Confirm which chain is on each port (catches stale processes / wrong port order).
log(`chain @8000: ${await provider.send('system_chain', [])}`)
if (providerAh) log(`chain @8001: ${await providerAh.send('system_chain', [])}`)
if (providerRelay) log(`chain @8002: ${await providerRelay.send('system_chain', [])}`)

log(`current block: ${await head()}`)
log(`preimage hash: ${PREIMAGE_HASH} len: ${PREIMAGE_LEN}`)

// Decode and print the preimage so the asset / budget / salaries it sets are visible
// (and so we can read HOLLAR's AssetHub asset-id for HOLLAR_ON_AH).
try {
  const decoded = api.createType('Call', PREIMAGE)
  log('--- decoded preimage ---')
  log(JSON.stringify(decoded.toHuman(), null, 2))
} catch (e) {
  log(`could not decode preimage as Call: ${e}`)
}

// periods needed up front to size the cycle so enactment lands just after approval.
const registrationPeriod = api.consts.fellowshipSalary.registrationPeriod.toNumber()
const payoutPeriod = api.consts.fellowshipSalary.payoutPeriod.toNumber()
const fullCycle = registrationPeriod + payoutPeriod
const trackInfo = api.consts.fellowshipReferenda.tracks.find(([id]) => id.toNumber() === FELLOWS_TRACK)[1]
const preparePeriod = trackInfo.preparePeriod.toNumber()
const confirmPeriod = trackInfo.confirmPeriod.toNumber()
const minEnactmentPeriod = trackInfo.minEnactmentPeriod.toNumber()
log(`periods: registration=${registrationPeriod} payout=${payoutPeriod}`)
log(`track ${FELLOWS_TRACK}: prepare=${preparePeriod} confirm=${confirmPeriod} minEnactment=${minEnactmentPeriod}`)

// -------------------------------------------------------------------
// Step 0: shrink the wait. Put cycleEnd (bump-valid / enactment block) just after
// the referendum will be approved, computed from the live head.
// -------------------------------------------------------------------
const head0 = await head()
const cycleEnd = head0 + 3 + preparePeriod + confirmPeriod + minEnactmentPeriod + 30
await setCycleStart(cycleEnd - fullCycle)
log(`set cycleStart so cycleEnd = ${cycleEnd} (${cycleEnd - head0} blocks ahead)`)

// -------------------------------------------------------------------
// Step 1: note the preimage (skip if already in storage).
// -------------------------------------------------------------------
if ((await api.query.preimage.preimageFor([PREIMAGE_HASH, PREIMAGE_LEN])).isSome) {
  log('preimage already noted, skipping notePreimage')
} else {
  await signAndSend(api.tx.preimage.notePreimage(PREIMAGE), FELLOW)
  await provider.send('dev_newBlock', [])
  await logEvents('notePreimage')
}

// -------------------------------------------------------------------
// Step 2: submit a Fellows-track referendum enacting the preimage at cycleEnd.
// -------------------------------------------------------------------
await signAndSend(
  api.tx.fellowshipReferenda.submit({ FellowshipOrigins: 'Fellows' }, { Lookup: { hash: PREIMAGE_HASH, len: PREIMAGE_LEN } }, { At: cycleEnd }),
  FELLOW,
)
await provider.send('dev_newBlock', [])
await logEvents('submit referendum')
const referendumIndex = (await api.query.fellowshipReferenda.referendumCount()).toNumber() - 1
log(`referendum index: ${referendumIndex}`)

// -------------------------------------------------------------------
// Step 3: decision deposit + aye vote (one block).
// -------------------------------------------------------------------
const baseNonce = (await api.query.system.account(FELLOW)).nonce.toNumber()
await signAndSend(api.tx.fellowshipReferenda.placeDecisionDeposit(referendumIndex), FELLOW, baseNonce)
await signAndSend(api.tx.fellowshipCollective.vote(referendumIndex, true), FELLOW, baseNonce + 1)
await provider.send('dev_newBlock', [])
await logEvents('decision deposit + vote')
let ref = await printRef('after vote', referendumIndex)

// -------------------------------------------------------------------
// Step 4: prepare -> deciding -> confirmed/approved.
// -------------------------------------------------------------------
await provider.send('dev_newBlock', [{ to: ref.asOngoing.submitted.toNumber() + preparePeriod + 1 }])
ref = await printRef('after prepare period (deciding)', referendumIndex)
const confirming = ref.asOngoing.deciding.unwrap().confirming
if (confirming.isNone) throw new Error('referendum not confirming — check approval/support thresholds')
await provider.send('dev_newBlock', [{ to: confirming.unwrap().toNumber() + 1 }])
await printRef('after confirm period (approved)', referendumIndex)

// Induct into the salary system NOW, while still in the old cycle (28). register()
// requires claimant.last_active < status.cycle_index, so we must be inducted in a
// cycle earlier than the one we register in. (Build a block here, before cycleEnd, so
// it doesn't disturb the bump() boundary probes below.)
if ((await api.query.fellowshipSalary.claimant(FELLOW)).isNone) {
  await sendAndCheck(api.tx.fellowshipSalary.induct(), 'induct (old cycle)', true)
}

// -------------------------------------------------------------------
// Step 5: enactment at cycleEnd, with bump() probes around the boundary.
// Anchor the head precisely with single-block steps — `dev_newBlock {to}` can overshoot
// by a block, which would misalign the probes. Bulk-advance close, then step exactly.
// -------------------------------------------------------------------
if ((await head()) < cycleEnd - 5) await provider.send('dev_newBlock', [{ to: cycleEnd - 5 }])
while ((await head()) < cycleEnd - 2) await provider.send('dev_newBlock', [])
await printRef('before enactment (approved, scheduled)', referendumIndex)

// OLD snapshot (before the param change enacts at cycleEnd).
const oldCycle = await readCycle()
const oldBudget = await readBudget()
const oldSalaries = await readSalaries()

// head == cycleEnd-2 -> this block is cycleEnd-1: bump must FAIL (cycle not over yet).
await sendAndCheck(api.tx.fellowshipSalary.bump(), 'bump one block before cycleEnd', false)
// head == cycleEnd-1 -> this block is cycleEnd: scheduler enacts our params, bump SUCCEEDS.
while ((await head()) < cycleEnd - 1) await provider.send('dev_newBlock', [])
await sendAndCheck(api.tx.fellowshipSalary.bump(), 'bump at cycleEnd', true)

// NEW snapshot (param change enacted, new cycle started).
const newCycle = await readCycle()
const newBudget = await readBudget()
const newSalaries = await readSalaries()

// -------------------------------------------------------------------
// Step 6: register, fast-path into payout, then pay out (XCM to AssetHub).
// -------------------------------------------------------------------
await sendAndCheck(api.tx.fellowshipSalary.register(), 'register (new cycle)', true)
const payoutAt = (await head()) + 2
await setCycleStart(payoutAt - registrationPeriod)
log(`moved new cycleStart so payout opens at block ${payoutAt}`)
await provider.send('dev_newBlock', [{ to: payoutAt }])

const srcBefore = await readHollar(SALARY_ACCOUNT_AH)
const beneBefore = await readHollar(BENEFICIARY_AH)

await sendAndCheck(api.tx.fellowshipSalary.payout(), 'payout', true)
// Deliver the PayOverXcm message to AssetHub and let it execute.
await relayXcm()
await relayXcm()

const claimant = await api.query.fellowshipSalary.claimant(FELLOW)
const srcAfter = await readHollar(SALARY_ACCOUNT_AH)
const beneAfter = await readHollar(BENEFICIARY_AH)

// -------------------------------------------------------------------
// Results + assertions (all read from storage).
// -------------------------------------------------------------------
const SHIFT = 10n ** 12n // USDT(6) -> HOLLAR(18)
const check = (name, ok) => log(`[${ok ? 'PASS' : 'FAIL'}] ${name}`)

log('================= RESULTS =================')
log('--- FellowshipSalary cycle ---')
log(`old cycle: ${JSON.stringify(oldCycle)}`)
log(`new cycle: ${JSON.stringify(newCycle)}`)

log('--- budget ---')
log(`old budget: ${oldBudget}  (= ${oldBudget / 10n ** 6n} @ 6 decimals)`)
log(`new budget: ${newBudget}  (= ${newBudget / 10n ** 18n} @ 18 decimals)`)
check('old budget == 250k USDT', oldBudget === 250000n * 10n ** 6n)
check('new budget == 400k HOLLAR', newBudget === 400000n * 10n ** 18n)

log('--- salaries (same value, 6 -> 18 decimals) ---')
log(`old active:  ${oldSalaries.active.join(', ')}`)
log(`new active:  ${newSalaries.active.join(', ')}`)
log(`old passive: ${oldSalaries.passive.join(', ')}`)
log(`new passive: ${newSalaries.passive.join(', ')}`)
const salariesShifted = (oldArr, newArr) => oldArr.length === newArr.length && oldArr.every((o, i) => newArr[i] === o * SHIFT)
check('active salaries equal after 10^12 shift', salariesShifted(oldSalaries.active, newSalaries.active))
check('passive salaries equal after 10^12 shift', salariesShifted(oldSalaries.passive, newSalaries.passive))

log('--- salary claimant (after payout) ---')
log(`claimant: ${JSON.stringify(claimant.toHuman())}`)

log('--- HOLLAR on AssetHub ---')
if (srcBefore == null) {
  log('HOLLAR_ON_AH not set (or AH not connected) — set it from the decoded preimage above to verify the transfer')
} else {
  log(`source  ${SALARY_ACCOUNT_AH}: ${srcBefore} -> ${srcAfter} (${srcAfter - srcBefore})`)
  log(`beneficiary ${BENEFICIARY_AH}: ${beneBefore} -> ${beneAfter} (${beneAfter - beneBefore})`)
  check('beneficiary HOLLAR increased', beneAfter > beneBefore)
  check('source HOLLAR decreased', srcAfter < srcBefore)
  check('amount debited == credited', srcBefore - srcAfter === beneAfter - beneBefore)
}

await api.disconnect()
if (apiAh) await apiAh.disconnect()
if (providerRelay) await providerRelay.disconnect()
