import { readFileSync } from 'node:fs'
import { basename, extname } from 'node:path'
import { BuildBlockMode, defaultLogger, genesisSchema, isUrl } from '@acala-network/chopsticks-core'
import type { HexString } from '@polkadot/util/types'
import axios from 'axios'
import yaml from 'js-yaml'
import _ from 'lodash'
import type { Options } from 'yargs'
import { type ZodRawShape, type ZodTypeAny, z } from 'zod'

export const zHex = z.custom<HexString>((val: any) => /^0x[\da-f]+$/i.test(val))
export const zHash = z.string().length(66).and(zHex)

export const configSchema = z.object({
  addr: z.union([z.literal('localhost'), z.string().ip()]).optional(),
  host: z
    .union([z.literal('localhost'), z.string()])
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
  'build-block-mode': z.nativeEnum(BuildBlockMode).default(BuildBlockMode.Batch),
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

const getZodType = (option: ZodTypeAny): 'string' | 'number' | 'boolean' | undefined => {
  while (option instanceof z.ZodOptional || option instanceof z.ZodNullable || option instanceof z.ZodDefault) {
    option = option._def.innerType
  }

  if (option instanceof z.ZodString) {
    return 'string'
  }
  if (option instanceof z.ZodNumber) {
    return 'number'
  }
  if (option instanceof z.ZodBoolean) {
    return 'boolean'
  }
  return undefined
}

const getZodChoices = (option: ZodTypeAny): (string | number)[] | undefined => {
  while (option instanceof z.ZodOptional || option instanceof z.ZodNullable || option instanceof z.ZodDefault) {
    option = option._def.innerType
  }

  if (option instanceof z.ZodEnum) {
    return option.options
  }
  if (option._def.typeName === 'ZodNativeEnum') {
    return Object.values(option._def.values).filter((x: any) => typeof x === 'string')
  }
  return undefined
}

const getZodFirstOption = (option: ZodTypeAny): 'string' | 'number' | 'boolean' | undefined => {
  while (option instanceof z.ZodOptional || option instanceof z.ZodNullable || option instanceof z.ZodDefault) {
    option = option._def.innerType
  }

  if (option instanceof z.ZodUnion) {
    for (const opt of option.options) {
      const type = getZodType(opt)
      if (type) return type
    }
  }
  return undefined
}

export const getYargsOptions = (zodShape: ZodRawShape) => {
  return _.mapValues(zodShape, (option) => {
    const yargsOption: Options = {
      description: option.description,
    }

    yargsOption.type = getZodType(option) || getZodFirstOption(option)
    yargsOption.choices = getZodChoices(option)
    yargsOption.demandOption = !option.isOptional() && !option.isNullable() && !(option instanceof z.ZodDefault)

    return yargsOption
  })
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
