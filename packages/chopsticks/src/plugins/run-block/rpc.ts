import { GenericExtrinsic } from '@polkadot/types'
import { Header } from '@polkadot/types/interfaces'
import { HexString } from '@polkadot/util/types'
import { u8aToHex } from '@polkadot/util'
import { z } from 'zod'
import _ from 'lodash'

import {
  Block,
  Context,
  RuntimeLog,
  compactHex,
  decodeKeyValue,
  runTask,
  taskHandler,
} from '@acala-network/chopsticks-core'
import { zHash, zHex } from '../../schema/index.js'

const schema = z.object({
  includeRaw: z.boolean().optional(),
  includeParsed: z.boolean().optional(),
  includeBlockDetails: z.boolean().optional(),
  parent: zHash.optional(),
  block: z.object({
    header: z.any(),
    extrinsics: z.array(zHex),
  }),
})

type Params = z.infer<typeof schema>

export interface RunBlockParams {
  /**
   * Include raw storage diff. Default to true
   */
  includeRaw: Params['includeRaw']
  /**
   * Include parsed storage diff in json format
   */
  includeParsed: Params['includeParsed']
  /**
   * Include block details such as parsed extrinsics in json format
   */
  includeBlockDetails: Params['includeBlockDetails']
  /**
   * The parent block hash to run on top of. Default to chain head.
   */
  parent: Params['parent']
  /**
   * Block to run
   */
  block: Params['block']
}

/**
 * The phase of an execution.
 * `number` means the phase is ApplyExtrinsic and the value is the extrinsic index.
 */
export type Phase = 'Initialization' | 'Finalization' | number // extrinsic index

export interface RunBlockResponse {
  /**
   * The storage diff of each phase.
   */
  phases: {
    /**
     * The phase of the execution. See {@link Phase}.
     */
    phase: Phase
    /**
     * The modified storages of this phase.
     */
    storageDiff: {
      /**
       * Raw storage diff in bytes. Only available when `includeRaw` is true.
       */
      raw?: { key: HexString; value: HexString | null }
      /**
       * Decoded storage diff. Only available when `includeParsed` is true.
       */
      parsed?: {
        method: string
        section: string
        key: any[]
        value: any
      }
    }[]
    /**
     * Runtime logs.
     */
    logs?: RuntimeLog[]
  }[]
  /**
   * Block details. Only available when `includeBlockDetails` is true.
   */
  blockDetails?: {
    /**
     * Block timestamp in ms
     */
    timestamp?: string
    /**
     * Parsed events in this block.
     */
    events?: { phase: Phase; section: string; method: string; args: any[]; argObj: Record<string, any> }[]
    /**
     * Parsed extrinsics in this block.
     */
    extrinsics: {
      section: string
      method: string
      args: any[]
      argObj: Record<string, any>
      success: boolean
      signer: string | null
    }[]
  }
}

export const name = 'runBlock'

/**
 * Run a set of extrinsics on top of a block and get the storage diff
 * and optionally the parsed storage diff and block details.
 * NOTE: The extrinsics should include inherents or tranasctions may have unexpected results.
 * NOTE: system.events and system.extrinsicData are excluded from storage diff to reduce size.
 *
 * This function is a dev rpc handler. Use `dev_runBlock` as the method name when calling it.
 */
