import { builtinModules } from 'node:module'
import { defineConfig } from 'rollup'
import commonjs from '@rollup/plugin-commonjs'
import esbuild from 'rollup-plugin-esbuild'
import json from '@rollup/plugin-json'
import pkg from './package.json' assert { type: 'json' }
import resolve from '@rollup/plugin-node-resolve'

const entries = {
	index: 'src/index.ts',
	'wasm-executor-index': 'src/wasm-executor/index.ts',
	'browser-worker': 'src/wasm-executor/browser-worker.ts',
	'node-worker': 'src/wasm-executor/node-worker.ts',
	'browser-wasm-executor': 'src/wasm-executor/browser-wasm-executor.mjs',
	'node-wasm-executor': 'src/wasm-executor/node-wasm-executor.mjs',
}

const external = [...builtinModules, ...Object.keys(pkg.dependencies || {}), /node_modules/]

const plugins = [
	resolve({
		preferBuiltins: true,
		browser: true,
	}),
	json(),
	commonjs(),
	esbuild({
		target: 'node14',
	}),
]

export default defineConfig([
	{
		input: entries,
		output: {
			dir: 'dist',
			format: 'esm',
			entryFileNames: '[name].mjs',
			chunkFileNames: 'chunk-[name].mjs',
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
])

function onwarn(message) {
	if (['EMPTY_BUNDLE', 'CIRCULAR_DEPENDENCY', 'INVALID_ANNOTATION'].includes(message.code)) return
	// eslint-disable-next-line no-undef
	console.error(message)
}
