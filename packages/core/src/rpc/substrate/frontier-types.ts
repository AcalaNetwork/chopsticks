import { TypeRegistry } from '@polkadot/types'

// Singleton registry with Frontier EVM types
export const registry = new TypeRegistry()
registry.register({
  EvmAccountBasic: { nonce: 'u256', balance: 'u256' },
  EvmExitSucceed: { _enum: ['Stopped', 'Returned', 'Suicided'] },
  EvmExitError: {
    _enum: {
      StackUnderflow: null,
      StackOverflow: null,
      InvalidJump: null,
      InvalidRange: null,
      DesignatedInvalid: null,
      CallTooDeep: null,
      CreateCollision: null,
      CreateContractLimit: null,
      OutOfOffset: null,
      OutOfGas: null,
      OutOfFund: null,
      PCUnderflow: null,
      CreateEmpty: null,
      Other: 'Text',
      MaxNonce: null,
      InvalidCode: 'u8',
    },
  },
  EvmExitRevert: { _enum: ['Reverted'] },
  EvmExitFatal: {
    _enum: {
      NotSupported: null,
      UnhandledInterrupt: null,
      CallErrorAsFatal: 'EvmExitError',
      Other: 'Text',
    },
  },
  EvmExitReason: {
    _enum: {
      Succeed: 'EvmExitSucceed',
      Error: 'EvmExitError',
      Revert: 'EvmExitRevert',
      Fatal: 'EvmExitFatal',
    },
  },
  EvmUsedGas: { standard: 'u256', effective: 'u256' },
  EvmWeightInfo: {
    refTimeLimit: 'Option<u64>',
    proofSizeLimit: 'Option<u64>',
    refTimeUsage: 'Option<u64>',
    proofSizeUsage: 'Option<u64>',
  },
  EvmLog: { address: 'H160', topics: 'Vec<H256>', data: 'Bytes' },
  EvmExecutionInfoV2: {
    exitReason: 'EvmExitReason',
    value: 'Bytes',
    usedGas: 'EvmUsedGas',
    weightInfo: 'Option<EvmWeightInfo>',
    logs: 'Vec<EvmLog>',
  },
  EvmCallParams: {
    from: 'H160',
    to: 'H160',
    data: 'Bytes',
    value: 'u256',
    gasLimit: 'u256',
    maxFeePerGas: 'Option<u256>',
    maxPriorityFeePerGas: 'Option<u256>',
    nonce: 'Option<u32>',
    estimate: 'bool',
    accessList: 'Option<Vec<(H160, Vec<H256>)>>',
    authorizationList: 'Option<Vec<Bytes>>',
  },
})
