import { HexString } from '@polkadot/util/types'
import { Registry } from '@polkadot/types/types'

export type CallTrace = {
  type: 'CALL' | 'CALLCODE' | 'STATICCALL' | 'DELEGATECALL' | 'CREATE' | 'SUICIDE'
  from: HexString
  to: HexString
  input: HexString
  value: HexString
  gas: number
  gasUsed: number
  output: HexString | null
  error: string | null
  revertReason: string | null
  depth: number
  calls: CallTrace[]
}

export type Step = {
  op: number
  pc: number
  depth: number
  gas: number
  stack: HexString[]
  memory: string[] | null
}

export type TraceOutcome =
  | {
      steps: Step[]
    }
  | {
      calls: CallTrace[]
    }

export const registerTypes = (registry: Registry) => {
  registry.register({
    Step: {
      op: 'u8',
      pc: 'Compact<u32>',
      depth: 'Compact<u32>',
      gas: 'Compact<u64>',
      stack: 'Vec<Bytes>',
      memory: 'Option<Vec<Bytes>>',
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
    TraceOutcome: {
      _enum: {
        Calls: 'Vec<CallTrace>',
        Steps: 'Vec<Step>',
      },
    },
    OpcodeConfig: {
      page: 'u32',
      pageSize: 'u32',
      disableStack: 'bool',
      enableMemory: 'bool',
    },
    TracerConfig: {
      _enum: {
        CallTracer: null,
        OpcodeTracer: 'OpcodeConfig',
      },
    },
  })
}
