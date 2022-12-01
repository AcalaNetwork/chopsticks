import { BuildBlockMode } from '../blockchain/txpool'
import { z } from 'zod'

export const genesisSchema = z.object({
  id: z.string(),
  name: z.string(),
  properties: z.object({
    ss58Format: z.number().optional(),
    tokenDecimals: z.union([z.number(), z.array(z.number())]).optional(),
    tokenSymbol: z.union([z.string(), z.array(z.string())]).optional(),
  }),
  genesis: z.object({ raw: z.object({ top: z.record(z.string()) }) }),
})

export type Genesis = z.infer<typeof genesisSchema>

export const configSchema = z
  .object({
    port: z.number().optional(),
    endpoint: z.string().optional(),
    block: z.union([z.string(), z.number()]).optional(),
    'executor-cmd': z.string().optional(),
    'build-block-mode': z.nativeEnum(BuildBlockMode).optional(),
    'import-storage': z.any().optional(),
    'mock-signature-host': z.boolean().optional(),
    db: z.string().optional(),
    'wasm-override': z.string().optional(),
    genesis: z.union([z.string(), genesisSchema]).optional(),
  })
  .strict()

export type Config = z.infer<typeof configSchema>
