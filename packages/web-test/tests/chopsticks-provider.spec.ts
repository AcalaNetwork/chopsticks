import '@polkadot/api-augment'
import { ApiPromise } from '@polkadot/api'
import { ChopsticksProvider } from '@acala-network/chopsticks-core'
import { HexString } from '@polkadot/util/types'
import { Keyring } from '@polkadot/keyring'
import { Page, expect, test } from '@playwright/test'

// TODO: fix test timeout in connect -> setStorage
test.describe('chopsticks provider', async () => {
  const keyring = new Keyring({ type: 'ed25519' })
  const alice = keyring.addFromUri('//Alice')
  const bob = keyring.addFromUri('//Bob')

  let page: Page
  let api: ApiPromise
  let chopsticksProvider: ChopsticksProvider

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(5 * 60000)
    page = await browser.newPage()
    await page.goto('/')
    await page.waitForLoadState()
    // await expect(page.getByText('Save')).toBeDisabled()

    chopsticksProvider = new ChopsticksProvider({
      endpoint: 'wss://acala-rpc-0.aca-api.network',
      // 3,800,000
      blockHash: '0x0df086f32a9c3399f7fa158d3d77a1790830bd309134c5853718141c969299c7' as HexString,
      storageValues: {
        System: {
          Account: [
            [[alice.address], { data: { free: 1 * 1e12 } }],
            [[bob.address], { data: { free: 1 * 1e12 } }],
          ],
        },
        Sudo: {
          Key: alice.address,
        },
      },
    })
    api = await ApiPromise.create({
      provider: chopsticksProvider,
    })
    await api.isReady
  })

  test.afterAll(async () => {
    await api.disconnect()
  })

  test.only('chain rpc', async () => {
    const hashHead = '0x0df086f32a9c3399f7fa158d3d77a1790830bd309134c5853718141c969299c7'
    const hash0 = '0xfc41b9bd8ef8fe53d58c7ea67c794c7ec9a73daf05e6d54b14ff6342c99ba64c'
    const hash1000 = '0x1d2927c6b4aca4c42cb1f88ed7fa46dc53118bb00370475aaf514ac88933e3cc'

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
    const keyring = new Keyring({ type: 'ed25519' })
    const alice = keyring.addFromUri('//Alice')
    const bob = keyring.addFromUri('//Bob')

    await api.tx.balances.transfer(bob.address, 1000).signAndSend(alice)
    await api.rpc('new_block')

    const bobAccount = await api.query.system.account(bob.address)
    expect(bobAccount.data.free.toHuman()).toBe(`${1 * 1e12 + 1000}`)
  })
})
