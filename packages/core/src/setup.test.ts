import { expect, test } from 'vitest'
import { processOptions, setup } from './setup.js'

test('handle invalid block ', async () => {
  await expect(setup({ endpoint: 'wss://acala-rpc.aca-api.network', block: '0x' })).rejects.toThrow('invalid length')
  await expect(setup({ endpoint: 'wss://acala-rpc.aca-api.network', block: 999999999 })).rejects.toThrow(
    'Cannot find block hash for 999999999',
  )
  await expect(
    setup({
      endpoint: 'wss://acala-rpc.aca-api.network',
      block: '0xc87ae632b2cc4583a37659785f5098947acfdc6a36dbb07abcfa6ad694f97c5d',
    }),
  ).rejects.toThrow('Cannot find header for 0xc87ae632b2cc4583a37659785f5098947acfdc6a36dbb07abcfa6ad694f97c5d')
})

test('block option type processing is correct', async () => {
  const nullBlock = await processOptions({
    endpoint: 'wss://acala-rpc.aca-api.network',
  })
  expect(nullBlock.block).toBeUndefined()
  expect(nullBlock.blockHash).toBeDefined()

  const hexStringBlock = await processOptions({
    endpoint: 'wss://acala-rpc.aca-api.network',
    block: '0x3a9a2d71537ceedff1a3895d68456f4a870bb89ab649fd47c6cf9c4f9731d580',
  })
  expect(hexStringBlock.blockHash).toBe('0x3a9a2d71537ceedff1a3895d68456f4a870bb89ab649fd47c6cf9c4f9731d580')

  const hexNumberBlock = await processOptions({
    endpoint: 'wss://acala-rpc.aca-api.network',
    block: 0x44aa20,
  })
  expect(hexNumberBlock.block).toBe(4500000)

  const integerBlock = await processOptions({
    endpoint: 'wss://acala-rpc.aca-api.network',
    block: 4500000,
  })
  expect(integerBlock.block).toBe(4500000)
})
