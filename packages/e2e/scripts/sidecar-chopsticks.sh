#!/usr/bin/env bash

set -x

# run chopsticks node
yarn script:start -c acala --port 8011 & ACALA_PID=$!
yarn script:start -c karura --port 8012 & KARURA_PID=$!

printf "Waiting for chains to be ready"
attempts=30 # 5 minutes
until nc -z localhost 8011 && nc -z localhost 8012; do
  attempts=$((attempts - 1))
  if [ $attempts -eq 0 ]; then
	echo "Chains failed to start"
	exit 1
  fi
  sleep 5
done

SAS_SUBSTRATE_URL=ws://127.0.0.1:8011 SAS_EXPRESS_PORT=8111 npx --yes @substrate/api-sidecar & ACALA_SIDECAR_PID=$!
SAS_SUBSTRATE_URL=ws://127.0.0.1:8012 SAS_EXPRESS_PORT=8112 npx --yes @substrate/api-sidecar & KARURA_SIDECAR_PID=$!

printf "Waiting for sidecars to be ready"
attempts=30 # 5 minutes
until nc -z localhost 8111 && nc -z localhost 8112; do
  attempts=$((attempts - 1))
  if [ $attempts -eq 0 ]; then
	echo "Sidecars failed to start"
	exit 1
  fi
  sleep 5
done

# clone sidecard
git clone --depth 1 --branch v17.2.0 --single-branch https://github.com/paritytech/substrate-api-sidecar.git

# prepare sidecar
cd substrate-api-sidecar
yarn install

npx --yes ts-node --transpile-only e2e-tests/latest/index.ts --chain acala --url http://127.0.0.1:8111
ACALA_TEST_RESULT=$?

npx --yes ts-node --transpile-only e2e-tests/latest/index.ts --chain karura --url http://127.0.0.1:8112
KARURA_TEST_RESULT=$?

cd ..

# cleanup
kill -s INT $(pgrep -P $ACALA_SIDECAR_PID) $(pgrep -P $KARURA_SIDECAR_PID)
kill $ACALA_SIDECAR_PID $KARURA_SIDECAR_PID $ACALA_PID $KARURA_PID

rm -rf substrate-api-sidecar

# exit with error code if any of the tests failed
if [ $ACALA_TEST_RESULT -ne 0 ] || [ $KARURA_TEST_RESULT -ne 0 ]; then
  exit 1
fi
