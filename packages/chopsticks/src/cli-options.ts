export const defaultOptions = {
  endpoint: {
    desc: 'Endpoint to connect to',
    string: true,
  },
  block: {
    desc: 'Block hash or block number. Default to latest block',
    string: true,
  },
  'wasm-override': {
    desc: 'Path to wasm override',
    string: true,
  },
  db: {
    desc: 'Path to database',
    string: true,
  },
  config: {
    desc: 'Path to config file with default options',
    string: true,
  },
  'runtime-log-level': {
    desc: 'Runtime maximum log level [off = 0; error = 1; warn = 2; info = 3; debug = 4; trace = 5]',
    number: true,
  },
  'registered-types': {
    desc: 'Registered types',
  },
  'offchain-worker': {
    desc: 'Enable offchain worker',
    boolean: true,
  },
}

export const mockOptions = {
  'import-storage': {
    desc: 'Pre-defined JSON/YAML storage file path',
    string: true,
  },
  'mock-signature-host': {
    desc: 'Mock signature host so any signature starts with 0xdeadbeef and filled by 0xcd is considered valid',
    boolean: true,
  },
}
