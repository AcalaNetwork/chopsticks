import type { GenericExtrinsic } from '@polkadot/types'
import type {
  AccountInfo,
  ApplyExtrinsicResult,
  Call,
  ConsensusEngineId,
  DigestItem,
  Header,
  RawBabePreDigest,
  TransactionValidityError,
} from '@polkadot/types/interfaces'
import { compactAddLength, hexToU8a, stringToHex, u8aConcat } from '@polkadot/util'
import type { HexString } from '@polkadot/util/types'
import { blake2AsU8a } from '@polkadot/util-crypto'
import { defaultLogger, truncate } from '../logger.js'
import { compactHex, getCurrentSlot } from '../utils/index.js'
import type { TaskCallResponse } from '../wasm-executor/index.js'
import { Block } from './block.js'
import type { InherentProvider } from './inherent/index.js'
import { StorageLayer, StorageValueKind } from './storage-layer.js'
import type { BuildBlockParams } from './txpool.js'

const logger = defaultLogger.child({ name: 'block-builder' })

export const genesisDigestLogs = async (head: Block) => {
  const meta = await head.meta
  const currentSlot = await getCurrentSlot(head)
  if (meta.consts.babe) {
    const newSlot = meta.registry.createType('Slot', currentSlot + 1)
    const consensusEngine = meta.registry.createType('ConsensusEngineId', 'BABE')
    const preDigest = meta.registry.createType('RawBabePreDigest', {
      SecondaryVRF: {
        authorityIndex: 514,
        slotNumber: newSlot,
        vrfOutput: '0x44cadd14aaefbda13ac8d85e1a6d58be082e7e2f56a4f95a3c612c784aaa4063',
        vrfProof:
          '0xf5517bf67d93ce633cde2fde7fbcf8ddca80017aaf8cd48436514687c662f60eda0ffa2c4781906416f4e71a196c9783c60c1b83d54c3a29365d03706714570b',
      },
    })
    const digest = meta.registry.createType<DigestItem>('DigestItem', {
      PreRuntime: [consensusEngine, compactAddLength(preDigest.toU8a())],
    })
    return [digest]
  }
  const newSlot = meta.registry.createType('Slot', currentSlot + 1)
  const consensusEngine = meta.registry.createType<ConsensusEngineId>('ConsensusEngineId', 'aura')
  const digest = meta.registry.createType<DigestItem>('DigestItem', {
    PreRuntime: [consensusEngine, compactAddLength(newSlot.toU8a())],
  })
  return [digest]
}

const getConsensus = (header: Header) => {
  if (header.digest.logs.length === 0) return
  const [consensusEngine, preDigest] = header.digest.logs[0].asPreRuntime
  return { consensusEngine, preDigest, rest: header.digest.logs.slice(1) }
}

const babePreDigestSetSlot = (digest: RawBabePreDigest, slotNumber: number) => {
  if (digest.isPrimary) {
    return {
      primary: {
        ...digest.asPrimary.toJSON(),
        slotNumber,
      },
    }
  }
  if (digest.isSecondaryPlain) {
    return {
      secondaryPlain: {
        ...digest.asSecondaryPlain.toJSON(),
        slotNumber,
      },
    }
  }
  if (digest.isSecondaryVRF) {
    return {
      secondaryVRF: {
        ...digest.asSecondaryVRF.toJSON(),
        slotNumber,
      },
    }
  }
  return digest.toJSON()
}

