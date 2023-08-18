import { test, expect } from "vitest";
import { setup } from "./setup";

test("handle invalid block ", async () => {
  await expect(setup({ endpoint: "wss://acala-rpc-0.aca-api.network", block: "0x" })).rejects.toThrow('invalid length')
  await expect(setup({ endpoint: "wss://acala-rpc-0.aca-api.network", block: 999999999 })).rejects.toThrow('Cannot find block hash for 999999999')
  await expect(setup({ endpoint: "wss://acala-rpc-0.aca-api.network", block: '0xc87ae632b2cc4583a37659785f5098947acfdc6a36dbb07abcfa6ad694f97c5d' })).rejects.toThrow('Cannot find header for 0xc87ae632b2cc4583a37659785f5098947acfdc6a36dbb07abcfa6ad694f97c5d')
})
