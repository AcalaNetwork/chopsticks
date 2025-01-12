import { Block, type Blockchain, type RuntimeVersion, pinoLogger } from '@acala-network/chopsticks-core'
import { blake2AsHex } from '@polkadot/util-crypto'
import type { HexString } from '@polkadot/util/types'
import _ from 'lodash'

import { overrideWasm } from '../../utils/override.js'
import { opName } from './table.js'
import { type Step, type TraceOutcome, registerTypes } from './types.js'

/**
 * Fetches the runtime with tracing feature from Github releases.
 * @param runtimeVersion - The version of the runtime.
 * @returns A Promise that resolves to the fetched runtime as a Buffer.
 */
export const fetchRuntime = async (runtimeVersion: RuntimeVersion) => {
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

export const fetchEVMTransaction = async (runtimeVersion: RuntimeVersion, txHash: string) => {
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

/**
 * Traces the execution of a transaction in the VM.
 * @param block - The block to trace the extrinsic in.
 * @param extrinsic - The extrinsic to trace.
 * @returns An array of VM steps.
 * @throws Error if the trace outcome is invalid.
 */
export const traceVM = async (
  block: Block,
  extrinsic: HexString,
  pageSize = 50_000,
  disableStack = false,
  enableMemory = true,
) => {
  const meta = await block.meta
  registerTypes(meta.registry)

  let page = 0
  let traceNextPage = true
  let steps: Step[] = []

  while (traceNextPage) {
    pinoLogger.info(`VM trace page ${page} ...`)
    const tracerConfig = meta.registry
      .createType('TracerConfig', {
        OpcodeTracer: {
          page,
          pageSize,
          disableStack,
          enableMemory,
        },
      })
      .toHex()
    const taskResponse = await block.call('EVMTraceApi_trace_extrinsic', [extrinsic, tracerConfig])
    const outcome = meta.registry
      .createType('Result<TraceOutcome, TransactionValidityError>', taskResponse.result)
      .asOk.toJSON() as TraceOutcome

    if (!('steps' in outcome)) {
      throw new Error('Invalid trace outcome')
    }

    steps = steps.concat(
      outcome.steps.map((step) => ({
        ...step,
        op: opName(step.op),
        // transform memory to 64 bytes chunks
        memory: step.memory
          ? step.memory.map((chunk, idx) => {
              // remove 0x prefix
              const slice = chunk.slice(2)
              // make sure each chunk is 64 bytes
              if (slice.length < 64 && idx + 1 < step.memory!.length) {
                return slice.padStart(64, '0')
              }
              return slice
            })
          : null,
      })),
    )

    page += 1

    traceNextPage = outcome.steps.length === pageSize
  }
  return steps
}

/**
 * Traces the calls made by an extrinsic in a block.
 * @param block - The block to trace the extrinsic in.
 * @param extrinsic - The extrinsic to trace.
 * @returns An array of calls made by the extrinsic.
 * @throws Error if the trace outcome is invalid.
 */
export const traceCalls = async (block: Block, extrinsic: HexString) => {
  const meta = await block.meta
  registerTypes(meta.registry)

  const tracerConfig = meta.registry.createType('TracerConfig', { CallTracer: null }).toHex()
  const taskResponse = await block.call('EVMTraceApi_trace_extrinsic', [extrinsic, tracerConfig])
  const outcome = meta.registry
    .createType('Result<TraceOutcome, TransactionValidityError>', taskResponse.result)
    .asOk.toJSON() as TraceOutcome
  if (!('calls' in outcome)) {
    throw new Error('Invalid trace outcome')
  }
  return outcome.calls
}

/**
 * Prepares a block for tracing a transaction.
 * @param chain The blockchain instance.
 * @param blockHashNumber The block hash or block number.
 * @param txHash The transaction hash.
 * @param wasmPath The path to the runtime wasm file.
 * @returns An object containing the tracing block and the transaction extrinsic.
 * @throws Error if the block or parent block is not found, or if the runtime wasm with tracing feature cannot be found.
 */
export const prepareBlock = async (
  chain: Blockchain,
  blockHashNumber: HexString | number,
  txHash: string,
  wasmPath?: string,
) => {
  let wasm: string | Buffer | undefined = wasmPath
  const block =
    typeof blockHashNumber === 'number'
      ? await chain.getBlockAt(blockHashNumber)
      : await chain.getBlock(blockHashNumber)
  if (!block) {
    throw new Error(`Block not found ${blockHashNumber}`)
  }
  const header = await block.header
  const parent = await chain.getBlock(header.parentHash.toHex())
  if (!parent) {
    throw new Error(`Block not found ${blockHashNumber}`)
  }
  await chain.setHead(parent)

  // override wasm with tracing feature
  if (typeof wasm === 'string') {
    await overrideWasm(chain, wasm)
  } else {
    // Fetch runtime wasm with tracing feature from Github releases
    if (!wasm) {
      wasm = await fetchRuntime(await chain.head.runtimeVersion)
      if (!wasm) {
        throw new Error(
          'Could not find runtime with tracing feature from Github releasesw. Make sure to manually override runtime wasm built with `tracing` feature enabled.',
        )
      }
    }

    chain.head.setWasm(`0x${wasm.toString('hex')}`)
  }

  const runtimeVersion = await chain.head.runtimeVersion
  pinoLogger.info(`${_.capitalize(runtimeVersion.specName)} specVersion: ${runtimeVersion.specVersion}`)

  const extrinsics = await block.extrinsics
  const txIndex = extrinsics.findIndex((tx) => blake2AsHex(tx) === txHash)

  const tracingBlock = new Block(chain, block.number, block.hash, parent, {
    header,
    extrinsics: [],
    storage: parent.storage,
  })

  pinoLogger.info(`Preparing block ${chain.head.number + 1} ...`)

  const { storageDiff } = await tracingBlock.call('Core_initialize_block', [header.toHex()])
  tracingBlock.pushStorageLayer().setAll(storageDiff)
  for (const extrinsic of extrinsics.slice(0, txIndex)) {
    const { storageDiff } = await tracingBlock.call('BlockBuilder_apply_extrinsic', [extrinsic])
    tracingBlock.pushStorageLayer().setAll(storageDiff)
  }

  return { tracingBlock, extrinsic: extrinsics[txIndex] }
}
