# Chopsticks

Create parallel reality of your Substrate network.

## Quick Start

Fork Acala mainnet: `yarn dlx @acala-network/chopsticks dev --endpoint=wss://acala-rpc-2.aca-api.network/ws`

It is recommended to use config file. You can check [configs](configs/) for examples.

You can run a test node with config with `yarn dlx @acala-network/chopsticks dev --config=<config_file_path>`

## Install

Make sure you have setup Rust environment (>= 1.64).

- Clone repository with submodules ([smoldot](https://github.com/paritytech/smoldot))
  - `git clone --recurse-submodules https://github.com/AcalaNetwork/chopsticks.git && cd chopsticks`
- Install deps
  - `yarn`
- Build wasm
  - `yarn build-wasm`

## Run

- Replay latest block
  - `yarn start run-block --endpoint=wss://acala-rpc-2.aca-api.network/ws`
  - This will replay the last block and print out the changed storages
  - Use option `--block` to replay certain block hash
  - Use option `--output-path=<file_path>` to print out JSON file
  - Use option `--html` to generate storage diff preview (add `--open` to automatically open file)

- Dry run extrinsic, same as `run-block`, example:
  - `yarn start dry-run --config=configs/mandala.yml --html --open --extrinsic=0x39028400d43593c715fdd31c61141abd04a99fd6822c8558854ccde39a5684e7a56da27d01183abac17ff331f8b65dbeddd27f014dedd892020cfdc6c40b574f6930f8cf391bde95997ae2edc5b1192a4036ea97804956c4b5497175c8d68b630301685889450200000a00008eaf04151687736326c9fea17e25fc5287613693c912909cb226aa4794f26a480284d717`
  - Dry run call `yarn start dry-run --config=configs/mandala.yml --html --open --extrinsic=0xff00000080969800 --address=5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY --at=0x5f660b32489966cc707ecde831864aeecf9092c4983e75f9880313e9158d62b9`

- Run a test node
  - `yarn start dev --endpoint=wss://acala-rpc-2.aca-api.network/ws`
  - You have a test node running at `ws://localhost:8000`
  - You can use [Polkadot.js Apps](https://polkadot.js.org/apps/) to connect to this node
  - Submit any transaction to produce a new block in the in parallel reality
  - (Optional) Pre-define/override storage using option `--import-storage=storage.[json/yaml]`. See example storage below.
  ```json5
  {
    "Sudo": {
      "Key": "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY"
    },
    "TechnicalCommittee": {
      "Members": ["5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY"]
    },
    "Tokens": {
      "Accounts": [
        [
          ["5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY", { "token": "KAR" }],
          {
            "free": 1000000000000000,
          }
        ]
      ]
    }
  }
  ```
- Run Kusama fork
  - Edit configs/kusama.yml if needed. (e.g. update the block number)
  - `yarn start dev --config=configs/kusama.yml`

- Setup XCM multichain
**_NOTE:_** You can also connect multiple parachains without a relaychain
```bash
yarn start xcm --relaychain=configs/kusama.yml --parachain=configs/karura.yml --parachain=configs/statemine.yml
```

## Documentation

External documentation on Chopsticks can be found at the following links:  

- [Moonbeam documentation site](https://docs.moonbeam.network/builders/build/substrate-api/chopsticks/)
