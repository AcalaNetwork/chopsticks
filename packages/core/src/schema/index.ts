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
