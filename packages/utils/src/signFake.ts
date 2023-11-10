import { ApiPromise } from '@polkadot/api'
import { GenericExtrinsic } from '@polkadot/types'
import { SignatureOptions } from '@polkadot/types/types'

export type SignFakeOptions = Partial<SignatureOptions>

export const signFakeWithApi = async (
  api: ApiPromise,
  tx: GenericExtrinsic,
  addr: string,
  options: SignFakeOptions = {},
) => {
  const nonce = options.nonce ?? (await api.query.system.account(addr)).nonce
  signFake(tx, addr, {
    nonce,
    genesisHash: api.genesisHash,
    runtimeVersion: api.runtimeVersion,
    blockHash: api.genesisHash,
    ...options,
  })
}

export const signFake = (tx: GenericExtrinsic, addr: string, options: SignatureOptions) => {
  const mockSignature = new Uint8Array(64)
  mockSignature.fill(0xcd)
  mockSignature.set([0xde, 0xad, 0xbe, 0xef])
  tx.signFake(addr, options)

  tx.signature.set(mockSignature)
}
