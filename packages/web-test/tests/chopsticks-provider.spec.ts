import { ApiPromise } from '@polkadot/api'
import { Keyring } from '@polkadot/keyring'
import { Page, expect, test } from '@playwright/test'

// Not working:
// 1. globalThis.api cannot be correctly evaluate by playwright, all api.rpc method gives undefined.
// 2. if init api promise inside this test, chopsticks worker cannot be created inside a playwright test worker
test.describe.skip('chopsticks provider', async () => {
  let page: Page
  let api: ApiPromise

  const keyring = new Keyring({ type: 'ed25519' })
  const alice = keyring.addFromUri('//Alice') // 5FA9nQDVg267DEd8m1ZypXLBnvN7SFxYwV7ndqSYGiN9TTpu

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(60000)
    page = await browser.newPage()
    await page.goto('/')
    await page.waitForLoadState()
    await expect(page.getByText('Save')).toBeDisabled()
    // sleep
    await new Promise((resolve) => setTimeout(resolve, 10000))
    api = await page.evaluate(() => globalThis.api)
  })

  test.afterAll(async () => {
    await api.disconnect()
  })

  test('chain rpc', async () => {
    const hashHead = '0x0df086f32a9c3399f7fa158d3d77a1790830bd309134c5853718141c969299c7'
    const hash0 = '0xfc41b9bd8ef8fe53d58c7ea67c794c7ec9a73daf05e6d54b14ff6342c99ba64c'
    const hash1000 = '0x1d2927c6b4aca4c42cb1f88ed7fa46dc53118bb00370475aaf514ac88933e3cc'

    // const api = await page.evaluate(() => globalThis.api)

    expect(await api.rpc.chain.getBlockHash()).toMatch(hashHead)
    expect(await api.rpc.chain.getBlockHash(0)).toMatch(hash0)
    expect(await api.rpc.chain.getBlockHash(1000)).toMatch(hash1000)

    expect(await api.rpc.chain.getFinalizedHead()).toMatch(hashHead)
  })

  test('state rpc', async () => {
    expect(await api.rpc.state.getRuntimeVersion()).toMatchSnapshot()
    expect(
      await api.rpc.state.getMetadata('0x0df086f32a9c3399f7fa158d3d77a1790830bd309134c5853718141c969299c7'),
    ).toMatchSnapshot()
    const genesisHash = await api.rpc.chain.getBlockHash(0)
    expect(await api.rpc.state.getMetadata(genesisHash)).not.toEqual(await api.rpc.state.getMetadata())
  })

  test('system rpc', async () => {
    expect(await api.rpc.system.chain()).toMatch('Acala')
    expect(await api.rpc.system.name()).toMatch('Subway')
    expect(await api.rpc.system.version()).toBeInstanceOf(String)
    expect(await api.rpc.system.properties()).not.toBeNull()
    expect(await api.rpc.system.health()).toMatchObject({
      peers: 0,
      isSyncing: false,
      shouldHavePeers: false,
    })
  })

  test('handles tx', async () => {
    const nonce = async (address: string) => (await api.query.system.account(address)).nonce.toNumber()
    await api.tx.balances.transfer('5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY', 0).signAndSend(alice)

    expect(await nonce(alice.address)).toBe(0)
  })
})
