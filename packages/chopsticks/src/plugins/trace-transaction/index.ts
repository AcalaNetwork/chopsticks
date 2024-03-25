import { Argv } from 'yargs'
import { BN, hexToU8a, u8aToHex } from '@polkadot/util'
import { Block, pinoLogger } from '@acala-network/chopsticks-core'
import { blake2AsHex } from '@polkadot/util-crypto'
import { writeFileSync } from 'fs'
import { z } from 'zod'

import { configSchema, getYargsOptions } from '../../schema/index.js'
import { overrideWasm } from '../../utils/override.js'
import { setupContext } from '../../context.js'

const ACALA_ETH_RPC = 'https://eth-rpc-acala.aca-api.network'
const KARURA_ETH_RPC = 'https://eth-rpc-karura.aca-api.network'

const schema = configSchema.extend({
  vm: z.boolean({ description: 'Trace VM opcode' }).optional(),
  output: z.string({ description: 'Output file' }),
})

export const cli = (y: Argv) => {
  y.command(
    'trace-transaction <tx-hash>',
    'EVM+ trace transaction. Only Acala and Karura are supported',
    (yargs) =>
      yargs.options(getYargsOptions(schema.shape)).positional('tx-hash', {
        desc: 'Transaction hash',
        type: 'string',
      }),
    async (argv) => {
      const config = schema.parse(argv)
      const wasm = config['wasm-override']
      if (!wasm) {
        throw new Error('Wasm override built with feature `tracing` is required')
      }
      delete config['wasm-override']
      const context = await setupContext(config, false)
      const txHash = argv['tx-hash']

      const specName = (await context.chain.head.runtimeVersion).specName.toString()
      let ethRpc: string | undefined
      if (specName.includes('acala')) {
        ethRpc = ACALA_ETH_RPC
      } else if (specName.includes('karura')) {
        ethRpc = KARURA_ETH_RPC
      } else {
        throw new Error(`Unsupported chain. Only Acala and Karura are supported`)
      }

      pinoLogger.info(`Using ${specName} chain`)
      pinoLogger.info(`Fetching evm transaction...`)

      const response = await fetch(ethRpc, {
        headers: [
          ['Content-Type', 'application/json'],
          ['Accept', 'application/json'],
        ],
        method: 'POST',
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getTransactionByHash', params: [txHash] }),
      })
      const data = await response.json()
      if (data.error) {
        throw new Error(data.error.message)
      }
      pinoLogger.trace({ transaction: data.result }, 'Transaction fetched')
      const { from, to, value, input, blockHash } = data.result

      const block = await context.chain.getBlock(blockHash)
      if (!block) {
        throw new Error(`Block not found ${blockHash}`)
      }
      const header = await block.header
      const parent = await context.chain.getBlock(header.parentHash.toHex())
      if (!parent) {
        throw new Error(`Block not found ${blockHash}`)
      }
      await context.chain.setHead(parent)
      await overrideWasm(context.chain, wasm)
      const extrinsics = await block.extrinsics
      const txIndex = extrinsics.findIndex((tx) => blake2AsHex(tx) === txHash)

      const newBlock = new Block(context.chain, block.number, blockHash, parent, {
        header,
        extrinsics: [],
        storage: parent.storage,
      })

      const meta = await newBlock.meta
      meta.registry.register({
        Step: {
          op: 'String',
          pc: 'Compact<u64>',
          depth: 'Compact<u32>',
          gas: 'Compact<u64>',
          stack: 'Vec<H256>',
          memory: 'Option<Bytes>',
        },
        TraceVM: {
          gas: 'Compact<u64>',
          returnValue: 'H256',
          structLogs: 'Vec<Step>',
        },
        CallType: {
          _enum: {
            CALL: null,
            CALLCODE: null,
            STATICCALL: null,
            DELEGATECALL: null,
            CREATE: null,
            SUICIDE: null,
          },
        },
        CallTrace: {
          type: 'CallType',
          from: 'H160',
          to: 'H160',
          input: 'Bytes',
          value: 'U256',
          gas: 'Compact<u64>',
          gasUsed: 'Compact<u64>',
          output: 'Option<Bytes>',
          error: 'Option<String>',
          revertReason: 'Option<String>',
          depth: 'Compact<u32>',
          calls: 'Vec<CallTrace>',
        },
      })

      const tx = meta.registry.createType('Extrinsic', hexToU8a(extrinsics[txIndex]))
      pinoLogger.trace({ extrinsic: tx.toHuman() }, 'Decode extrinsic...')

      if (tx.method.section.toString() !== 'evm') {
        throw new Error(`Unsupported extrinsic ${tx.method.toString()}`)
      }

      let gasLimit: BN
      let storageLimit: BN
      switch (tx.method.method.toString()) {
        case 'call':
        case 'create2':
        case 'ethCall': {
          gasLimit = tx.method.args[3] as any
          storageLimit = tx.method.args[4] as any
          break
        }
        case 'create': {
          gasLimit = tx.method.args[2] as any
          storageLimit = tx.method.args[3] as any
          break
        }
        case 'ethCallV2': {
          const GAS_MASK = new BN(100000)
          const STORAGE_MASK = new BN(100)
          const GAS_LIMIT_CHUNK = new BN(30000)
          const MAX_GAS_LIMIT_CC = new BN(21) // log2(BLOCK_STORAGE_LIMIT)

          const bbbcc = new BN((tx.method.args[4] as any).toBigInt()).mod(GAS_MASK)
          const encodedGasLimit = bbbcc.div(STORAGE_MASK) // bbb
          const encodedStorageLimit = bbbcc.mod(STORAGE_MASK) // cc

          gasLimit = encodedGasLimit.mul(GAS_LIMIT_CHUNK)
          storageLimit = new BN(2).pow(
            encodedStorageLimit.gt(MAX_GAS_LIMIT_CC) ? MAX_GAS_LIMIT_CC : encodedStorageLimit,
          )
          break
        }
        default:
          throw new Error(`Unsupported method ${tx.method.method.toString()}`)
      }

      pinoLogger.trace(
        { gasLimit: gasLimit.toString(), storageLimit: storageLimit.toString() },
        'Gas and storage limit',
      )
      pinoLogger.info('Preparing block...')

      const { storageDiff } = await newBlock.call('Core_initialize_block', [header.toHex()])
      newBlock.pushStorageLayer().setAll(storageDiff)
      for (const extrinsic of extrinsics.slice(0, txIndex)) {
        const { storageDiff } = await newBlock.call('BlockBuilder_apply_extrinsic', [extrinsic])
        newBlock.pushStorageLayer().setAll(storageDiff)
      }

      pinoLogger.info('Running evm trace...')
      const call = config.vm ? 'EVMTraceApi_trace_vm' : 'EVMTraceApi_trace_call'
      const res = await newBlock.call(call, [
        from,
        to || '0x0000000000000000000000000000000000000000',
        u8aToHex(meta.registry.createType('Vec<u8>', input).toU8a()),
        u8aToHex(meta.registry.createType('Balance', hexToU8a(value)).toU8a()),
        u8aToHex(meta.registry.createType('u64', gasLimit).toU8a()),
        u8aToHex(meta.registry.createType('u32', storageLimit).toU8a()),
        '0x00', // empty access list
      ])

      const result = meta.registry
        .createType<any>(`Result<${config.vm ? 'TraceVM' : 'Vec<CallTrace>'}, DispatchError>`, res.result)
        .asOk.toJSON()

      writeFileSync(argv.output, JSON.stringify(result, null, 2))
      pinoLogger.info(`Complete ${argv.output}`)
      process.exit(0)
    },
  )
}
