import * as tsConfigPaths from 'tsconfig-paths'
import { pathToFileURL } from 'url'
import { resolve as resolveTs } from 'ts-node/esm'

const { absoluteBaseUrl, paths } = tsConfigPaths.loadConfig()
const matchPath = tsConfigPaths.createMatchPath(absoluteBaseUrl, paths)

export function resolve(specifier, ctx, defaultResolve) {
  const match = matchPath(specifier)
  return match
    ? resolveTs(pathToFileURL(`${match}`).href, ctx, defaultResolve)
    : resolveTs(specifier, ctx, defaultResolve)
}

export { load, transformSource } from 'ts-node/esm'
