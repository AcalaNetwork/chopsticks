#!/usr/bin/env bash

set -x

# clone sidecard
git clone https://github.com/paritytech/substrate-api-sidecar.git

# run chopsticks node
yarn dev:acala --port 8011 & ACALA_PID=$!
yarn dev:karura --port 8012 & KARURA_PID=$!

# prepare sidecar
cd substrate-api-sidecar

yarn

SAS_SUBSTRATE_URL=ws://127.0.0.1:8011 SAS_EXPRESS_PORT=8111 yarn ts-node src/main.ts & ACALA_SIDECAR_PID=$!
SAS_SUBSTRATE_URL=ws://127.0.0.1:8012 SAS_EXPRESS_PORT=8112 yarn ts-node src/main.ts & KARURA_SIDECAR_PID=$!

# wait a bit for it to be ready
sleep 10

# run the tests
yarn ts-node e2e-tests/latest/index.ts --chain acala --url http://127.0.0.1:8111
ACALA_TEST_RESULT=$?

yarn ts-node e2e-tests/latest/index.ts --chain karura --url http://127.0.0.1:8112
KARURA_TEST_RESULT=$?

cd ..

# cleanup
kill $ACALA_SIDECAR_PID
kill $KARURA_SIDECAR_PID
kill $ACALA_PID
kill $KARURA_PID

rm -rf substrate-api-sidecar

# exit with error code if any of the tests failed
if [ $ACALA_TEST_RESULT -ne 0 ] || [ $KARURA_TEST_RESULT -ne 0 ]; then
  exit 1
fi
