#!/bin/bash

set -e

## Build CJS
yarn swc ./pkg -C module.type=commonjs -d dist/cjs --copy-files --strip-leading-paths
## Build ESM
yarn swc ./pkg -C module.type=es6 -d dist/esm --copy-files --strip-leading-paths

## Copy types
cp pkg/chopsticks_executor.d.ts dist/cjs/index.d.ts
cp pkg/chopsticks_executor.d.ts dist/esm/index.d.ts

## Make package CJS
echo '{ "type": "commonjs" }' > dist/cjs/package.json
## Make package ESM
echo '{ "type": "module" }' > dist/esm/package.json
