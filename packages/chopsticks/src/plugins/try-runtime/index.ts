import { defaultOptions, processArgv } from '../../cli'
import { tryRuntime } from './try-runtime'
import type yargs from 'yargs'

export const cli = (y: yargs.Argv) => {
  y.command(
    'try-runtime',
    'Runs runtime upgrade',
    (yargs) =>
      yargs.options({
        ...defaultOptions,
        'wasm-override': {
          desc: 'Path to WASM built with feature `try-runtime` enabled',
          string: true,
          required: true,
        },
        'output-path': {
          desc: 'File path to print output',
          string: true,
        },
        html: {
          desc: 'Generate html with storage diff',
        },
        open: {
          desc: 'Open generated html',
        },
      }),
    async (argv) => {
      await tryRuntime(await processArgv(argv))
    },
  )
}
