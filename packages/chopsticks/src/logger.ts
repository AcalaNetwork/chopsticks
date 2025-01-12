import _ from 'lodash'

export { defaultLogger, truncate } from '@acala-network/chopsticks-core'

const showProgress = process.stdout.isTTY && !process.env.CI && !process.env.TEST

export const spinnerFrames =
  process.platform === 'win32' ? ['-', '\\', '|', '/'] : ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']
let index = 0

// clear to the right from cursor
const clearStatus = _.debounce(() => process.stdout.clearLine(1), 500, { trailing: true })

export const apiFetching = _.throttle(
  () => {
    if (!showProgress) return

    // print ` ⠋ Fetching|` and move cursor at position 0 of the line `| ⠋ Fetching`
    process.stdout.write(` ${spinnerFrames[index++]} Fetching`)
    process.stdout.cursorTo(0)
    index = ++index % spinnerFrames.length
    clearStatus()
  },
  50,
  { leading: true },
)
