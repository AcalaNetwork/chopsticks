import { BuildBlockMode, defaultLogger, genesisSchema, isUrl } from '@acala-network/chopsticks-core'
import { HexString } from '@polkadot/util/types'
import { ZodNativeEnum, ZodRawShape, ZodTypeAny, z } from 'zod'
import { basename, extname } from 'node:path'
import { readFileSync } from 'node:fs'
import _ from 'lodash'
import axios from 'axios'
import yaml from 'js-yaml'

export const zHex = z.custom<HexString>((val: any) => /^0x\w+$/.test(val))
export const zHash = z.string().length(66).and(zHex)

export const configSchema = z.object({
  port: z.number({ description: 'Port to listen on' }).default(8000),
  endpoint: z.union([z.string(), z.array(z.string())], { description: 'Endpoint to connect to' }).optional(),
  block: z
    .union(
      [
        z.string(),
        z
          .number()
          .max(Number.MAX_SAFE_INTEGER, 'Number is too big, please make it a string if you are uing a hex string'),
        z.null(),
      ],
      {
        description: 'Block hash or block number. Default to latest block',
      },
    )
    .optional(),
  'build-block-mode': z.nativeEnum(BuildBlockMode).default(BuildBlockMode.Batch),
  'import-storage': z.any({ description: 'Pre-defined JSON/YAML storage file path' }).optional(),
  'allow-unresolved-imports': z.boolean().optional(),
  'mock-signature-host': z
    .boolean({
      description: 'Mock signature host so any signature starts with 0xdeadbeef and filled by 0xcd is considered valid',
    })
    .optional(),
  'max-memory-block-count': z.number().optional(),
  db: z.string({ description: 'Path to database' }).optional(),
  'wasm-override': z.string({ description: 'Path to wasm override' }).optional(),
  genesis: z
    .union([z.string(), genesisSchema], {
      description: 'URL to genesis config file. NOTE: Only parachains with AURA consensus are supported!',
    })
    .optional(),
  timestamp: z.number().optional(),
  'registered-types': z.any().optional(),
  'runtime-log-level': z
    .number({
      description: 'Runtime maximum log level [off = 0; error = 1; warn = 2; info = 3; debug = 4; trace = 5]',
    })
    .min(0)
    .max(5)
    .optional(),
  'offchain-worker': z.boolean({ description: 'Enable offchain worker' }).optional(),
  resume: z
    .union([zHash, z.number(), z.boolean()], {
      description:
        'Resume from the specified block hash or block number in db. If true, it will resume from the latest block in db. Note this will override the block option',
    })
    .optional(),
  'process-queued-messages': z
    .boolean({
      description:
        'Produce extra block when queued messages are detected. Default to true. Set to false to disable it.',
    })
    .optional(),
})

export type Config = z.infer<typeof configSchema>

const getZodType = (option: ZodTypeAny) => {
  switch (option._def.typeName) {
    case 'ZodString':
      return 'string'
    case 'ZodNumber':
      return 'number'
    case 'ZodBoolean':
      return 'boolean'
    default:
      break
  }
  if (option._def.innerType ?? option._def.left) {
    return getZodType(option._def.innerType ?? option._def.left)
  }
  return undefined
}

const getZodChoices = (option: ZodTypeAny) => {
  if (option._def.innerType instanceof ZodNativeEnum) {
    return Object.values(option._def.innerType._def.values).filter((x: any) => typeof x === 'string') as string[]
  }
  if (option._def.innerType) {
    return getZodChoices(option._def.innerType)
  }
  return undefined
}

const getZodFirstOption = (option: ZodTypeAny) => {
  const options = option._def.options
  if (options) {
    for (const option of options) {
      const type = getZodType(option)
      if (type) return type
    }
  }
  if (option._def.innerType) {
    return getZodFirstOption(option._def.innerType)
  }
  return undefined
}

export const getYargsOptions = (zodShape: ZodRawShape) => {
  return _.mapValues(zodShape, (option) => ({
    demandOption: !option.isOptional(),
    description: option._def.description,
    type: getZodType(option) || getZodFirstOption(option),
    choices: getZodChoices(option),
  }))
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
