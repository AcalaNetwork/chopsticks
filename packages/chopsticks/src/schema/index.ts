import { readFileSync } from 'node:fs'
import { basename, extname } from 'node:path'
import { BuildBlockMode, defaultLogger, genesisSchema, isUrl } from '@acala-network/chopsticks-core'
import type { HexString } from '@polkadot/util/types'
import axios from 'axios'
import * as yaml from 'js-yaml'
import _ from 'lodash'
import type { Options } from 'yargs'
import { z } from 'zod'

export const zHex = z.custom<HexString>((val: any) => /^0x\w+$/.test(val))
export const zHash = z.string().length(66).and(zHex)

const ipAddress = z.union([z.ipv4(), z.ipv6()])

export const configSchema = z.object({
  addr: z.union([z.literal('localhost'), ipAddress]).optional(),
  host: z
    .union([z.literal('localhost'), ipAddress])
    .describe('Server listening interface')
    .optional(),
  port: z.number().describe('Server listening port').default(8000),
  endpoint: z
    .union([z.string(), z.array(z.string())])
    .describe('Endpoint to connect to')
    .optional(),
  block: z
    .union([
      z.string(),
      z
        .number()
        .max(Number.MAX_SAFE_INTEGER, 'Number is too big, please make it a string if you are using a hex string'),
      z.null(),
    ])
    .describe('Block hash or block number. Default to latest block')
    .optional(),
  'build-block-mode': z.enum(BuildBlockMode).default(BuildBlockMode.Batch),
  'import-storage': z.any().describe('Pre-defined JSON/YAML storage file path').optional(),
  'allow-unresolved-imports': z.boolean().optional(),
  'mock-signature-host': z
    .boolean()
    .describe('Mock signature host so any signature starts with 0xdeadbeef and filled by 0xcd is considered valid')
    .optional(),
  'max-memory-block-count': z.number().optional(),
  db: z.string().describe('Path to database').optional(),
  'save-blocks': z.boolean().describe('Save blocks to database. Default to true.').optional(),
  'wasm-override': z.string().describe('Path to wasm override').optional(),
  genesis: z
    .union([z.string(), genesisSchema])
    .describe('Alias to `chain-spec`. URL to chain spec file. NOTE: Only parachains with AURA consensus are supported!')
    .optional(),
  'chain-spec': z
    .union([z.string(), genesisSchema])
    .describe('URL to chain spec file. NOTE: Only parachains with AURA consensus are supported!')
    .optional(),
  timestamp: z.number().optional(),
  'registered-types': z.any().optional(),
  'runtime-log-level': z
    .number()
    .describe('Runtime maximum log level [off = 0; error = 1; warn = 2; info = 3; debug = 4; trace = 5]')
    .min(0)
    .max(5)
    .optional(),
  'offchain-worker': z.boolean().describe('Enable offchain worker').optional(),
  resume: z
    .union([zHash, z.number(), z.boolean()])
    .describe(
      'Resume from the specified block hash or block number in db. If true, it will resume from the latest block in db. Note this will override the block option',
    )
    .optional(),
  'process-queued-messages': z
    .boolean()
    .describe('Produce extra block when queued messages are detected. Default to true. Set to false to disable it.')
    .optional(),
  'prefetch-storages': z
    .any()
    .describe(
      'Storage key prefixes config for fetching storage, useful for testing big migrations, see README for examples',
    )
    .optional(),
  'rpc-timeout': z.number().describe('RPC timeout in milliseconds').optional(),
})

export type Config = z.infer<typeof configSchema>

const unwrapOption = (option: any): any => {
  if (['optional', 'nullable', 'default'].includes(option.def.type)) return unwrapOption(option.def.innerType)
  return option
}

const getZodType = (option: any): string | undefined => {
  option = unwrapOption(option)
  switch (option.def.type) {
    case 'string':
      return 'string'
    case 'number':
      return 'number'
    case 'boolean':
      return 'boolean'
    default:
      break
  }
  if (option.def.type === 'union') {
    return getZodFirstOption(option)
  }
  if (option.def.type === 'intersection') {
    return getZodType(option.def.left)
  }
  return undefined
}

const getZodChoices = (option: any) => {
  option = unwrapOption(option)
  if (option.def.type === 'enum') {
    return Object.values(option.def.entries).filter((x: any) => typeof x === 'string') as string[]
  }
  return undefined
}

const getZodFirstOption = (option: any) => {
  option = unwrapOption(option)
  const options = option.def.type === 'union' ? option.def.options : undefined
  if (options) {
    for (const option of options) {
      const type = getZodType(option)
      if (type) return type
    }
  }
  return undefined
}

export const getYargsOptions = (zodShape: Record<string, any>) => {
  return _.mapValues(
    zodShape,
    (option) =>
      ({
        demandOption: !option.isOptional(),
        description: unwrapOption(option).description,
        type: getZodType(option) || getZodFirstOption(option),
        choices: getZodChoices(option),
      }) as Options,
  )
}

const CONFIGS_BASE_URL = 'https://raw.githubusercontent.com/AcalaNetwork/chopsticks/master/configs/'

export const fetchConfig = async (path: string): Promise<Config> => {
  let file: string
  if (isUrl(path)) {
    file = await axios.get(path).then((x) => x.data)
  } else {
    try {
      file = readFileSync(path, 'utf8')
    } catch (err) {
      if (basename(path) === path && ['', '.yml', '.yaml', '.json'].includes(extname(path))) {
        if (extname(path) === '') {
          path += '.yml'
        }
        const url = CONFIGS_BASE_URL + path
        defaultLogger.info(`Loading config file ${url}`)
        file = await axios.get(url).then((x) => x.data)
      } else {
        throw err
      }
    }
  }
  const config = yaml.load(_.template(file, { variable: 'env' })(process.env)) as any
  return configSchema.strict().parse(config)
}