export const rpc = async ({ chain }: Context, [params]: [RunBlockParams]): Promise<RunBlockResponse> => {
  const { includeRaw, includeParsed, includeBlockDetails, parent, block } = schema.parse(params)

  const includeRawStorage = includeRaw ?? true

  const parentBlock = await chain.getBlock(parent)
  if (!parentBlock) {
    throw Error(`Invalid block hash ${parent}`)
  }

  const registry = await parentBlock.registry
  const header = registry.createType<Header>('Header', block.header)

  const wasm = await parentBlock.wasm
  const meta = await parentBlock.meta

  const blockNumber = parentBlock.number + 1
  const hash: HexString = `0x${Math.round(Math.random() * 100000000)
    .toString(16)
    .padEnd(64, '0')}`

  const newBlock = new Block(chain, blockNumber, hash, parentBlock, {
    header,
    extrinsics: [],
    storage: parentBlock.storage,
  })

  const resp = {
    phases: [],
  } as RunBlockResponse

  // exclude system events because it can be stupidly large and redudant
  const systemEventsKey = compactHex(meta.query.system.events())
  // large and not really useful
  const systemExtrinsicDataKey = u8aToHex(meta.query.system.extrinsicData.keyPrefix())

  const run = async (fn: string, args: HexString[]) => {
    const result = await runTask(
      {
        wasm,
        calls: [[fn, args]],
        mockSignatureHost: false,
        allowUnresolvedImports: false,
        runtimeLogLevel: 5,
      },
      taskHandler(newBlock),
    )

    if ('Error' in result) {
      throw new Error(result.Error)
    }

    const resp = { storageDiff: [] } as Omit<RunBlockResponse['phases'][number], 'phase'>
    const raw = result.Call.storageDiff

    const previousLayer = newBlock.storage
    newBlock.pushStorageLayer().setAll(raw)

    const newBlockMeta = await newBlock.meta

    for (const [key, value] of raw) {
      if (key === systemEventsKey) {
        continue
      }
      if (key.startsWith(systemExtrinsicDataKey)) {
        continue
      }

      const oldVal = await previousLayer.get(key, false)
      if (value === oldVal) {
        continue
      }

      const obj = {} as (typeof resp)['storageDiff'][number]
      if (includeRawStorage) {
        obj.raw = { key, value }
      }
      if (includeParsed) {
        const decoded = decodeKeyValue(newBlockMeta, key, value, false)
        if (decoded) {
          obj.parsed = {
            section: decoded.section,
            method: decoded.method,
            key: decoded.key,
            value: decoded.value,
          }
        }
      }
      resp.storageDiff.push(obj)
    }

    resp.logs = result.Call.runtimeLogs

    return resp
  }

  const resInit = await run('Core_initialize_block', [header.toHex()])
  resp.phases.push({ phase: 'Initialization', ...resInit })

  for (const extrinsic of block.extrinsics) {
    const res = await run('BlockBuilder_apply_extrinsic', [extrinsic])
    resp.phases.push({ phase: resp.phases.length - 1, ...res })
  }

  const resFinalize = await run('BlockBuilder_finalize_block', [])
  resp.phases.push({ phase: 'Finalization', ...resFinalize })

  if (includeBlockDetails) {
    const meta = await newBlock.meta
    const registry = await newBlock.registry
    const timestamp = await newBlock.read('u64', meta.query.timestamp.now)
    const events = await newBlock.read('Vec<EventRecord>', meta.query.system.events)
    const parsedEvents = events?.map((event) => {
      let argObj: any = undefined
      const len = event.event.data.names?.length ?? 0
      if (len > 0) {
        argObj = {}
        for (let i = 0; i < len; i++) {
          argObj[event.event.data.names![i]] = event.event.data[i].toJSON()
        }
      }

      return {
        phase: event.phase.isApplyExtrinsic
          ? event.phase.asApplyExtrinsic.toNumber()
          : (event.phase.toString() as Phase),
        section: event.event.section,
        method: event.event.method,
        args: event.event.data.map((arg) => arg.toJSON()),
        argObj,
      }
    })
    const extrinsics = block.extrinsics.map((extrinsic, idx) => {
      const parsed = registry.createType<GenericExtrinsic>('GenericExtrinsic', extrinsic)
      const resultEvent = events?.find(
        ({ event, phase }) =>
          event.section === 'system' &&
          (event.method === 'ExtrinsicSuccess' || event.method === 'ExtrinsicFailed') &&
          phase.isApplyExtrinsic &&
          phase.asApplyExtrinsic.eq(idx),
      )

      const signer = parsed.signer.isEmpty ? null : parsed.signer.toHex()

      return {
        section: parsed.method.section,
        method: parsed.method.method,
        args: parsed.method.args.map((arg) => arg.toJSON()),
        argObj: (parsed.method as any)?.argsEntries
          ? Object.fromEntries((parsed.method as any).argsEntries.map(([key, value]) => [key, value.toJSON()]))
          : {},
        success: resultEvent?.event.method === 'ExtrinsicSuccess',
        signer,
      }
    })

    resp.blockDetails = {
      timestamp: timestamp?.toString(),
      events: parsedEvents,
      extrinsics,
    }
  }

  return resp
}