export const newHeader = async (head: Block, unsafeBlockHeight?: number) => {
  const meta = await head.meta
  const parentHeader = await head.header

  let newLogs = !head.number ? await genesisDigestLogs(head) : parentHeader.digest.logs.toArray()
  const consensus = getConsensus(parentHeader)
  if (consensus?.consensusEngine.isAura || consensus?.consensusEngine?.toString() === 'spin') {
    const slot = await getCurrentSlot(head)
    const newSlot = compactAddLength(meta.registry.createType('Slot', slot + 1).toU8a())
    newLogs = [
      meta.registry.createType<DigestItem>('DigestItem', { PreRuntime: [consensus.consensusEngine, newSlot] }),
      ...consensus.rest,
    ]
  } else if (consensus?.consensusEngine.isBabe) {
    const slot = await getCurrentSlot(head)
    const digest = meta.registry.createType<RawBabePreDigest>('RawBabePreDigest', consensus.preDigest)
    const newSlot = compactAddLength(
      meta.registry.createType('RawBabePreDigest', babePreDigestSetSlot(digest, slot + 1)).toU8a(),
    )
    newLogs = [
      meta.registry.createType<DigestItem>('DigestItem', { PreRuntime: [consensus.consensusEngine, newSlot] }),
      ...consensus.rest,
    ]
  } else if (consensus?.consensusEngine?.toString() === 'nmbs') {
    const nmbsKey = stringToHex('nmbs')
    newLogs = [
      meta.registry.createType<DigestItem>('DigestItem', {
        // Using previous block author
        PreRuntime: [
          consensus.consensusEngine,
          parentHeader.digest.logs
            .find((log) => log.isPreRuntime && log.asPreRuntime[0].toHex() === nmbsKey)
            ?.asPreRuntime[1].toHex(),
        ],
      }),
      ...consensus.rest,
    ]

    if (meta.query.randomness?.notFirstBlock) {
      // TODO: shouldn't modify existing head
      // reset notFirstBlock so randomness will skip validation
      head.pushStorageLayer().set(compactHex(meta.query.randomness.notFirstBlock()), StorageValueKind.Deleted)
    }
  }

  const header = meta.registry.createType<Header>('Header', {
    parentHash: head.hash,
    number: unsafeBlockHeight ?? head.number + 1,
    stateRoot: '0x0000000000000000000000000000000000000000000000000000000000000000',
    extrinsicsRoot: '0x0000000000000000000000000000000000000000000000000000000000000000',
    digest: {
      logs: newLogs,
    },
  })

  return header
}

const initNewBlock = async (
  head: Block,
  header: Header,
  inherentProviders: InherentProvider[],
  params: BuildBlockParams,
  storageLayer?: StorageLayer,
  callback?: BuildBlockCallbacks,
) => {
  const blockNumber = header.number.toNumber()
  const hash: HexString = `0x${Math.round(Math.random() * 100000000)
    .toString(16)
    .padEnd(64, '0')}`
  const newBlock = new Block(head.chain, blockNumber, hash, head, {
    header,
    extrinsics: [],
    storage: storageLayer ?? head.storage,
  })

  {
    // initialize block
    const resp = await newBlock.call('Core_initialize_block', [header.toHex()])
    newBlock.pushStorageLayer().setAll(resp.storageDiff)

    if (head.number === 0) {
      // set parent hash for genesis block
      // this makes sure to override the default parent hash
      const meta = await head.meta
      const header = await head.header
      newBlock.pushStorageLayer().setAll([[compactHex(meta.query.system.parentHash()), header.hash.toHex()]])
    }

    callback?.onPhaseApplied?.('initialize', resp)
  }

  const inherents: HexString[] = []
  const layers: StorageLayer[] = []
  // apply inherents
  for (const inherentProvider of inherentProviders) {
    try {
      const extrinsics = await inherentProvider.createInherents(newBlock, params)
      if (extrinsics.length === 0) {
        continue
      }
      const resp = await newBlock.call('BlockBuilder_apply_extrinsic', extrinsics)
      const layer = newBlock.pushStorageLayer()
      layer.setAll(resp.storageDiff)
      layers.push(layer)
      inherents.push(...extrinsics)
      callback?.onPhaseApplied?.(layers.length - 1, resp)
    } catch (e) {
      logger.warn('Failed to apply inherents %o %s', e, e)
      throw new Error('Failed to apply inherents')
    }
  }

  return {
    block: newBlock,
    layers,
    inherents,
  }
}

export type BuildBlockCallbacks = {
  onApplyExtrinsicError?: (extrinsic: HexString, error: TransactionValidityError) => void
  onPhaseApplied?: (phase: 'initialize' | 'finalize' | number, resp: TaskCallResponse) => void
}

