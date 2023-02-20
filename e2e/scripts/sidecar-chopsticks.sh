#!/usr/bin/env bash

set -xe

# clone sidecard
git clone https://github.com/paritytech/substrate-api-sidecar.git

# run chopsticks node
yarn workspace @acala-network/chopsticks run start dev --endpoint wss://rpc.polkadot.io --port 8011 & POLKADOT_PID=$!
yarn workspace @acala-network/chopsticks run start dev --endpoint wss://statemint-rpc.polkadot.io --port 8012 & STATEMINT_PID=$!

# run tests
(cd substrate-api-sidecar && \
yarn && \
yarn test:latest-e2e-tests --local ws://localhost:8011 --chain polkadot && \
yarn test:latest-e2e-tests --local ws://localhost:8012 --chain statemint)

#cleanup
rm -rf substrate-api-sidecar
kill $POLKADOT_PID
kill $STATEMINT_PID
