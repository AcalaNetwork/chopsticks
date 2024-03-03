import { AbridgedHrmpChannel, HrmpChannelId, Slot } from '@polkadot/types/interfaces'
import { BN, hexToU8a, u8aConcat, u8aToHex } from '@polkadot/util'
import { GenericExtrinsic } from '@polkadot/types'
import { HexString } from '@polkadot/util/types'
import _ from 'lodash'

import { Block } from '../../block.js'
import { BuildBlockParams, DownwardMessage, HorizontalMessage } from '../../txpool.js'
import { InherentProvider } from '../index.js'
import {
  WELL_KNOWN_KEYS,
  dmqMqcHead,
  hrmpChannels,
  hrmpEgressChannelIndex,
  hrmpIngressChannelIndex,
  paraHead,
  upgradeGoAheadSignal,
} from '../../../utils/proof.js'
import { blake2AsHex, blake2AsU8a } from '@polkadot/util-crypto'
import { compactHex, getCurrentSlot, getParaId } from '../../../utils/index.js'
import { createProof, decodeProof } from '../../../wasm-executor/index.js'

const MOCK_VALIDATION_DATA = {
  validationData: {
    relayParentNumber: 1000,
    relayParentStorageRoot: '0x0' as HexString,
    maxPovSize: 5242880,
  },
  relayChainState: {
    trieNodes: [
      '0x5f04b49d95320d9021994c850f25b8e385f902000030000080000008000000000010000000100005000000050000000a0000000a000000000050000000100000e8764817000000040000000400000000000000000000000000000000000000000000000000000000000000000000000800000000200000040000000400000000001000b0040000000000000000000014000000040000000400000000000000010100000000060000006400000002000000c8000000020000001900000000000000020000000200000000c817a804000000',
      '0x80011080ace5323aee784b03389c0e2cc68d81973f8fa26d395f333ecad7399271c781e1808e5db75be813c05205986cbd6fdede707a4d26816063a41eb42ebc262c734fad',
      '0x8004648086a9239b72237f5bf119e2a880c32f5866460632700509cb874c60f67fe815ea80f6f6801e4b41e2e6d8ec194dba122bfb9eb33feb2545ef5144cea79551f7cc5280c629a7e712d763fe83b35d2a082430af6737a89f23219c0eb3051c83bc5af5ad80fed5ecd6097308a6540f8cf31aeaad186e6898d2ecc0e623767c521c70e39953',
      '0x800804809f3ada68c357b5e0a3ebb39ef181acfa9943af4725c244330a4b2c60837612e88082ad3fbdf392429afeacc70177704b760bb145547c1f152e1fcf651916b43820',
      '0x8008208042793f557c1d003b647e2eda79c2b5088c7d8cab2e82c1dcc87f4343cca91ae4485ead6eef5c4b1c68eaa71ea17a02d9de0400',
      '0x80210280de38445d825563f8e218255a417c16971afa85b4f2ef18fbe08fbc5b976dc0d6801a2ff24096295cfccf1adda80b8dfffe380b9f3b54d7a3cdb67864a4655e62968022a699b2cc90a6654c84163d2a498506b192afe7cd9777227e5288e8ff069c0f',
      '0x80400180ebebd1a1cd0bbc6714b7fb0ac854cca5a4c4e34e69485da48be3c8087b56e09b80128645c79ca6581c248a412fd7b8bc532a187600e6e1cc20c915538ba4df6a79',
      '0x80ffbe80d9302a505e2b1ac931f539aed33bf791d1982906ae64c7197324044f191e9bca80972cd2f703f9c94fd516e14b7013c6f1545095855b6c4b36f21d89dad30aa54d80b2495ce4d07001927bb0857611f8d3a1449e791d0b010e3861c32dec0c44179680f5929c8ef9b0ac6ec8a529c91348d8cd6c169920dd37d055544a6c31c53b11e380402a0bf7ff07cee790d9cc065fc138ff6afa7db016d898d65b2b716af354c6f68042aef1dafffd1d9debbb8e6c4eb48b5c141ddf0aad2b0f3f4ddf53e6b38e65c080b31fa0392c1abdce1aa29d1544c94634ecab87ecaba6409db33aaa7621992a8280b1f4de7c3ac5665016d561a60659cd2d8f2d3e0a97e2ea9749279bd8e35eb1f180816ac87a2893694016b21768137a76ea459190ea0fc3c645d85e1a3d4eb194fe802e563b43e7334454c841953424be8c2b7a1c3295dbc391045cb6b88388ad5e7080b1ed3b02e5989b7d134ca056c778f1f5b6ffd377b2d8064483da6e94b82b0e40800cb3299c44a5db8fdcb4932e1b6ab0385d6ef1c9f8d85e0a75b787b6f4fd6c3c805a44c30e2676dc2d4c17451f51d9502e85064387999f366e6f3d404509a7780f80d6788ca71c6aabe421c352027acdb9532563dc5f1b25e6154b721f431e9990ed',
      '0x9d0da05ca59913bc38a8630590f2627c154080834dda0ba5adf00d798e981a28a13e728cf83e35aefc87318440a61869f724474c5f0a351b6a99a5b21324516e668bb86a570400505f0e7b9012096b41c4eb3aaf947f6ea4290800007c7700e67da63472835bb0b737093a19ad4c63f5a4efb16ffa83d00700000400',
      '0x9e207f03cfdce586301014700e2c25931040505f0e7b9012096b41c4eb3aaf947f6ea4290800004c5f0ec2d17a76153ff51817f12d9cfc3c7f0400',
      '0x9e710b30bd2eab0352ddcc26417aa1945fc180699a53b51a9709a3a86039c49b5ef278e9fc244dae27e1a0380c91bff5b0488580c0d4096d94e724b8e86f952e5456c7253776de04c405582d2c350ee172d3eaa77c77081e0bfde17b36573208a06cb5cfba6b63f5a4efb16ffa83d00700000402803d0ae0b8f6832e8fabf0ec62521c2487c58b69eb97060faa8059b00ff6b7262d505f0e7b9012096b41c4eb3aaf947f6ea4290800004c5f03c716fb8fff3de61a883bb76adb34a20400806c8122e0f7f786071d6a51b330d612eccdcbe8d8f79936accabd640506dffdf380a6abfb72ed49b586829cca4ce631c092d45a017ab0d68288d308873025cfe5d280521b868fc212b25f021984cf02ced547cd45952b88360766839dfde7d4683e61',
      '0x9ede3d8a54d27e44a9d5ce189618f22d1008505f0e7b9012096b41c4eb3aaf947f6ea42908010080c74756edffa217dfb07ab596d82753deff985ac215e5cc2997d29afe1d397c16',
      '0x9ef78c98723ddc9073523ef3beefda0c1004505f0e7b9012096b41c4eb3aaf947f6ea4290800007c77095dac46c07a40d91506e7637ec4ba5763f5a4efb16ffa83d00700000400',
    ] as HexString[],
  },
  horizontalMessages: [],
  downwardMessages: [],
} satisfies ValidationData

