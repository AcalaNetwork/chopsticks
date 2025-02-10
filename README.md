# Chopsticks

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/chopsticks-logo-white.svg">
  <source media="(prefers-color-scheme: light)" srcset="docs/chopsticks-logo-dark.svg">
  <img width="100%" alt="chopsticks logo" src="docs/chopsticks-logo-dark.svg">
</picture>

Create parallel reality of your Substrate network.

## Introduction

Chopsticks provides a developer-friendly method of locally forking existing Substrate based chains. It allows for the replaying of blocks to easily examine how extrinsics effect state, the forking of multiple blocks for XCM testing, and more. This allows developers to test and experiment with their own custom blockchain configurations in a local development environment, without the need to deploy a live network. Chopsticks aims to simplify the process of building blockchain applications on Substrate and make it accessible to a wider range of developers.

## Quick Start

Fork Acala mainnet: `npx @acala-network/chopsticks@latest --endpoint=wss://acala-rpc-2.aca-api.network/ws`

It is recommended to use config file. You can check [configs](configs/) for examples.

Run node using config file

```bash
# npx @acala-network/chopsticks@latest --config= url | path | config_file_name
# i.e: using configs/acala.yml

npx @acala-network/chopsticks@latest -c acala
```

## Wiki

Documentation and tutorials are available at [wiki](https://github.com/AcalaNetwork/chopsticks/wiki).

## EVM+ tracing

Documentation for EVM+ tracing is available at [EVM+ tracing](packages/chopsticks/src/plugins/trace-transaction/README.md).

## Web testing

Run Chopsticks in browser? Now you can turn a mainnet into a devnet and play with it directly in your browser!

An example is available at [acalanetwork.github.io/chopsticks](https://acalanetwork.github.io/chopsticks/), and the corresponding code can be found in [web-test](packages/web-test).

## Environment Variables

For chopsticks CLI, you can find the full list of available environment variables [here](https://acalanetwork.github.io/chopsticks/docs/core/README.html#environment).

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

- Dry run help:
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
npx @acala-network/chopsticks@latest dry-run --endpoint=wss://polkadot-rpc.dwellir.com --preimage=<preimage> --open
 ```

- Dry run a preimage and execute an extrinsic after that:
```
npx @acala-network/chopsticks@latest dry-run --endpoint=wss://polkadot-rpc.dwellir.com --preimage=<preimage> --extrinsic=<extrinsic> --open
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
    },
    "Whitelist": {
      "WhitelistedCall": [
        [
          ["0x3146d2141cdb95de80488d6cecbb5d7577dd59069efc366cb1be7fe64f02e62c"],
          "0x" // please use 0x for null values
        ],
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

## Plugins

Chopsticks is designed to be extensible. You can write your own plugin to extend Chopsticks' functionality.

There are 2 types of plugins: `cli` and `rpc`. `cli` plugins are used to extend Chopsticks' CLI, while `rpc` plugins are used to extend Chopsticks' RPC.

To create a new plugin, you could check out the [run-block plugin](packages/chopsticks/src/plugins/run-block/) as an example.


## RPC Methods

Chopsticks allows you to load your extended rpc methods by adding the cli argument `--unsafe-rpc-methods=<file path>`or `-ur=<file path>`.

### **WARNING:**

It loads an **unverified** scripts, making it **unsafe**. Ensure you load a **trusted** script.

**example**:

`npx @acala-network/chopsticks@latest --unsafe-rpc-methods=rpc-methods-scripts.js`

**scripts example of rpc-methods-scripts:**

```
return {
  async testdev_testRpcMethod1(context, params) {
    console.log('testdev_testRpcMethod 1', params)
    return { methods: 1, params }
  },
  async testdev_testRpcMethod2(context, params) {
    console.log('testdev_testRpcMethod 2', params)
    return { methods: 2, params }
  },
}
```

## Testing with @acala-network/chopsticks-testing

The `@acala-network/chopsticks-testing` package provides powerful utilities for testing blockchain data, making it easier to write and maintain tests for your Substrate-based chain. It offers features like data redaction, event filtering, snapshot testing, and XCM message checking.

### Installation

```bash
npm install --save-dev @acala-network/chopsticks-testing
```

### Basic Usage

```typescript
import { withExpect, setupContext } from '@acala-network/chopsticks-testing';
import { describe, expect, it } from 'vitest'; // or jest, or other test runners

// Create testing utilities with your test runner's expect function
const { check, checkEvents, checkSystemEvents, checkUmp, checkHrmp } = withExpect(expect);

describe('My Chain Tests', () => {
  it('should process events correctly', async () => {
	const network = await setupContext({ endpoint: 'wss://polkadot-rpc.dwellir.com' });
    // Check and redact system events
    await checkSystemEvents(network)
      .redact({ number: 2, hash: true })
      .toMatchSnapshot('system events');

    // Filter specific events
    await checkSystemEvents(network, 'balances', { section: 'system', method: 'ExtrinsicSuccess' })
      .toMatchSnapshot('filtered events');
  });
});
```

### Data Redaction

The testing package provides powerful redaction capabilities to make your tests more stable and focused on what matters:

```typescript
await check(someData)
  .redact({
    number: 2,           // Redact numbers with 2 decimal precision
    hash: true,          // Redact 32-byte hex values
    hex: true,           // Redact any hex values
    address: true,       // Redact base58 addresses
    redactKeys: /hash/,  // Redact values of keys matching regex
    removeKeys: /time/   // Remove keys matching regex entirely
  })
  .toMatchSnapshot('redacted data');
```

### Event Filtering

Filter and check specific blockchain events:

```typescript
// Check all balances events
await checkSystemEvents(api, 'balances')
  .toMatchSnapshot('balances events');

// Check specific event type
await checkSystemEvents(api, { section: 'system', method: 'ExtrinsicSuccess' })
  .toMatchSnapshot('successful extrinsics');

// Multiple filters
await checkSystemEvents(api,
  'balances',
  { section: 'system', method: 'ExtrinsicSuccess' }
)
.toMatchSnapshot('filtered events');
```

### XCM Testing

Test XCM (Cross-Chain Message) functionality:

```typescript
// Check UMP (Upward Message Passing) messages
await checkUmp(api)
  .redact()
  .toMatchSnapshot('upward messages');

// Check HRMP (Horizontal Relay-routed Message Passing) messages
await checkHrmp(api)
  .redact()
  .toMatchSnapshot('horizontal messages');
```

### Data Format Conversion

Convert data to different formats for testing:

```typescript
// Convert to human-readable format
await check(data).toHuman().toMatchSnapshot('human readable');

// Convert to hex format
await check(data).toHex().toMatchSnapshot('hex format');

// Convert to JSON format (default)
await check(data).toJson().toMatchSnapshot('json format');
```

### Custom Transformations

Apply custom transformations to your data:

```typescript
await check(data)
  .map(value => value.filter(item => item.amount > 1000))
  .redact()
  .toMatchSnapshot('filtered and redacted');
```

## Testing big migrations

When testing migrations with lots of keys, you may want to fetch and cache some storages.

There are two ways to fetch storages.

The first way is to use a config file with a `prefetch-storages` section:

```yml
prefetch-storages:
  - '0x123456' # fetch all storages with this prefix
  - Balances # fetch all storages under Balances pallet
  - Tokens.Accounts # fetch all storages under Tokens.Accounts stroage
  - System: Account # fetch all storages under System.Account stroage
  - Tokens:
      Accounts: [5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY] # fetch all storages for Tokens.Accounts(Alice)
  - Tokens.Accounts: [5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY, { token: DOT }] # fetch this particular storage
```

When you starts chopsticks, it will fetch these storages in background.

Please note that only the formats mentioned above are supported for config files.

The second way is use `fetch-storages` subcommand to only fetch and cache storages:

```sh
npx @acala-network/chopsticks@latest fetch-storages 0x123456 Balances Tokens.Accounts
	--endpoint=wss://acala-rpc-0.aca-api.network
	--block=<blockhash> # default to latest block
	--db=acala.sqlite
```

The subcommand arguments could be:
- hex: fetch all storages with this prefix
- PalletName: fetch all storages for this pallet
- PalletName.StorageName: fetch all storages for this storage

Please note that for both ways, fetched storages will be saved in the sqlite file specified by `--db` option (`db: ./acala.sqlite` in a config file), if not provided, it will default to `./db-{network}-{block}.sqlite`.

## Try-Runtime CLI

Documentation can be found [here](packages/chopsticks/src/plugins/try-runtime/README.md)

## FAQ

### What is mocked? What are things that could work with chopsticks, but still fail in production?

Generally, anything that involves something more than onchain STF `new_state = f(old_state)` are not guaranteed to work in production.
In practice, here is an incomplete list that I can think of:

- mocked tx pool
- no real block finalization
- mocked inherents
- simulated XCM channels

### How to change a pallet constant in chopsticks?

You cannot change runtime constants in chopsticks, you have to edit and build a new runtime, and use `wasm-override` with the new wasm.

### Storage override of value type `()`

You can use `0x` for empty values, for example:

```yaml
Whitelist:
    WhitelistedCall:
      - - - '0xe284be84dcfaf714ef2b7717b54914632406f2c17d8203d3268e4c4ca68fa144'
        - 0x
```