export const buildBlock = async (
  head: Block,
  inherentProviders: InherentProvider[],
  params: BuildBlockParams,
  callbacks?: BuildBlockCallbacks,
): Promise<[Block, HexString[]]> => {
  const { transactions: extrinsics, upwardMessages: ump, unsafeBlockHeight } = params
  const registry = await head.registry
  const header = await newHeader(head, unsafeBlockHeight)
  const newBlockNumber = header.number.toNumber()

  logger.info(
    {
      number: newBlockNumber,
      extrinsics: extrinsics.map(truncate),
      umpCount: Object.keys(ump).length,
    },
    `${await head.chain.api.getSystemChain()} building #${newBlockNumber.toLocaleString()}`,
  )

  let layer: StorageLayer | undefined
  // apply ump via storage override hack
  if (Object.keys(ump).length > 0) {
    const meta = await head.meta
    layer = new StorageLayer(head.storage)
    for (const [paraId, upwardMessages] of Object.entries(ump)) {
      const upwardMessagesU8a = upwardMessages.map((x) => hexToU8a(x))
      const messagesCount = upwardMessages.length
      const messagesSize = upwardMessagesU8a.map((x) => x.length).reduce((s, i) => s + i, 0)

      if (meta.query.ump) {
        const queueSize = meta.registry.createType('(u32, u32)', [messagesCount, messagesSize])

        const messages = meta.registry.createType('Vec<Bytes>', upwardMessages)

        // TODO: make sure we append instead of replace
        layer.setAll([
          [compactHex(meta.query.ump.relayDispatchQueues(paraId)), messages.toHex()],
          [compactHex(meta.query.ump.relayDispatchQueueSize(paraId)), queueSize.toHex()],
        ])
      } else if (meta.query.messageQueue) {
        // TODO: make sure we append instead of replace
        const origin = { ump: { para: paraId } }

        let last = 0
        let heap: Uint8Array = new Uint8Array(0)

        for (const message of upwardMessagesU8a) {
          const payloadLen = message.length
          const header = meta.registry.createType('(u32, bool)', [payloadLen, false])
          last = heap.length
          heap = u8aConcat(heap, header.toU8a(), message)
        }

        layer.setAll([
          [
            compactHex(meta.query.messageQueue.bookStateFor(origin)),
            meta.registry
              .createType('PalletMessageQueueBookState', {
                begin: 0,
                end: 1,
                count: 1,
                readyNeighbours: { prev: origin, next: origin },
                messageCount: messagesCount,
                size_: messagesSize,
              })
              .toHex(),
          ],
          [
            compactHex(meta.query.messageQueue.serviceHead(origin)),
            meta.registry.createType('PolkadotRuntimeParachainsInclusionAggregateMessageOrigin', origin).toHex(),
          ],
          [
            compactHex(meta.query.messageQueue.pages(origin, 0)),
            meta.registry
              .createType('PalletMessageQueuePage', {
                remaining: messagesCount,
                remaining_size: messagesSize,
                first_index: 0,
                first: 0,
                last,
                heap: compactAddLength(heap),
              })
              .toHex(),
          ],
        ])
      } else {
        throw new Error('Unknown ump storage')
      }

      logger.trace({ paraId, upwardMessages: truncate(upwardMessages) }, 'Pushed UMP')
    }

    if (meta.query.ump) {
      const needsDispatch = meta.registry.createType('Vec<u32>', Object.keys(ump))
      layer.set(compactHex(meta.query.ump.needsDispatch()), needsDispatch.toHex())
    }
  }

  const { block: newBlock, inherents } = await initNewBlock(head, header, inherentProviders, params, layer)

  const pendingExtrinsics: HexString[] = []
  const includedExtrinsic: HexString[] = []

  // apply extrinsics
  for (const extrinsic of extrinsics) {
    try {
      const resp = await newBlock.call('BlockBuilder_apply_extrinsic', [extrinsic])
      const outcome = registry.createType<ApplyExtrinsicResult>('ApplyExtrinsicResult', resp.result)
      if (outcome.isErr) {
        callbacks?.onApplyExtrinsicError?.(extrinsic, outcome.asErr)
        continue
      }
      newBlock.pushStorageLayer().setAll(resp.storageDiff)
      includedExtrinsic.push(extrinsic)

      callbacks?.onPhaseApplied?.(includedExtrinsic.length - 1, resp)
    } catch (e) {
      logger.info('Failed to apply extrinsic %o %s', e, e)
      pendingExtrinsics.push(extrinsic)
    }
  }

  {
    // finalize block
    const resp = await newBlock.call('BlockBuilder_finalize_block', [])

    newBlock.pushStorageLayer().setAll(resp.storageDiff)

    callbacks?.onPhaseApplied?.('finalize', resp)
  }

  const allExtrinsics = [...inherents, ...includedExtrinsic]

  const mockExtrinsicRoot = blake2AsU8a(u8aConcat(...allExtrinsics), 256)
  const finalHeader = registry.createType<Header>('Header', {
    ...header.toJSON(),
    extrinsicsRoot: mockExtrinsicRoot,
  })

  const storageDiff = await newBlock.storageDiff()

  if (logger.level.toLowerCase() === 'trace') {
    logger.trace(
      Object.entries(storageDiff).map(([key, value]) => [key, truncate(value)]),
      'Final block',
    )
  }

  const finalBlock = new Block(head.chain, newBlock.number, finalHeader.hash.toHex(), head, {
    header: finalHeader,
    extrinsics: allExtrinsics,
    storage: head.storage,
    storageDiff,
  })

  logger.info(
    {
      number: finalBlock.number,
      hash: finalBlock.hash,
      extrinsics: truncate(includedExtrinsic),
      pendingExtrinsics: pendingExtrinsics.map(truncate),
      ump: truncate(ump),
    },
    `${await head.chain.api.getSystemChain()} new head #${finalBlock.number.toLocaleString()}`,
  )

  return [finalBlock, pendingExtrinsics]
}

