import { Argv } from 'yargs'
import { pinoLogger } from '@acala-network/chopsticks-core'
import { writeFileSync } from 'fs'
import { z } from 'zod'
import _ from 'lodash'

import { configSchema, getYargsOptions } from '../../schema/index.js'
import { fetchEVMTransaction, prepareBlock, traceCalls, traceVM } from './utils.js'
import { setupContext } from '../../context.js'

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
      const wasmPath = config['wasm-override']
      delete config['wasm-override']

      const context = await setupContext(config, false)
      const txHash = argv['tx-hash']
      if (!txHash) {
        throw new Error('tx-hash is required')
      }

      const transaction = await fetchEVMTransaction(await context.chain.head.runtimeVersion, txHash)
      pinoLogger.trace({ transaction }, 'Transaction fetched')
      const { blockHash } = transaction

      const { tracingBlock, extrinsic } = await prepareBlock(context.chain, blockHash, txHash, wasmPath)

      if (config.vm) {
        pinoLogger.info('Running EVM opcode trace ...')
        const steps = await traceVM(tracingBlock, extrinsic)
        writeFileSync(argv.output, JSON.stringify(steps, null, 2))
      } else {
        pinoLogger.info('Running EVM call trace ...')
        const calls = await traceCalls(tracingBlock, extrinsic)
        writeFileSync(argv.output, JSON.stringify(calls, null, 2))
      }

      pinoLogger.info(`Trace logs: ${argv.output}`)
      process.exit(0)
    },
  )
}
