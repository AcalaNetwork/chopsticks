// Computes the block at which to schedule the fellowship-salary param-change referendum,
// based on the REAL current salary cycle. The param change should enact exactly when the
// current cycle ends and the next one starts (cycleEnd = bump-valid block), so the new
// cycle runs with the new (HOLLAR) params.
//
// Usage:
//   node run/calc_enactment_block.js [wsEndpoint]
// Defaults to the live collectives RPC; pass ws://127.0.0.1:8000 to use a local fork.
import { ApiPromise, WsProvider } from '@polkadot/api'
import { log } from 'console'

const ENDPOINT = process.argv[2] ?? 'wss://polkadot-collectives-rpc.polkadot.io'
const FELLOWS_TRACK = 3

const api = await ApiPromise.create({ provider: new WsProvider(ENDPOINT), noInitWarn: true })

const now = (await api.rpc.chain.getHeader()).number.toNumber()
const status = (await api.query.fellowshipSalary.status()).unwrap()
const cycleStart = status.cycleStart.toNumber()
const registrationPeriod = api.consts.fellowshipSalary.registrationPeriod.toNumber()
const payoutPeriod = api.consts.fellowshipSalary.payoutPeriod.toNumber()
const cyclePeriod = registrationPeriod + payoutPeriod
const payoutStart = cycleStart + registrationPeriod
const cycleEnd = cycleStart + cyclePeriod

const track = api.consts.fellowshipReferenda.tracks.find(([id]) => id.toNumber() === FELLOWS_TRACK)[1]
const prepare = track.preparePeriod.toNumber()
const decision = track.decisionPeriod.toNumber()
const confirm = track.confirmPeriod.toNumber()
const minEnact = track.minEnactmentPeriod.toNumber()

log(`endpoint:           ${ENDPOINT}`)
log(`current block:      ${now}`)
log(`cycleIndex:         ${status.cycleIndex.toNumber()}`)
log(`cycleStart:         ${cycleStart}`)
log(`registrationPeriod: ${registrationPeriod}`)
log(`payoutPeriod:       ${payoutPeriod}`)
log(`payoutStart (reg -> payout): ${payoutStart}`)
log(`cycleEnd   (next cycle starts / bump valid): ${cycleEnd}`)

let phase
if (now < payoutStart) phase = `registration (${payoutStart - now} blocks left)`
else if (now < cycleEnd) phase = `payout (${cycleEnd - now} blocks until cycle end)`
else phase = 'cycle ended (bump available now)'
log(`current phase:      ${phase}`)

// Target the next cycle boundary that is still in the future.
let target = cycleEnd
while (target <= now) target += cyclePeriod

// A referendum is enacted at max(At, approvalBlock + minEnactmentPeriod). To hit `target`
// EXACTLY (not clamped later), it must be approved on or before target - minEnactmentPeriod.
// Fastest approval with a single 100% Fellows vote ~ preparePeriod + confirmPeriod after submit.
const fastestApprove = prepare + confirm
const approveBy = target - minEnact
const latestSubmit = approveBy - fastestApprove

log('')
log('================ schedule the referendum ================')
log(`enactment moment MUST be exactly  At: ${target}   <-- the first block bump() is valid`)
log(`  - At ${target - 1} (one early): still the OLD cycle's payout phase -> corrupts in-flight payouts`)
log(`  - At ${target + 1} (one late):  new cycle already bumpable with OLD params -> misses this cycle`)
log(`track ${FELLOWS_TRACK} timing: prepare=${prepare} decision=${decision} confirm=${confirm} minEnactment=${minEnact}`)
log(`must be APPROVED on or before block ${approveBy}  (= target - minEnactmentPeriod), else At gets clamped past ${target}`)
log(`=> submit + place decision deposit + vote no later than ~block ${latestSubmit}`)
log(`   (fastest path; deciding then has up to ${decision} blocks of slack to reach the threshold — submit earlier to be safe)`)
if (latestSubmit <= now) {
  log(`WARNING: target ${target} is too soon from now (${now}); pick the next boundary at ${target + cyclePeriod}`)
}

await api.disconnect()
