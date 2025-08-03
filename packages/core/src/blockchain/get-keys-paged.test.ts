import type { HexString } from '@polkadot/util/types'
import { describe, expect, it, vi } from 'vitest'
import { Api } from '../api.js'
import { RemoteStorageLayer, StorageLayer, type StorageValue, StorageValueKind } from './storage-layer.js'

describe('getKeysPaged', () => {
  const hash = '0x1111111111111111111111111111111111111111111111111111111111111111'

  const remoteKeys = [
    '0x0000000000000000000000000000000000000000000000000000000000000000_00',
    '0x0000000000000000000000000000000000000000000000000000000000000000_03',
    '0x0000000000000000000000000000000000000000000000000000000000000000_04',
    '0x1111111111111111111111111111111111111111111111111111111111111111_01',
    '0x1111111111111111111111111111111111111111111111111111111111111111_02',
    '0x1111111111111111111111111111111111111111111111111111111111111111_03',
    '0x1111111111111111111111111111111111111111111111111111111111111111_06',
    '0x1111111111111111111111111111111111111111111111111111111111111111_07',
    '0x2222222222222222222222222222222222222222222222222222222222222222_21',
    '0x2222222222222222222222222222222222222222222222222222222222222222_23',
    '0x2222222222222222222222222222222222222222222222222222222222222222_26',
    '0x94533e05c34400caee0d8976774f0dd064443ba500633e46053c7a0a68b8ef3392a72b59fc8b67b702000001a12dfa1fa4ab9a0000',
  ]

  Api.prototype.getKeysPaged = vi.fn(async (prefix, pageSize, startKey) => {
    const withPrefix = remoteKeys.filter((k) => k.startsWith(prefix) && k > startKey)
    const result = withPrefix.slice(0, pageSize)
    return result as HexString[]
  })
  Api.prototype.getStorage = vi.fn(async (_key, _at) => {
    return '0x1' as any
  })
  Api.prototype.getStorageBatch = vi.fn(async (_prefix, keys, _at) => keys.map(() => '0x1'))
  const mockApi = new Api(undefined!)

  const remoteLayer = new RemoteStorageLayer(mockApi, hash, undefined)
  const storageLayer = new StorageLayer(remoteLayer)

  it('mocked api works', async () => {
    expect(
      await mockApi.getKeysPaged(
        '0x1111111111111111111111111111111111111111111111111111111111111111',
        1,
        '0x1111111111111111111111111111111111111111111111111111111111111111',
        hash,
      ),
    ).toEqual(['0x1111111111111111111111111111111111111111111111111111111111111111_01'])

    expect(
      await mockApi.getKeysPaged(
        '0x2222222222222222222222222222222222222222222222222222222222222222',
        4,
        '0x2222222222222222222222222222222222222222222222222222222222222222',
        hash,
      ),
    ).toEqual([
      '0x2222222222222222222222222222222222222222222222222222222222222222_21',
      '0x2222222222222222222222222222222222222222222222222222222222222222_23',
      '0x2222222222222222222222222222222222222222222222222222222222222222_26',
    ])

    expect(
      await mockApi.getKeysPaged(
        '0x1111111111111111111111111111111111111111111111111111111111111111',
        10,
        '0x1111111111111111111111111111111111111111111111111111111111111111_02',
        hash,
      ),
    ).toEqual([
      '0x1111111111111111111111111111111111111111111111111111111111111111_03',
      '0x1111111111111111111111111111111111111111111111111111111111111111_06',
      '0x1111111111111111111111111111111111111111111111111111111111111111_07',
    ])

    expect(
      await mockApi.getKeysPaged(
        '0x1111111111111111111111111111111111111111111111111111111111111111',
        2,
        '0x1111111111111111111111111111111111111111111111111111111111111111_04',
        hash,
      ),
    ).toEqual([
      '0x1111111111111111111111111111111111111111111111111111111111111111_06',
      '0x1111111111111111111111111111111111111111111111111111111111111111_07',
    ])

    expect(
      await mockApi.getKeysPaged(
        '0x1111111111111111111111111111111111111111111111111111111111111111',
        2,
        '0x1111111111111111111111111111111111111111111111111111111111111111_07',
        hash,
      ),
    ).toEqual([])
  })

  it('remote layer works', async () => {
    expect(
      await remoteLayer.getKeysPaged(
        '0x0000000000000000000000000000000000000000000000000000000000000000',
        10,
        '0x0000000000000000000000000000000000000000000000000000000000000000',
      ),
    ).toEqual([
      '0x0000000000000000000000000000000000000000000000000000000000000000_00',
      '0x0000000000000000000000000000000000000000000000000000000000000000_03',
      '0x0000000000000000000000000000000000000000000000000000000000000000_04',
    ])
    expect(
      await remoteLayer.getKeysPaged(
        '0x1111111111111111111111111111111111111111111111111111111111111111',
        3,
        '0x1111111111111111111111111111111111111111111111111111111111111111',
      ),
    ).toEqual([
      '0x1111111111111111111111111111111111111111111111111111111111111111_01',
      '0x1111111111111111111111111111111111111111111111111111111111111111_02',
      '0x1111111111111111111111111111111111111111111111111111111111111111_03',
    ])

    expect(
      await remoteLayer.getKeysPaged(
        '0x1111111111111111111111111111111111111111111111111111111111111111',
        10,
        '0x1111111111111111111111111111111111111111111111111111111111111111_03',
      ),
    ).toEqual([
      '0x1111111111111111111111111111111111111111111111111111111111111111_06',
      '0x1111111111111111111111111111111111111111111111111111111111111111_07',
    ])
  })

  it('storage layer works', async () => {
    expect(
      await mockApi.getKeysPaged(
        '0x1111111111111111111111111111111111111111111111111111111111111111',
        1,
        '0x1111111111111111111111111111111111111111111111111111111111111111',
        hash,
      ),
    ).toEqual(['0x1111111111111111111111111111111111111111111111111111111111111111_01'])

    expect(
      await mockApi.getKeysPaged(
        '0x1111111111111111111111111111111111111111111111111111111111111111',
        10,
        '0x1111111111111111111111111111111111111111111111111111111111111111_02',
        hash,
      ),
    ).toEqual([
      '0x1111111111111111111111111111111111111111111111111111111111111111_03',
      '0x1111111111111111111111111111111111111111111111111111111111111111_06',
      '0x1111111111111111111111111111111111111111111111111111111111111111_07',
    ])
  })

  it('updated values', async () => {
    const layer2 = new StorageLayer(storageLayer)
    layer2.setAll([['0x1111111111111111111111111111111111111111111111111111111111111111_04', '0x04']])
    expect(
      await layer2.getKeysPaged(
        '0x1111111111111111111111111111111111111111111111111111111111111111',
        10,
        '0x1111111111111111111111111111111111111111111111111111111111111111_03',
      ),
    ).toEqual([
      '0x1111111111111111111111111111111111111111111111111111111111111111_04',
      '0x1111111111111111111111111111111111111111111111111111111111111111_06',
      '0x1111111111111111111111111111111111111111111111111111111111111111_07',
    ])

    expect(
      await layer2.getKeysPaged(
        '0x1111111111111111111111111111111111111111111111111111111111111111',
        4,
        '0x1111111111111111111111111111111111111111111111111111111111111111',
      ),
    ).toEqual([
      '0x1111111111111111111111111111111111111111111111111111111111111111_01',
      '0x1111111111111111111111111111111111111111111111111111111111111111_02',
      '0x1111111111111111111111111111111111111111111111111111111111111111_03',
      '0x1111111111111111111111111111111111111111111111111111111111111111_04',
    ])

    layer2.setAll([['0x1111111111111111111111111111111111111111111111111111111111111111_00', '0x00']])
    expect(
      await layer2.getKeysPaged(
        '0x1111111111111111111111111111111111111111111111111111111111111111',
        10,
        '0x1111111111111111111111111111111111111111111111111111111111111111',
      ),
    ).toEqual([
      '0x1111111111111111111111111111111111111111111111111111111111111111_00',
      '0x1111111111111111111111111111111111111111111111111111111111111111_01',
      '0x1111111111111111111111111111111111111111111111111111111111111111_02',
      '0x1111111111111111111111111111111111111111111111111111111111111111_03',
      '0x1111111111111111111111111111111111111111111111111111111111111111_04',
      '0x1111111111111111111111111111111111111111111111111111111111111111_06',
      '0x1111111111111111111111111111111111111111111111111111111111111111_07',
    ])

    expect(
      await layer2.getKeysPaged(
        '0x1111111111111111111111111111111111111111111111111111111111111111',
        10,
        '0x1111111111111111111111111111111111111111111111111111111111111111_04',
      ),
    ).toEqual([
      '0x1111111111111111111111111111111111111111111111111111111111111111_06',
      '0x1111111111111111111111111111111111111111111111111111111111111111_07',
    ])

    expect(
      await layer2.getKeysPaged(
        '0x1111111111111111111111111111111111111111111111111111111111111111',
        10,
        '0x1111111111111111111111111111111111111111111111111111111111111111_07',
      ),
    ).toEqual([])

    const layer3 = new StorageLayer(layer2)
    layer3.setAll([
      ['0x1111111111111111111111111111111111111111111111111111111111111111_03', '0x03'],
      ['0x1111111111111111111111111111111111111111111111111111111111111111_04', null],
      ['0x1111111111111111111111111111111111111111111111111111111111111111_06', '0x06'],
    ])

    expect(
      await layer3.getKeysPaged(
        '0x1111111111111111111111111111111111111111111111111111111111111111',
        10,
        '0x1111111111111111111111111111111111111111111111111111111111111111_02',
      ),
    ).toEqual([
      '0x1111111111111111111111111111111111111111111111111111111111111111_03',
      '0x1111111111111111111111111111111111111111111111111111111111111111_06',
      '0x1111111111111111111111111111111111111111111111111111111111111111_07',
    ])

    const layer4 = new StorageLayer(layer3)
    layer4.setAll([
      ['0x1111111111111111111111111111111111111111111111111111111111111111_03', null],
      ['0x1111111111111111111111111111111111111111111111111111111111111111_04', '0x04'],
      ['0x1111111111111111111111111111111111111111111111111111111111111111_06', null],
      ['0x1111111111111111111111111111111111111111111111111111111111111111_08', '0x08'],
    ])

    expect(
      await layer4.getKeysPaged(
        '0x1111111111111111111111111111111111111111111111111111111111111111',
        10,
        '0x1111111111111111111111111111111111111111111111111111111111111111_02',
      ),
    ).toEqual([
      '0x1111111111111111111111111111111111111111111111111111111111111111_04',
      '0x1111111111111111111111111111111111111111111111111111111111111111_07',
      '0x1111111111111111111111111111111111111111111111111111111111111111_08',
    ])

    const layer5 = new StorageLayer(layer4)
    layer5.setAll([
      ['0x1111111111111111111111111111111111111111111111111111111111111111', StorageValueKind.DeletedPrefix],
      ['0x1111111111111111111111111111111111111111111111111111111111111111_09', '0x09'],
    ])
    expect(
      await layer5.getKeysPaged(
        '0x1111111111111111111111111111111111111111111111111111111111111111',
        10,
        '0x1111111111111111111111111111111111111111111111111111111111111111',
      ),
    ).toEqual(['0x1111111111111111111111111111111111111111111111111111111111111111_09'])

    const layer6 = new StorageLayer(layer5)
    layer6.setAll([
      ['0x1111111111111111111111111111111111111111111111111111111111111111', StorageValueKind.DeletedPrefix],
    ])
    expect(
      await layer6.getKeysPaged(
        '0x1111111111111111111111111111111111111111111111111111111111111111',
        10,
        '0x1111111111111111111111111111111111111111111111111111111111111111',
      ),
    ).toEqual([])

    layer6.setAll([
      [
        '0x94533e05c34400caee0d8976774f0dd064443ba500633e46053c7a0a68b8ef3392a72b59fc8b67b7020000e8d2a526a4a22d1e0300000000',
        '0x01',
      ],
      [
        '0x99971b5749ac43e0235e41b0d37869188ee7418a6531173d60d1f6a82d8f4d5143ce24f679759c60d1cd42f70aeae77f6d6f646c6163612f636470740000000000000000000000000000000000000000d67c5ba80ba065480001',
        '0x01',
      ],
    ])

    expect(
      await layer6.getKeysPaged(
        '0x94533e05c34400caee0d8976774f0dd064443ba500633e46053c7a0a68b8ef3392a72b59fc8b67b7020000',
        10,
        '0x94533e05c34400caee0d8976774f0dd064443ba500633e46053c7a0a68b8ef3392a72b59fc8b67b7020000',
      ),
    ).toEqual([
      '0x94533e05c34400caee0d8976774f0dd064443ba500633e46053c7a0a68b8ef3392a72b59fc8b67b702000001a12dfa1fa4ab9a0000',
      '0x94533e05c34400caee0d8976774f0dd064443ba500633e46053c7a0a68b8ef3392a72b59fc8b67b7020000e8d2a526a4a22d1e0300000000',
    ])
  })

  it('firstKey is checked properly', async () => {
    const layer2 = new StorageLayer(storageLayer)
    layer2.setAll([
      ['0x1111111111111111111111111111111111111111111111111111111111111111_00', '0x00'],
      ['0xcd710b30bd2eab0352ddcc26417aa19463c716fb8fff3de61a883bb76adb34a2', '0x00'],
    ])

    expect(
      await layer2.getKeysPaged(
        '0xcd710b30bd2eab0352ddcc26417aa19463c716fb8fff3de61a883bb76adb34a2',
        1,
        '0xcd710b30bd2eab0352ddcc26417aa19463c716fb8fff3de61a883bb76adb34a2',
      ),
    ).toEqual([])

    const layer3 = new StorageLayer(layer2)
    layer3.setAll([['0x1111111111111111111111111111111111111111111111111111111111111111_01', '0x01']])

    expect(
      await layer3.getKeysPaged(
        '0xcd710b30bd2eab0352ddcc26417aa19463c716fb8fff3de61a883bb76adb34a2',
        1,
        '0xcd710b30bd2eab0352ddcc26417aa19463c716fb8fff3de61a883bb76adb34a2',
      ),
    ).toEqual([])

    layer3.setAll([['0xcd710b30bd2eab0352ddcc26417aa19463c716fb8fff3de61a883bb76adb34a2_01', '0x01']])
    expect(
      await layer3.getKeysPaged(
        '0xcd710b30bd2eab0352ddcc26417aa19463c716fb8fff3de61a883bb76adb34a2',
        1,
        '0xcd710b30bd2eab0352ddcc26417aa19463c716fb8fff3de61a883bb76adb34a2',
      ),
    ).toEqual(['0xcd710b30bd2eab0352ddcc26417aa19463c716fb8fff3de61a883bb76adb34a2_01'])
  })

  it('deleted key is ignored', async () => {
    const pages = [
      {
        1: '0x1',
        2: '0x2',
        3: '0x3',
        8: '0x8',
      },
      {
        3: StorageValueKind.Deleted,
        7: '0x7',
      },
      {
        1: StorageValueKind.Deleted,
        7: '0x77',
        8: StorageValueKind.Deleted,
        9: '0x9',
      },
      {
        3: '0x33',
        4: '0x4',
      },
    ]

    const prefix = '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff'
    const makeKey = (x: string) => `${prefix}_${Number(x).toString().padStart(2, '0')}`

    // build layers
    const layers: StorageLayer[] = []
    for (const page of pages) {
      const layer = new StorageLayer(layers[layers.length - 1])
      layer.setAll(Object.entries(page).map(([k, v]) => [makeKey(k), v] as [string, StorageValue]))
      layers.push(layer)
    }

    // last layer
    expect(await layers[3].getKeysPaged(prefix, 100, prefix)).toEqual([
      '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff_02',
      '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff_03',
      '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff_04',
      '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff_07',
      '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff_09',
    ])

    expect(
      await layers[3].getKeysPaged(
        prefix,
        100,
        '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff_05',
      ),
    ).toEqual([
      '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff_07',
      '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff_09',
    ])

    expect(
      await layers[3].getKeysPaged(
        prefix,
        100,
        '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff_08',
      ),
    ).toEqual(['0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff_09'])

    expect(
      // previous layer
      await layers[2].getKeysPaged(prefix, 100, prefix),
    ).toEqual([
      '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff_02',
      '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff_07',
      '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff_09',
    ])

    expect(
      // previous layer
      await layers[1].getKeysPaged(prefix, 100, prefix),
    ).toEqual([
      '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff_01',
      '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff_02',
      '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff_07',
      '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff_08',
    ])

    expect(
      // previous layer
      await layers[1].getKeysPaged(
        prefix,
        100,
        '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff_02',
      ),
    ).toEqual([
      '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff_07',
      '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff_08',
    ])
  })

  it('fuzz', async () => {
    const oddPrefix = '0x1111111111111111111111111111111111111111111111111111111111111111'
    const evenPrefix = '0x2222222222222222222222222222222222222222222222222222222222222222'
    const makeKey = (x: number) => `${x % 2 === 0 ? evenPrefix : oddPrefix}_${x.toString().padStart(2, '0')}`

    // create some random keys
    const pages: number[][] = []
    let p = Math.floor(Math.random() * 10) + 5
    while (p) {
      p--
      const page: number[] = []
      let i = Math.floor(Math.random() * 10) + 5
      while (i) {
        i--
        page.push(Math.floor(Math.random() * 30) + 1)
      }
      pages.push(page)
    }

    // build layers
    const layers: StorageLayer[] = []
    for (const page of pages) {
      const layer = new StorageLayer(layers[layers.length - 1])
      layer.setAll(page.map((x) => [makeKey(x), `0x${Number(x).toString(16)}`] as [string, StorageValue]))
      layers.push(layer)
    }

    const allKeys = pages
      .flat()
      .reduce((acc, x) => {
        if (acc.includes(x)) {
          return acc
        }
        acc.push(x)
        return acc
      }, [] as number[])
      .sort((a, b) => a - b)
      .map(makeKey)

    const oddKeys = await layers[layers.length - 1].getKeysPaged(oddPrefix, 100, oddPrefix)
    expect(oddKeys, 'oddKeys').toEqual(allKeys.filter((x) => x.startsWith(oddPrefix)))

    const evenKeys = await layers[layers.length - 1].getKeysPaged(evenPrefix, 100, evenPrefix)
    expect(evenKeys, 'evenKeys').toEqual(allKeys.filter((x) => x.startsWith(evenPrefix)))
  })
})
