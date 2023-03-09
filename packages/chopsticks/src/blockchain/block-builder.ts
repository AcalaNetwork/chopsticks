import {
  AccountInfo,
  ApplyExtrinsicResult,
  Call,
  Header,
  RawBabePreDigest,
  TransactionValidityError,
} from '@polkadot/types/interfaces'
import { Block, TaskCallResponse } from './block'
import { GenericExtrinsic } from '@polkadot/types'
import { HexString } from '@polkadot/util/types'
import { StorageLayer, StorageValueKind } from './storage-layer'
import { blake2AsHex } from '@polkadot/util-crypto'
import { compactAddLength, hexToU8a, stringToHex } from '@polkadot/util'
import { compactHex } from '../utils'
import { defaultLogger, truncate } from '../logger'
import { getCurrentSlot } from '../utils/time-travel'

const logger = defaultLogger.child({ name: 'block-builder' })

const getConsensus = (header: Header) => {
  if (header.digest.logs.length === 0) return
  const preRuntime = header.digest.logs[0].asPreRuntime
  const [consensusEngine, slot] = preRuntime
  return { consensusEngine, slot, rest: header.digest.logs.slice(1) }
}

const getNewSlot = (digest: RawBabePreDigest, slotNumber: number) => {
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

export const newHeader = async (head: Block) => {
  const meta = await head.meta
  const parentHeader = await head.header

  let newLogs = parentHeader.digest.logs as any
  const consensus = getConsensus(parentHeader)
  if (consensus?.consensusEngine.isAura) {
    const slot = await getCurrentSlot(head.chain)
    const newSlot = compactAddLength(meta.registry.createType('Slot', slot + 1).toU8a())
    newLogs = [{ PreRuntime: [consensus.consensusEngine, newSlot] }, ...consensus.rest]
  } else if (consensus?.consensusEngine.isBabe) {
    const slot = await getCurrentSlot(head.chain)
    const digest = meta.registry.createType<RawBabePreDigest>('RawBabePreDigest', consensus.slot)
    const newSlot = compactAddLength(meta.registry.createType('RawBabePreDigest', getNewSlot(digest, slot + 1)).toU8a())
    newLogs = [{ PreRuntime: [consensus.consensusEngine, newSlot] }, ...consensus.rest]
  } else if (consensus?.consensusEngine?.toString() == 'nmbs') {
    const nmbsKey = stringToHex('nmbs')
    newLogs = [
      {
        // Using previous block author
        PreRuntime: [
          consensus.consensusEngine,
          parentHeader.digest.logs
            .find((log) => log.isPreRuntime && log.asPreRuntime[0].toHex() == nmbsKey)
            ?.asPreRuntime[1].toHex(),
        ],
      },
      ...consensus.rest,
    ]

    if (meta.query.randomness) {
      // TODO: shouldn't modify existing head
      // reset notFirstBlock so randomness will skip validation
      head.pushStorageLayer().set(compactHex(meta.query.randomness.notFirstBlock()), StorageValueKind.Deleted)
    }
  }

  const header = meta.registry.createType<Header>('Header', {
    parentHash: head.hash,
    number: head.number + 1,
    stateRoot: '0x0000000000000000000000000000000000000000000000000000000000000000',
    extrinsicsRoot: '0x0000000000000000000000000000000000000000000000000000000000000000',
    digest: {
      logs: newLogs,
    },
  })

  return header
}

const initNewBlock = async (head: Block, header: Header, inherents: HexString[], storageLayer?: StorageLayer) => {
  const blockNumber = header.number.toNumber()
  const hash: HexString = `0x${Math.round(Math.random() * 100000000)
    .toString(16)
    .padEnd(64, '0')}`
  const newBlock = new Block(head.chain, blockNumber, hash, head, { header, extrinsics: [], storage: storageLayer ?? head.storage })

  {
    // initialize block
    const { storageDiff } = await newBlock.call('Core_initialize_block', [header.toHex()])
    newBlock.pushStorageLayer().setAll(storageDiff)
    logger.trace(truncate(storageDiff), 'Initialize block')
  }

  const layers: StorageLayer[] = []
  // apply inherents
  for (const extrinsic of inherents) {
    try {
      const { storageDiff } = await newBlock.call('BlockBuilder_apply_extrinsic', [extrinsic])
      const layer = newBlock.pushStorageLayer()
      layer.setAll(storageDiff)
      layers.push(layer)
      logger.trace(truncate(storageDiff), 'Applied inherent')
    } catch (e) {
      logger.warn('Failed to apply inherents %o %s', e, e)
      throw new Error('Failed to apply inherents')
    }
  }

  return {
    block: newBlock,
    layers: layers,
  }
}

export const buildBlock = async (
  head: Block,
  inherents: HexString[],
  extrinsics: HexString[],
  ump: Record<number, HexString[]>,
  onApplyExtrinsicError: (extrinsic: HexString, error: TransactionValidityError) => void
): Promise<[Block, HexString[]]> => {
  const registry = await head.registry
  const header = await newHeader(head)

  let layer: StorageLayer | undefined
  // apply ump via storage override hack
  if (Object.keys(ump).length > 0) {
    const meta = await head.meta
    layer = new StorageLayer(head.storage)
    for (const [paraId, upwardMessages] of Object.entries(ump)) {
      const queueSize = meta.registry.createType('(u32, u32)', [
        upwardMessages.length,
        upwardMessages.map((x) => x.length).reduce((s, i) => s + i, 0),
      ])

      const messages = meta.registry.createType('Vec<Bytes>', upwardMessages)

      // TODO: make sure we append instead of replace
      layer.setAll([
        [compactHex(meta.query.ump.relayDispatchQueues(paraId)), messages.toHex()],
        [compactHex(meta.query.ump.relayDispatchQueueSize(paraId)), queueSize.toHex()],
      ])

      logger.trace({ paraId, upwardMessages: truncate(upwardMessages) }, 'Pushed UMP')
    }

    const needsDispatch = meta.registry.createType('Vec<u32>', Object.keys(ump))
    layer.set(compactHex(meta.query.ump.needsDispatch()), needsDispatch.toHex())
  }

  const { block: newBlock } = await initNewBlock(head, header, inherents, layer)

  logger.info(
    {
      number: newBlock.number,
      extrinsicsCount: extrinsics.length,
      umpCount: Object.keys(ump).length,
      tempHash: newBlock.hash,
    },
    `Try building block #${newBlock.number.toLocaleString()}`
  )

  const pendingExtrinsics: HexString[] = []
  const includedExtrinsic: HexString[] = []

  // apply extrinsics
  for (const extrinsic of extrinsics) {
    try {
      const { result, storageDiff } = await newBlock.call('BlockBuilder_apply_extrinsic', [extrinsic])
      const outcome = registry.createType<ApplyExtrinsicResult>('ApplyExtrinsicResult', result)
      if (outcome.isErr) {
        onApplyExtrinsicError(extrinsic, outcome.asErr)
        continue
      }
      newBlock.pushStorageLayer().setAll(storageDiff)
      logger.trace(truncate(storageDiff), 'Applied extrinsic')
      includedExtrinsic.push(extrinsic)
    } catch (e) {
      logger.info('Failed to apply extrinsic %o %s', e, e)
      pendingExtrinsics.push(extrinsic)
    }
  }

  {
    // finalize block
    const { storageDiff } = await newBlock.call('BlockBuilder_finalize_block', [])

    newBlock.pushStorageLayer().setAll(storageDiff)
    logger.trace(truncate(storageDiff), 'Finalize block')
  }

  const blockData = registry.createType('Block', {
    header,
    extrinsics: includedExtrinsic,
  })

  const storageDiff = await newBlock.storageDiff()
  logger.trace(
    Object.entries(storageDiff).map(([key, value]) => [key, truncate(value)]),
    'Final block'
  )
  const finalBlock = new Block(head.chain, newBlock.number, blockData.hash.toHex(), head, {
    header,
    extrinsics: [...inherents, ...includedExtrinsic],
    storage: head.storage,
    storageDiff,
  })

  logger.info(
    {
      number: newBlock.number,
      hash: finalBlock.hash,
      extrinsics: truncate(includedExtrinsic),
      pendingExtrinsicsCount: pendingExtrinsics.length,
      ump: truncate(ump),
    },
    'Block built'
  )

  return [finalBlock, pendingExtrinsics]
}

export const dryRunExtrinsic = async (
  head: Block,
  inherents: HexString[],
  extrinsic: HexString | { call: HexString; address: string }
): Promise<TaskCallResponse> => {
  const registry = await head.registry
  const header = await newHeader(head)
  const { block: newBlock } = await initNewBlock(head, header, inherents)

  if (typeof extrinsic !== 'string') {
    if (!head.chain.mockSignatureHost) {
      throw new Error(
        'Cannot fake signature because mock signature host is not enabled. Start chain with `mockSignatureHost: true`'
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

    defaultLogger.info({ call: call.toHuman() }, 'dry_run_call')

    return newBlock.call('BlockBuilder_apply_extrinsic', [generic.toHex()])
  }

  defaultLogger.info(
    { call: registry.createType('GenericExtrinsic', hexToU8a(extrinsic)).toHuman() },
    'dry_run_extrinsic'
  )
  return newBlock.call('BlockBuilder_apply_extrinsic', [extrinsic])
}

export const dryRunInherents = async (
  head: Block,
  inherents: HexString[]
): Promise<[HexString, HexString | null][]> => {
  const header = await newHeader(head)
  const { layers } = await initNewBlock(head, header, inherents)
  const stoarge = {}
  for (const layer of layers) {
    await layer.mergeInto(stoarge)
  }
  return Object.entries(stoarge) as [HexString, HexString | null][]
}
