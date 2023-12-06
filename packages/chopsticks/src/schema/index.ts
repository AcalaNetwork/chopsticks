import { BuildBlockMode, defaultLogger, genesisSchema, isUrl } from '@acala-network/chopsticks-core'
import { HexString } from '@polkadot/util/types'
import { basename, extname } from 'node:path'
import { readFileSync } from 'node:fs'
import { z } from 'zod'
import _ from 'lodash'
import axios from 'axios'
import yaml from 'js-yaml'

export const zHex = z.custom<HexString>((val: any) => /^0x\w+$/.test(val))
export const zHash = z.string().length(66).and(zHex)

export const configSchema = z
  .object({
    port: z.number().optional(),
    endpoint: z.union([z.string(), z.array(z.string())]).optional(),
    block: z.union([z.string().length(66).startsWith('0x'), z.number(), z.null()]).optional(),
    'build-block-mode': z.nativeEnum(BuildBlockMode).optional(),
    'import-storage': z.any().optional(),
    'allow-unresolved-imports': z.boolean().optional(),
    'mock-signature-host': z.boolean().optional(),
    'max-memory-block-count': z.number().optional(),
    db: z.string().optional(),
    'wasm-override': z.string().optional(),
    genesis: z.union([z.string(), genesisSchema]).optional(),
    timestamp: z.number().optional(),
    'registered-types': z.any().optional(),
    'runtime-log-level': z.number().min(0).max(5).optional(),
    'offchain-worker': z.boolean().optional(),
    resume: z.union([z.string().length(66).startsWith('0x'), z.number(), z.boolean()]).optional(),
  })
  .strict()

export type Config = z.infer<typeof configSchema>

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
  return configSchema.parse(config)
}