export type ValidationData = {
  downwardMessages: DownwardMessage[]
  horizontalMessages: Record<number, HorizontalMessage[]>
  validationData: {
    relayParentNumber: number
    relayParentStorageRoot: HexString
    maxPovSize: number
  }
  relayChainState: {
    trieNodes: HexString[]
  }
}

const getValidationData = async (parent: Block) => {
  const meta = await parent.meta
  if (parent.number === 0) {
    const { trieRootHash, nodes } = await createProof(MOCK_VALIDATION_DATA.relayChainState.trieNodes, [])
    return {
      ...MOCK_VALIDATION_DATA,
      relayChainState: { trieNodes: nodes },
      validationData: {
        ...MOCK_VALIDATION_DATA.validationData,
        relayParentStorageRoot: trieRootHash,
      },
    }
  }
  const extrinsics = await parent.extrinsics
  const validationDataExtrinsic = extrinsics.find((extrinsic) => {
    const firstArg = meta.registry.createType<GenericExtrinsic>('GenericExtrinsic', extrinsic)?.args?.[0]
    return firstArg && 'validationData' in firstArg
  })
  if (!validationDataExtrinsic) {
    throw new Error('Missing validation data from block')
  }
  return meta.registry
    .createType<GenericExtrinsic>('GenericExtrinsic', validationDataExtrinsic)
    .args[0].toJSON() as any as ValidationData
}

