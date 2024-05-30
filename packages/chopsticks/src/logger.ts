import _ from 'lodash'

export { defaultLogger, truncate } from '@acala-network/chopsticks-core'

export const spinnerFrames =
  process.platform === 'win32' ? ['-', '\\', '|', '/'] : ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']
let index = 0

const clearStatus = _.debounce(() => process.stdout.clearLine(1), 500, { trailing: true })

export const statusFetching = () => {
  if (!process.stdout.clearLine) return
  if (process.env['CI'] || process.env['VITEST'] || process.env['TEST']) return
  process.stdout.write(spinnerFrames[index++] + ' Fetching')
  process.stdout.cursorTo(0)
  index = ++index % spinnerFrames.length
  clearStatus()
}