export const dryRunExtrinsic = async (
  head: Block,
  inherentProviders: InherentProvider[],
  extrinsic: HexString | { call: HexString; address: string },
  params: BuildBlockParams,
): Promise<TaskCallResponse> => {
  const registry = await head.registry
  const header = await newHeader(head)
  const { block: newBlock } = await initNewBlock(head, header, inherentProviders, params)

  if (typeof extrinsic !== 'string') {
    if (!head.chain.mockSignatureHost) {
      throw new Error(
        'Cannot fake signature because mock signature host is not enabled. Start chain with `mockSignatureHost: true`',
      )
    }

    const meta = await head.meta
    const call = registry.createType<Call>('Call', hexToU8a(extrinsic.call))
    const generic = registry.createType<GenericExtrinsic>('GenericExtrinsic', call)

    const accountRaw = await head.get(compactHex(meta.query.system.account(extrinsic.address)))
    const account = registry.createType<AccountInfo>('AccountInfo', hexToU8a(accountRaw))

    generic.signFake(extrinsic.address, {
      blockHash: head.hash,
      genesisHash: head.hash,
      runtimeVersion: await head.runtimeVersion,
      nonce: account.nonce,
    })

    const mockSignature = new Uint8Array(64)
    mockSignature.fill(0xcd)
    mockSignature.set([0xde, 0xad, 0xbe, 0xef])
    generic.signature.set(mockSignature)

    logger.debug({ call: call.toHuman() }, 'dry_run_call')

    return newBlock.call('BlockBuilder_apply_extrinsic', [generic.toHex()])
  }

  logger.debug({ call: registry.createType('GenericExtrinsic', hexToU8a(extrinsic)).toJSON() }, 'dry_run_extrinsic')
  return newBlock.call('BlockBuilder_apply_extrinsic', [extrinsic])
}

export const dryRunInherents = async (
  head: Block,
  inherentProviders: InherentProvider[],
  params: BuildBlockParams,
): Promise<[HexString, HexString | null][]> => {
  const header = await newHeader(head)
  const { layers } = await initNewBlock(head, header, inherentProviders, params)
  const storage = {}
  for (const layer of layers) {
    await layer.mergeInto(storage)
  }
  return Object.entries(storage) as [HexString, HexString | null][]
}
