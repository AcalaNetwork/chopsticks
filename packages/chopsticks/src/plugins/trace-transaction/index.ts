import { Argv } from 'yargs'
import { BN, hexToU8a, u8aToHex } from '@polkadot/util'
import { Block, RuntimeVersion, pinoLogger } from '@acala-network/chopsticks-core'
import { Registry } from '@polkadot/types/types'
import { blake2AsHex } from '@polkadot/util-crypto'
import { writeFileSync } from 'fs'
import { z } from 'zod'
import _ from 'lodash'

import { DecoratedMeta } from '@polkadot/types/metadata/decorate/types'
import { HexString } from '@polkadot/util/types'
import { configSchema, getYargsOptions } from '../../schema/index.js'
import { overrideWasm } from '../../utils/override.js'
import { setupContext } from '../../context.js'

const registerTypes = (registry: Registry) => {
  registry.register({
    Step: {
      op: 'u8',
      pc: 'Compact<u32>',
      depth: 'Compact<u32>',
      gas: 'Compact<u64>',
      stack: 'Vec<Bytes>',
      memory: 'Option<Bytes>',
    },
    TraceVM: {
      gas: 'Compact<u64>',
      returnValue: 'Bytes',
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
}

const fetchRuntime = async (runtimeVersion: RuntimeVersion) => {
  const GIHTUB_RELEASES_API = 'https://api.github.com/repos/AcalaNetwork/Acala/releases'

  const assetName = `${runtimeVersion.specName}_runtime_tracing_${runtimeVersion.specVersion}.compact.compressed.wasm`
  pinoLogger.info({ assetName }, 'Search for runtime with tracing feature from Github releases ...')
  const releases = await fetch(GIHTUB_RELEASES_API).then((res) => res.json())
  for (const release of releases) {
    if (release.assets) {
      for (const asset of release.assets) {
        if (asset.name === assetName) {
          pinoLogger.info({ url: asset.browser_download_url }, 'Downloading ...')
          const runtime = await fetch(asset.browser_download_url).then((x) => x.arrayBuffer())
          return Buffer.from(runtime)
        }
      }
    }
  }
}

const fetchTransaction = async (runtimeVersion: RuntimeVersion, txHash: string) => {
  const ACALA_ETH_RPC = 'https://eth-rpc-acala.aca-api.network'
  const KARURA_ETH_RPC = 'https://eth-rpc-karura.aca-api.network'

  let ethRpc: string | undefined
  if (runtimeVersion.specName.includes('acala')) {
    ethRpc = ACALA_ETH_RPC
  } else if (runtimeVersion.specName.includes('karura')) {
    ethRpc = KARURA_ETH_RPC
  } else {
    throw new Error(`Unsupported chain. Only Acala and Karura are supported`)
  }

  pinoLogger.info(`Fetching EVM transaction ...`)

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
  return data.result
}

const decodeExtrinsic = (meta: DecoratedMeta, tx: HexString): [BN, BN] => {
  const extrinsic = meta.registry.createType('Extrinsic', hexToU8a(tx))
  pinoLogger.trace({ extrinsic: extrinsic.toHuman() }, 'Extrinsic decoded')

  if (extrinsic.method.section.toString() !== 'evm') {
    throw new Error(`Unsupported extrinsic ${extrinsic.method.toString()}`)
  }

  switch (extrinsic.method.method.toString()) {
    case 'call':
    case 'create2':
    case 'ethCall': {
      const gasLimit = extrinsic.method.args[3] as any
      const storageLimit = extrinsic.method.args[4] as any
      return [gasLimit, storageLimit]
    }
    case 'create': {
      const gasLimit = extrinsic.method.args[2] as any
      const storageLimit = extrinsic.method.args[3] as any
      return [gasLimit, storageLimit]
    }
    case 'ethCallV2': {
      const GAS_MASK = new BN(100000)
      const STORAGE_MASK = new BN(100)
      const GAS_LIMIT_CHUNK = new BN(30000)
      const MAX_GAS_LIMIT_CC = new BN(21) // log2(BLOCK_STORAGE_LIMIT)

      const bbbcc = new BN((extrinsic.method.args[4] as any).toBigInt()).mod(GAS_MASK)
      const encodedGasLimit = bbbcc.div(STORAGE_MASK) // bbb
      const encodedStorageLimit = bbbcc.mod(STORAGE_MASK) // cc

      const gasLimit = encodedGasLimit.mul(GAS_LIMIT_CHUNK)
      const storageLimit = new BN(2).pow(
        encodedStorageLimit.gt(MAX_GAS_LIMIT_CC) ? MAX_GAS_LIMIT_CC : encodedStorageLimit,
      )
      return [gasLimit, storageLimit]
    }
    default:
      throw new Error(`Unsupported method ${extrinsic.method.method.toString()}`)
  }
}

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
        required: true,
      }),
    async (argv) => {
      const config = schema.parse(argv)
      let wasm: string | Buffer | undefined = config['wasm-override']
      delete config['wasm-override']

      const context = await setupContext(config, false)
      const txHash = argv['tx-hash']
      if (!txHash) {
        throw new Error('tx-hash is required')
      }

      const transaction = await fetchTransaction(await context.chain.head.runtimeVersion, txHash)
      pinoLogger.trace({ transaction }, 'Transaction fetched')
      const { from, to, value, input, blockHash } = transaction

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

      // override wasm with tracing feature
      if (typeof wasm === 'string') {
        await overrideWasm(context.chain, wasm)
      } else {
        // Fetch runtime wasm with tracing feature from Github releases
        if (!wasm) {
          wasm = await fetchRuntime(await context.chain.head.runtimeVersion)
          if (!wasm) {
            throw new Error(
              'Could not find runtime with tracing feature from Github releasesw. Make sure to manually override runtime wasm built with `tracing` feature enabled.',
            )
          }
        }

        context.chain.head.setWasm(`0x${wasm.toString('hex')}`)
      }

      const runtimeVersion = await context.chain.head.runtimeVersion
      pinoLogger.info(
        `Running EVM trace on ${_.capitalize(runtimeVersion.specName)} with specVersion: ${runtimeVersion.specVersion}`,
      )

      const extrinsics = await block.extrinsics
      const txIndex = extrinsics.findIndex((tx) => blake2AsHex(tx) === txHash)

      const newBlock = new Block(context.chain, block.number, blockHash, parent, {
        header,
        extrinsics: [],
        storage: parent.storage,
      })

      const meta = await newBlock.meta
      registerTypes(meta.registry)

      const [gasLimit, storageLimit] = decodeExtrinsic(meta, extrinsics[txIndex])

      pinoLogger.trace(
        { gasLimit: gasLimit.toString(), storageLimit: storageLimit.toString() },
        'Gas and storage limit',
      )
      pinoLogger.info(`Preparing block ${context.chain.head.number + 1} ...`)

      const { storageDiff } = await newBlock.call('Core_initialize_block', [header.toHex()])
      newBlock.pushStorageLayer().setAll(storageDiff)
      for (const extrinsic of extrinsics.slice(0, txIndex)) {
        const { storageDiff } = await newBlock.call('BlockBuilder_apply_extrinsic', [extrinsic])
        newBlock.pushStorageLayer().setAll(storageDiff)
      }

      pinoLogger.info('Running EVM trace ...')
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

      const traceLogs = meta.registry
        .createType<any>(`Result<${config.vm ? 'TraceVM' : 'Vec<CallTrace>'}, DispatchError>`, res.result)
        .asOk.toJSON()

      writeFileSync(argv.output, JSON.stringify(traceLogs, null, 2))
      pinoLogger.info(`Trace logs: ${argv.output}`)
      process.exit(0)
    },
  )
}
