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

- Replay latest block

  - `yarn start run-block --endpoint=wss://acala-rpc-2.aca-api.network/ws`
  - This will replay the last block and print out the changed storages
  - Use option `--output-path=<file_path>` to print out JSON file

- Run a test node

  - `yarn start dev --endpoint=wss://acala-rpc-2.aca-api.network/ws`
  - You have a test node running at `ws://localhost:8000`
  - You can use [Polkadot.js Apps](https://polkadot.js.org/apps/) to connect to this node
  - Submit any transaction to produce a new block in the in parallel reality
  - (Optional) Pre-define/override state using option `--state-path=state.json`. See example state below.

  ```json
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
  					"reserved": 0,
  					"frozen": 0
  				}
  			]
  		]
  	}
  }
  ```
