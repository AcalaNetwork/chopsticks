#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const { zlibSync } = require('fflate/node');
const { formatNumber } = require('@polkadot/util');

const data = fs.readFileSync(path.resolve(__dirname, `../browser/chopsticks_executor_bg.wasm`));
const compressed = Buffer.from(zlibSync(data, { level: 9 }));
const base64 = compressed.toString('base64');

console.log(`*** Compressed WASM: in=${formatNumber(data.length)}, out=${formatNumber(compressed.length)}, opt=${(100 * compressed.length / data.length).toFixed(2)}%, base64=${formatNumber(base64.length)}`);

fs.writeFileSync(path.resolve(__dirname, `../browser/index.js`), `// Auto-generated file, do not edit by hand
const LEN_IN = ${compressed.length};
const LEN_OUT = ${data.length};
const BYTES = '${base64}';

import { base64Decode, unzlibSync } from '@polkadot/wasm-util';
const WASM_BYTES = unzlibSync(base64Decode(BYTES, new Uint8Array(LEN_IN)), new Uint8Array(LEN_OUT));

import wasmInit from "./chopsticks_executor.js";
const blob = new Blob([WASM_BYTES], { type: "application/wasm" });
wasmInit(URL.createObjectURL(blob));

export * from "./chopsticks_executor.js";
`);
