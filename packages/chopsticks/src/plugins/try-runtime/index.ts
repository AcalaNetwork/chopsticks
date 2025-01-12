import { writeFileSync } from 'node:fs'
import { BuildBlockMode } from '@acala-network/chopsticks-core'
import type { Argv } from 'yargs'
import { z } from 'zod'

import { setupContext } from '../../context.js'
import { configSchema, getYargsOptions } from '../../schema/index.js'
import { overrideWasm } from '../../utils/override.js'

const schema = z.object({
  endpoint: configSchema.shape.endpoint,
  block: configSchema.shape.block,
  db: configSchema.shape.db,
  'runtime-log-level': configSchema.shape['runtime-log-level'].default(5),
  runtime: z.string({
    description: 'Path to WASM built with feature `try-runtime` enabled',
  }),
  'import-storage': configSchema.shape['import-storage'],
  checks: z.enum(['None', 'All', 'PreAndPost', 'TryState']),
  'disable-spec-check': z.boolean({ description: 'Disable spec name/version check' }).optional(),
  'output-path': z
    .string({
      description: 'File path to print output',
    })
    .optional(),
})

export const cli = (y: Argv) => {
  y.command(
    'try-runtime',
    '🚧 EXPERIMENTAL: Check upgrade migrations 🚧',
    (yargs) => yargs.options(getYargsOptions(schema.shape)),
    async (argv) => {
      console.log('🚧 EXPERIMENTAL FEATURE 🚧')

      const config = schema.parse(argv)
      if (!config.db) {
        console.log('⚠️ Make sure to provide db, it will speed up the process')
      }
      const context = await setupContext({
        ...config,
        host: 'localhost',
        port: 8000,
        'build-block-mode': BuildBlockMode.Manual,
      })
      const block = context.chain.head
      const registry = await block.registry
      registry.register({
        UpgradeCheckSelect: {
          _enum: {
            None: null,
            All: null,
            PreAndPost: null,
            TryState: null,
          },
        },
      })

      const oldVersion = await block.runtimeVersion
      // set new runtime
      await overrideWasm(block.chain, config.runtime)
      const newVersion = await block.runtimeVersion
      console.log('\n')
      console.log(new Array(80).fill('-').join(''))
      console.log(`\tCurrent runtime spec_name: ${oldVersion.specName}, spec_version: ${oldVersion.specVersion}`)
      console.log(`\tNew runtime spec_name: ${newVersion.specName}, spec_version: ${newVersion.specVersion}`)
      console.log(new Array(80).fill('-').join(''))
      console.log('\n')

      if (!config['disable-spec-check'] && oldVersion.specName !== newVersion.specName) {
        console.log('❌ Spec name does not match. Use --disable-spec-check to disable this check')
        process.exit(1)
      }

      if (!config['disable-spec-check'] && oldVersion.specVersion >= newVersion.specVersion) {
        console.log('❌ Spec version must increase. Use --disable-spec-check to disable this check')
        process.exit(1)
      }

      const select_none = registry.createType('UpgradeCheckSelect', config.checks)
      const response = await block.call('TryRuntime_on_runtime_upgrade', [select_none.toHex()])

      if (argv.outputPath) {
        writeFileSync(argv.outputPath as string, JSON.stringify(response, null, 2))
      } else {
        const [actual, max] = registry.createType('(Weight, Weight)', response.result)
        const consumedWeight = actual.refTime.toBn()
        const maxWeight = max.refTime.toBn()

        console.log('\n🚧 EXPERIMENTAL FEATURE 🚧')
        console.log('⚠️ PoV measure is not supported, consider using https://crates.io/crates/try-runtime-cli')

        console.log(
          `\nConsumed weight: ${consumedWeight.toNumber()} of max: ${maxWeight.toNumber()} ( ${((consumedWeight.toNumber() / maxWeight.toNumber()) * 100).toFixed(2)}% )`,
        )

        if (consumedWeight.gt(maxWeight)) {
          console.log('❌ Weight limit is exceeded ❌')
          process.exit(1)
        }
      }

      process.exit(0)
    },
  )
}
