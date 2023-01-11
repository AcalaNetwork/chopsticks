import { execSync } from 'node:child_process'

export const openHtml = (filePath: string) => {
  const start = process.platform == 'darwin' ? 'open' : process.platform == 'win32' ? 'start' : 'xdg-open'
  execSync(start + ' ' + filePath)
}
