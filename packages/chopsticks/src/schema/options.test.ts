import { configSchema, getYargsOptions } from './index.js'
import { expect, it } from 'vitest'

it('get yargs options from zod schema', () => {
  expect(getYargsOptions(configSchema.shape)).toMatchInlineSnapshot(`
    {
      "allow-unresolved-imports": {
        "choices": undefined,
        "demandOption": false,
        "description": undefined,
        "type": "boolean",
      },
      "block": {
        "choices": undefined,
        "demandOption": false,
        "description": "Block hash or block number. Default to latest block",
        "type": "string",
      },
      "build-block-mode": {
        "choices": [
          "Batch",
          "Instant",
          "Manual",
        ],
        "demandOption": false,
        "description": undefined,
        "type": undefined,
      },
      "db": {
        "choices": undefined,
        "demandOption": false,
        "description": "Path to database",
        "type": "string",
      },
      "endpoint": {
        "choices": undefined,
        "demandOption": false,
        "description": "Endpoint to connect to",
        "type": "string",
      },
      "genesis": {
        "choices": undefined,
        "demandOption": false,
        "description": "URL to genesis config file. NOTE: Only parachains with AURA consensus are supported!",
        "type": "string",
      },
      "import-storage": {
        "choices": undefined,
        "demandOption": false,
        "description": "Pre-defined JSON/YAML storage file path",
        "type": undefined,
      },
      "max-memory-block-count": {
        "choices": undefined,
        "demandOption": false,
        "description": undefined,
        "type": "number",
      },
      "mock-signature-host": {
        "choices": undefined,
        "demandOption": false,
        "description": "Mock signature host so any signature starts with 0xdeadbeef and filled by 0xcd is considered valid",
        "type": "boolean",
      },
      "offchain-worker": {
        "choices": undefined,
        "demandOption": false,
        "description": "Enable offchain worker",
        "type": "boolean",
      },
      "port": {
        "choices": undefined,
        "demandOption": false,
        "description": "Port to listen on",
        "type": "number",
      },
      "process-queued-messages": {
        "choices": undefined,
        "demandOption": false,
        "description": "Produce extra block when queued messages are detected. Default to true. Set to false to disable it.",
        "type": "boolean",
      },
      "registered-types": {
        "choices": undefined,
        "demandOption": false,
        "description": undefined,
        "type": undefined,
      },
      "resume": {
        "choices": undefined,
        "demandOption": false,
        "description": "Resume from the specified block hash or block number in db. If true, it will resume from the latest block in db. Note this will override the block option",
        "type": "string",
      },
      "runtime-log-level": {
        "choices": undefined,
        "demandOption": false,
        "description": "Runtime maximum log level [off = 0; error = 1; warn = 2; info = 3; debug = 4; trace = 5]",
        "type": "number",
      },
      "timestamp": {
        "choices": undefined,
        "demandOption": false,
        "description": undefined,
        "type": "number",
      },
      "wasm-override": {
        "choices": undefined,
        "demandOption": false,
        "description": "Path to wasm override",
        "type": "string",
      },
    }
  `)
})