export class SetValidationData implements InherentProvider {
  async createInherents(newBlock: Block, params: BuildBlockParams): Promise<HexString[]> {
    const parent = await newBlock.parentBlock
    if (!parent) throw new Error('parent block not found')

    const meta = await parent.meta
    if (!meta.tx.parachainSystem?.setValidationData) {
      return []
    }

    const extrinsic = await getValidationData(parent)

    const newEntries: [HexString, HexString | null][] = []
    const downwardMessages: DownwardMessage[] = []
    const horizontalMessages: Record<number, HorizontalMessage[]> = {}

    const paraId = await getParaId(parent.chain)

    const dmqMqcHeadKey = dmqMqcHead(paraId)
    const hrmpIngressChannelIndexKey = hrmpIngressChannelIndex(paraId)
    const hrmpEgressChannelIndexKey = hrmpEgressChannelIndex(paraId)

    const decoded = await decodeProof(
      extrinsic.validationData.relayParentStorageRoot,
      extrinsic.relayChainState.trieNodes,
    )

    const slotIncrease = (meta.consts.timestamp.minimumPeriod as any as BN)
      .divn(3000) // relaychain min period
      .toNumber()

    for (const key of Object.values(WELL_KNOWN_KEYS)) {
      if (key === WELL_KNOWN_KEYS.CURRENT_SLOT) {
        // increment current slot
        const relayCurrentSlot = decoded[key]
          ? meta.registry.createType<Slot>('Slot', hexToU8a(decoded[key])).toNumber()
          : (await getCurrentSlot(parent.chain)) * slotIncrease
        const newSlot = meta.registry.createType<Slot>('Slot', relayCurrentSlot + slotIncrease)
        newEntries.push([key, u8aToHex(newSlot.toU8a())])
      } else {
        newEntries.push([key, decoded[key]])
      }
    }

    // inject missing hrmpIngressChannel and hrmpEgressChannel
    const hrmpIngressChannels = meta.registry.createType('Vec<u32>', hexToU8a(decoded[hrmpIngressChannelIndexKey]))
    const hrmpEgressChannels = meta.registry.createType('Vec<u32>', hexToU8a(decoded[hrmpEgressChannelIndexKey]))
    for (const key in params.horizontalMessages) {
      // order is important
      const sender = meta.registry.createType('u32', key)
      if (!hrmpIngressChannels.some((x) => x.eq(sender))) {
        const idx = _.sortedIndexBy(hrmpIngressChannels, sender, (x) => x.toNumber())
        hrmpIngressChannels.splice(idx, 0, sender)
      }
      if (!hrmpEgressChannels.some((x) => x.eq(sender))) {
        const idx = _.sortedIndexBy(hrmpEgressChannels, sender, (x) => x.toNumber())
        hrmpEgressChannels.splice(idx, 0, sender)
      }
    }

    newEntries.push([hrmpIngressChannelIndexKey, hrmpIngressChannels.toHex()])
    newEntries.push([hrmpEgressChannelIndexKey, hrmpEgressChannels.toHex()])

    // inject paraHead
    const headData = meta.registry.createType('HeadData', (await parent.header).toHex())
    newEntries.push([paraHead(paraId), u8aToHex(headData.toU8a())])

    // inject downward messages
    let dmqMqcHeadHash = decoded[dmqMqcHeadKey] || '0x0000000000000000000000000000000000000000000000000000000000000000'
    for (const { msg, sentAt } of params.downwardMessages) {
      // calculate new hash
      dmqMqcHeadHash = blake2AsHex(
        u8aConcat(
          meta.registry.createType('Hash', dmqMqcHeadHash).toU8a(),
          meta.registry.createType('BlockNumber', sentAt).toU8a(),
          blake2AsU8a(meta.registry.createType('Bytes', msg).toU8a(), 256),
        ),
        256,
      )

      downwardMessages.push({
        msg,
        sentAt,
      })
    }
    newEntries.push([dmqMqcHeadKey, dmqMqcHeadHash])

    // inject horizontal messages
    for (const sender of hrmpIngressChannels) {
      // search by number and string just in case key is not a number
      const messages =
        params.horizontalMessages[sender.toNumber()] || params.horizontalMessages[sender.toString()] || []

      const channelId = meta.registry.createType<HrmpChannelId>('HrmpChannelId', {
        sender,
        receiver: paraId.toNumber(),
      })
      const hrmpChannelKey = hrmpChannels(channelId)
      const abridgedHrmpRaw = decoded[hrmpChannelKey]

      const abridgedHrmp = abridgedHrmpRaw
        ? meta.registry.createType<AbridgedHrmpChannel>('AbridgedHrmpChannel', hexToU8a(abridgedHrmpRaw)).toJSON()
        : {
            maxCapacity: 1000,
            maxTotalSize: 102400,
            maxMessageSize: 102400,
            msgCount: 0,
            totalSize: 0,
            mqcHead: 0x0000000000000000000000000000000000000000000000000000000000000000,
            senderDeposit: 5000000000000,
            recipientDeposit: 5000000000000,
          }
      const paraMessages: HorizontalMessage[] = []

      for (const { data, sentAt: _unused } of messages) {
        // fake relaychain sentAt to make validationData think this msg was sent at previous block
        const sentAt = extrinsic.validationData.relayParentNumber + 1

        // calculate new hash
        const bytes = meta.registry.createType('Bytes', data)
        abridgedHrmp.mqcHead = blake2AsHex(
          u8aConcat(
            meta.registry.createType('Hash', abridgedHrmp.mqcHead).toU8a(),
            meta.registry.createType('BlockNumber', sentAt).toU8a(),
            blake2AsU8a(bytes.toU8a(), 256),
          ),
          256,
        )
        abridgedHrmp.msgCount = (abridgedHrmp.msgCount as number) + 1
        abridgedHrmp.totalSize = (abridgedHrmp.totalSize as number) + bytes.length

        paraMessages.push({
          data,
          sentAt,
        })
      }

      horizontalMessages[sender.toNumber()] = paraMessages

      newEntries.push([hrmpChannelKey, meta.registry.createType('AbridgedHrmpChannel', abridgedHrmp).toHex()])
    }

    // inject hrmpEgressChannels proof
    for (const receiver of hrmpEgressChannels) {
      const channelId = meta.registry.createType<HrmpChannelId>('HrmpChannelId', {
        sender: paraId.toNumber(),
        receiver,
      })
      const hrmpChannelKey = hrmpChannels(channelId)
      const abridgedHrmpRaw = decoded[hrmpChannelKey]

      const abridgedHrmp = abridgedHrmpRaw
        ? meta.registry.createType<AbridgedHrmpChannel>('AbridgedHrmpChannel', hexToU8a(abridgedHrmpRaw)).toJSON()
        : {
            maxCapacity: 1000,
            maxTotalSize: 102400,
            maxMessageSize: 102400,
            msgCount: 0,
            totalSize: 0,
            mqcHead: 0x0000000000000000000000000000000000000000000000000000000000000000,
          }
      newEntries.push([hrmpChannelKey, meta.registry.createType('AbridgedHrmpChannel', abridgedHrmp).toHex()])
    }

    const upgradeKey = upgradeGoAheadSignal(paraId)
    const pendingUpgrade = await parent.get(compactHex(meta.query.parachainSystem.pendingValidationCode()))
    if (pendingUpgrade) {
      // send goAhead signal
      const goAhead = meta.registry.createType('UpgradeGoAhead', 'GoAhead')
      newEntries.push([upgradeKey, goAhead.toHex()])
    } else {
      // make sure previous goAhead is removed
      newEntries.push([upgradeKey, null])
    }

    const { trieRootHash, nodes } = await createProof(extrinsic.relayChainState.trieNodes, newEntries)

    const newData = {
      ...extrinsic,
      downwardMessages,
      horizontalMessages,
      validationData: {
        ...extrinsic.validationData,
        relayParentStorageRoot: trieRootHash,
        relayParentNumber: extrinsic.validationData.relayParentNumber + slotIncrease,
      },
      relayChainState: {
        trieNodes: nodes,
      },
    } satisfies ValidationData

    const inherent = new GenericExtrinsic(meta.registry, meta.tx.parachainSystem.setValidationData(newData))

    return [inherent.toHex()]
  }
}
