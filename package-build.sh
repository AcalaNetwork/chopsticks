#!/bin/bash

set -e

## Build CJS
yarn swc ./src --config-file $(dirname "$0")/.cjsswcrc -d dist/cjs --copy-files --strip-leading-paths
## Build ESM
yarn swc ./src --config-file $(dirname "$0")/.esmswcrc -d dist/esm --copy-files --strip-leading-paths

## Build types
yarn tsc -p tsconfig.json --declarationDir dist/cjs
yarn tsc -p tsconfig.json --declarationDir dist/esm

## Make package CJS
echo '{ "type": "commonjs" }' > dist/cjs/package.json
