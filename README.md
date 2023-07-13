# Chopsticks

Create parallel reality of your Substrate network.

## Quick Start

Fork Acala mainnet: `npx @acala-network/chopsticks@latest --endpoint=wss://acala-rpc-2.aca-api.network/ws`

It is recommended to use config file. You can check [configs](configs/) for examples.

Run node using config file

```bash
# npx @acala-network/chopsticks@latest --config= url | path | config_file_name
# i.e: using configs/acala.yml

npx @acala-network/chopsticks@latest -c acala
```

### Example configs can be found here

- [acala](configs/acala.yml)
- [astar](configs/astar.yml)
- [basilisk](configs/basilisk.yml)
- [composable-polkadot](configs/composable-polkadot.yml)
- [hydradx](configs/hydradx.yml)
- [karura](configs/karura.yml)
- [kusama](configs/kusama.yml)
- [mandala-genesis](configs/mandala-genesis.yml)
- [mandala](configs/mandala.yml)
- [mangata](configs/mangata.yml)
- [moonbase-alpha](configs/moonbase-alpha.yml)
- [moonbeam](configs/moonbeam.yml)
- [moonriver](configs/moonriver.yml)
- [nodle-eden](configs/nodle-eden.yml)
- [picasso-kusama](configs/picasso-kusama.yml)
- [picasso-rococo](configs/picasso-rococo.yml)
- [polkadot](configs/polkadot.yml)
- [rococo](configs/rococo.yml)
- [shiden](configs/shiden.yml)
- [statemine](configs/statemine.yml)
- [statemint](configs/statemint.yml)

## Install

Make sure you have setup Rust environment (>= 1.64).

- Clone repository with submodules ([smoldot](https://github.com/paritytech/smoldot))
  - `git clone --recurse-submodules https://github.com/AcalaNetwork/chopsticks.git && cd chopsticks`
- Install deps
  - `yarn`
- Build wasm. Please do not use IDE's built-in tools to build wasm.
  - `yarn build-wasm`

## Run

- Replay latest block
  - `npx @acala-network/chopsticks@latest run-block --endpoint=wss://acala-rpc-2.aca-api.network/ws`
  - This will replay the last block and print out the changed storages
  - Use option `-b|--block` to replay certain block hash
  - Use option `--output-path=<file_path>` to print out JSON file
  - Use option `--html` to generate storage diff preview (add `--open` to automatically open file)

## Dry-run

- Dry run hep:
 ```
 npx @acala-network/chopsticks@latest dry-run --help
 ```

- Dry run extrinsic, same as `run-block`, example:
```
npx @acala-network/chopsticks@latest dry-run --config=configs/mandala.yml --html --open --extrinsic=0x39028400d43593c715fdd31c61141abd04a99fd6822c8558854ccde39a5684e7a56da27d01183abac17ff331f8b65dbeddd27f014dedd892020cfdc6c40b574f6930f8cf391bde95997ae2edc5b1192a4036ea97804956c4b5497175c8d68b630301685889450200000a00008eaf04151687736326c9fea17e25fc5287613693c912909cb226aa4794f26a480284d717
```

- Dry run call, make sure `mock-signature-host: true` to fake caller's signature:
```
npx @acala-network/chopsticks@latest dry-run --config=configs/mandala.yml --html --open --extrinsic=0xff00000080969800 --address=5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY --at=<block_hash_optional>
```

- Dry run a preimage:
 ```
npx @acala-network/chopsticks@latest dry-run --endpoint=wss://rpc.polkadot.io --preimage=<preimage> --open
 ```

- Dry run a preimage and execute an extrinsic after that:
```
npx @acala-network/chopsticks@latest dry-run --endpoint=wss://rpc.polkadot.io --preimage=<preimage> --extrinsic=<extrinsic> --open
```

- Dry run a preimage and execute a call after that, make sure `mock-signature-host: true` to fake caller's signature:
 ```
npx @acala-network/chopsticks@latest dry-run --config=configs/mandala.yml --preimage=<preimage> --extrinsic=<call> --address=<who> --open
 ```

- Run a test node
  - `npx @acala-network/chopsticks@latest --endpoint=wss://acala-rpc-2.aca-api.network/ws`
  - You have a test node running at `ws://localhost:8000`
  - You can use [Polkadot.js Apps](https://polkadot.js.org/apps/) to connect to this node
  - Submit any transaction to produce a new block in the in parallel reality
  - (Optional) Pre-define/override storage using option `-s|--import-storage=storage.[json/yaml]`. See example storage below.

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
  - `npx @acala-network/chopsticks@latest --config=configs/kusama.yml`

- Setup XCM multichain
**_NOTE:_** You can also connect multiple parachains without a relaychain

```bash
npx @acala-network/chopsticks@latest xcm -r kusama -p karura -p statemine
```

## Proxy

Chopsticks respect `http_proxy` and `https_proxy` environment variables.
Export `ROARR_LOG=true` environment variable to enable log printing to stdout.
To learn more, see https://www.npmjs.com/package/global-agent?activeTab=readme

## Documentation

External documentation on Chopsticks can be found at the following links:

- [Moonbeam documentation site](https://docs.moonbeam.network/builders/build/substrate-api/chopsticks/)
