import { builtinModules, createRequire } from 'module'
import { defineConfig } from 'rollup'
import commonjs from '@rollup/plugin-commonjs'
import dts from 'rollup-plugin-dts'
import json from '@rollup/plugin-json'
import resolve from '@rollup/plugin-node-resolve'
import typescript from '@rollup/plugin-typescript'

const require = createRequire(import.meta.url)
const pkg = require('./package.json')

const entries = {
  index: 'src/index.ts',
  api: 'src/api.ts',
  server: 'src/server.ts',
  executor: 'src/executor.ts',
  task: 'src/task.ts',
  db: 'src/db/index.ts',
  blockchain: 'src/blockchain/index.ts',
  rpc: 'src/rpc/index.ts',
  utils: 'src/utils/index.ts',
}

const external = [
  builtinModules,
  ...builtinModules.map((m) => 'node:' + m),
  ...Object.keys(pkg.dependencies || {}),
  /node_modules/,
]

const plugins = [
  resolve({
    preferBuiltins: true,
  }),
  json(),
  commonjs(),
  typescript({ module: "ESNext" }),
]

export default defineConfig([
  {
    input: entries,
    output: {
      dir: 'dist',
      format: 'esm',
      entryFileNames: '[name].js',
      chunkFileNames: 'chunk-[name].js',
    },
    external,
    plugins,
    onwarn,
  },
  {
    input: entries,
    output: {
      dir: 'dist',
      format: 'cjs',
      entryFileNames: '[name].cjs',
      chunkFileNames: 'chunk-[name].cjs',
    },
    external,
    plugins,
    onwarn,
  },
  {
    input: entries,
    output: {
      dir: 'dist',
      entryFileNames: '[name].d.ts',
      format: 'esm',
    },
    external,
    plugins: [dts({ respectExternal: false })],
    onwarn,
  },
])

function onwarn(warning, rollupWarn) {
  if (!warning.code || !['UNUSED_EXTERNAL_IMPORT', 'CIRCULAR_DEPENDENCY'].includes(warning.code)) {
    rollupWarn(warning)
  }
}
