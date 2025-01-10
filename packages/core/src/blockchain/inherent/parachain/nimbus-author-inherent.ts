import { GenericExtrinsic } from '@polkadot/types'
import type { HexString } from '@polkadot/util/types'
import { compactHex } from '../../../utils/index.js'
import type { Block } from '../../block.js'
import type { BuildBlockParams } from '../../txpool.js'
import type { InherentProvider } from '../index.js'
// Support for Nimbus Author Inherent
export class SetNimbusAuthorInherent implements InherentProvider {
  async createInherents(newBlock: Block, _params: BuildBlockParams): Promise<HexString[]> {
    const parent = await newBlock.parentBlock
    if (!parent) throw new Error('parent block not found')

    const meta = await parent.meta

    if (!meta.tx.authorInherent?.kickOffAuthorshipValidation) {
      if (meta.query.authorNoting) {
        newBlock
          .pushStorageLayer()
          .set(
            compactHex(meta.query.authorNoting.didSetContainerAuthorData()),
            meta.registry.createType('bool', true).toHex(),
          )
      }
      return []
    }

    // mock author inherent data and authorities noting data
    const layer = newBlock.pushStorageLayer()

    const accountType = meta.registry.hasType('NimbusPrimitivesNimbusCryptoPublic')
      ? 'NimbusPrimitivesNimbusCryptoPublic'
      : 'AccountId'
    const alice = meta.registry.hasType('NimbusPrimitivesNimbusCryptoPublic')
      ? '0x567b6ddb05396c0a83853b6f40d27450534c7963df8619b8c6064480c4db9703'
      : '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY'
    layer.set(compactHex(meta.query.authorInherent.author()), meta.registry.createType(accountType, alice).toHex())

    if (meta.query.authoritiesNoting) {
      layer.set(
        compactHex(meta.query.authoritiesNoting.authorities()),
        meta.registry.createType(`Vec<${accountType}>`, [alice]).toHex(),
      )
      layer.set(
        compactHex(meta.query.authoritiesNoting.didSetOrchestratorAuthorityData()),
        meta.registry.createType('bool', true).toHex(),
      )
    }
    if (meta.query.parachainStaking) {
      layer.set(
        compactHex(meta.query.parachainStaking.selectedCandidates()),
        meta.registry.createType(`Vec<${accountType}>`, [alice]).toHex(),
      )
    }
    if (meta.query.authorityAssignment && meta.query.session) {
      const session = await newBlock.chain.head.read('u32', meta.query.session.currentIndex)

      if (session) {
        // We need to set both the assignemnt for current and next sessions
        layer.set(
          compactHex(meta.query.authorityAssignment.collatorContainerChain(session)),
          meta.registry
            .createType(`DpCollatorAssignmentAssignedCollatorsPublic`, {
              orchestratorChain: [alice],
            })
            .toHex(),
        )
        layer.set(
          compactHex(meta.query.authorityAssignment.collatorContainerChain(session.toBigInt() + 1n)),
          meta.registry
            .createType(`DpCollatorAssignmentAssignedCollatorsPublic`, {
              orchestratorChain: [alice],
            })
            .toHex(),
        )
      }
      layer.set(
        compactHex(meta.query.authorNoting.didSetContainerAuthorData()),
        meta.registry.createType('bool', true).toHex(),
      )
    }
    return [new GenericExtrinsic(meta.registry, meta.tx.authorInherent.kickOffAuthorshipValidation()).toHex()]
  }
}
