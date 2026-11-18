import { TypeRegistry } from '@polkadot/types'
import { decorateStorage } from '@polkadot/types/metadata/decorate'
import { describe, expect, it, vi } from 'vitest'

import type { Api } from '../api.js'
import { Block } from '../blockchain/block.js'
import { Blockchain } from '../blockchain/index.js'
import { StorageLayer } from '../blockchain/storage-layer.js'
import { BuildBlockMode, type DownwardMessage } from '../blockchain/txpool.js'
import { compactHex } from '../utils/index.js'
import { connectDownward } from './downward.js'

const registry = new TypeRegistry()
const paraId = 1000

const map = (name: string, key: number, value: number, hashers = ['Twox64Concat']) => ({
  name,
  modifier: 'Optional',
  type: { map: { key, value, hashers } },
})

const dmpMeta = (paged: boolean) => {
  const items = paged
    ? [
        map('DownwardMessageQueueMeta', 0, 4),
        map('DownwardMessageQueuePages', 5, 6, ['Blake2_128Concat', 'Twox64Concat']),
      ]
    : [map('DownwardMessageQueues', 0, 7)]
  const metadata = registry.createType('MetadataLatest', {
    lookup: {
      types: [
        { id: 0, type: { def: { primitive: 'U32' } } },
        { id: 1, type: { def: { primitive: 'U64' } } },
        { id: 2, type: { def: { primitive: 'U8' } } },
        { id: 3, type: { def: { sequence: { type: 2 } } } },
        {
          id: 4,
          type: {
            def: {
              composite: {
                fields: [
                  { name: 'first_full', type: 1 },
                  { name: 'first_free', type: 1 },
                ],
              },
            },
          },
        },
        { id: 5, type: { def: { tuple: [0, 1] } } },
        {
          id: 6,
          type: {
            path: ['polkadot_core_primitives', 'InboundDownwardMessage'],
            def: {
              composite: {
                fields: [
                  { name: 'sent_at', type: 0 },
                  { name: 'msg', type: 3 },
                ],
              },
            },
          },
        },
        { id: 7, type: { def: { sequence: { type: 6 } } } },
        { id: 8, type: { def: { array: { len: 32, type: 2 } } } },
        { id: 9, type: { def: { primitive: 'U16' } } },
      ],
    },
    pallets: [{ name: 'Dmp', storage: { prefix: 'Dmp', items } }],
  })
  registry.setLookup(metadata.lookup)
  return { query: decorateStorage(registry, metadata, 16), registry, consts: {}, errors: {}, events: {}, tx: {} }
}

const legacy = dmpMeta(false)
const paged = dmpMeta(true)
const createType = (id: number, value: unknown) => registry.createType(registry.createLookupType(id), value).toHex()

describe('connectDownward', () => {
  it.each([false, true])('drains the paged queue in FIFO order (runtime upgrade: %s)', async (upgrade) => {
    const createChain = () =>
      new Blockchain({
        api: {} as Api,
        inherentProviders: [],
        registeredTypes: {},
        buildBlockMode: BuildBlockMode.Manual,
        header: { number: 0, hash: '0x00' },
      })
    const relay = createChain()
    const para = createChain()
    vi.spyOn(para.head, 'meta', 'get').mockResolvedValue({ ...paged, query: { parachainInfo: {} } })
    vi.spyOn(para.head, 'read').mockResolvedValue(registry.createType('u32', paraId))

    const nextHead = async (meta: typeof paged, storageDiff: Record<string, string>) => {
      const number = relay.head.number + 1
      const head = new Block(relay, number, registry.createType('u32', number).toHex(), undefined, {
        header: registry.createType('Header'),
        extrinsics: [],
        storage: number === 1 ? new StorageLayer() : relay.head.storage,
        storageDiff,
      })
      vi.spyOn(head, 'meta', 'get').mockResolvedValue(meta)
      await relay.setHead(head)
      return head
    }

    await nextHead(upgrade ? legacy : paged, {})
    await connectDownward(relay, para)

    const { downwardMessageQueueMeta, downwardMessageQueuePages } = paged.query.dmp
    const metaKey = compactHex(downwardMessageQueueMeta(paraId))
    const legacyKey = compactHex(legacy.query.dmp.downwardMessageQueues(paraId))
    const first = 2n ** 53n + 1n
    const page = (index: bigint, id = paraId) => compactHex(downwardMessageQueuePages(id, index))
    const queue = (firstFull: bigint, firstFree: bigint) => createType(4, { firstFull, firstFree })
    const messages: DownwardMessage[] = [
      { sentAt: 10, msg: '0x01a2' },
      { sentAt: 11, msg: '0x02b3' },
      { sentAt: 12, msg: '0x03c4' },
    ]
    const stalePage = createType(6, { sentAt: 9, msg: '0x04d5' })
    const head = await nextHead(paged, {
      [metaKey]: queue(first, first + 2n),
      [page(first + 1n)]: createType(6, messages[1]),
      [page(first)]: createType(6, messages[0]),
      [page(first - 1n)]: stalePage,
      [page(first, paraId + 1)]: stalePage,
      [legacyKey]: createType(7, [messages[2]]),
    })

    expect(para.txPool.dmp).toEqual(messages)
    expect(await head.get(metaKey)).toBe(queue(first + 2n, first + 2n))
    expect(await head.getMany([page(first), page(first + 1n), legacyKey])).toEqual([undefined, undefined, undefined])
    expect(await head.getMany([page(first - 1n), page(first, paraId + 1)])).toEqual([stalePage, stalePage])

    await nextHead(paged, {})
    expect(para.txPool.dmp).toEqual(messages)
    const appended = { sentAt: 13, msg: '0x05e6' }
    await nextHead(paged, {
      [metaKey]: queue(first + 2n, first + 3n),
      [page(first + 2n)]: createType(6, appended),
    })
    expect(para.txPool.dmp).toEqual([...messages, appended])
  })
})
