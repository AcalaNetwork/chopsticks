# Chopsticks

Create parallel reality of your Substrate network.

## Install

Make sure you have setup Rust environment (>= 1.64).

- Clone repository with submodules ([smoldot](https://github.com/paritytech/smoldot))
  - `git clone --recurse-submodules https://github.com/AcalaNetwork/chopsticks.git && cd chopsticks`
- Install deps
  - `yarn`
- Build wasm
  - `yarn build-wasm`

## Run

- Run nodejs runner
  - `yarn start run-block --endpoint=wss://acala-rpc-2.aca-api.network/ws`

Connect to the rpc via localhost:8000 and you may be able to submit transaction and it will be executed in parallel reality.

NOTE: subscriptions are not yet implemented so you will need to refresh to see new blocks.

NOTE2: this currently takes ~half minute to produce a new block.

Next step:

- Implements subscription
- Disable signature verification
- API for arbitrary storage override
- Compile the rust part into wasm
