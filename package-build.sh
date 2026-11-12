#!/bin/bash

set -e

## Build CJS
bunx swc ./src --config-file $(dirname "$0")/.cjsswcrc -d dist/cjs --copy-files --strip-leading-paths
## Build ESM
bunx swc ./src --config-file $(dirname "$0")/.esmswcrc -d dist/esm --copy-files --strip-leading-paths

## Build types
bunx tsc -p tsconfig.json --declarationDir dist/cjs
bunx tsc -p tsconfig.json --declarationDir dist/esm

## Make package CJS
echo '{ "type": "commonjs" }' > dist/cjs/package.json
