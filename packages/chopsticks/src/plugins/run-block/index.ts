import type yargs from 'yargs'

import { defaultOptions, mockOptions, processArgv } from '../../cli'
import { runBlock } from './run-block'

export const cli = (y: yargs.Argv) => {
  y.command(
    'run-block',
    'Replay a block',
    (yargs) =>
      yargs.options({
        ...defaultOptions,
        ...mockOptions,
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
      await runBlock(await processArgv(argv))
    },
  )
}
