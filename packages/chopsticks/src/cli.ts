import { type Blockchain, connectParachains, connectVertical, environment } from '@acala-network/chopsticks-core'
import { ApiPromise, Keyring, WsProvider } from '@polkadot/api'
import { cryptoWaitReady } from '@polkadot/util-crypto'
import { config as dotenvConfig } from 'dotenv'
import _ from 'lodash'
import type { MiddlewareFunction } from 'yargs'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'
import { z } from 'zod'
import { connectBridgeHubs } from './bridge.js'
import { setupWithServer } from './index.js'
import { loadRpcMethodsByScripts, pluginExtendCli } from './plugins/index.js'
import { configSchema, fetchConfig, getYargsOptions } from './schema/index.js'

dotenvConfig()

interface BridgeSideChain {
  chain: Blockchain
  api: ApiPromise
  url: string
  configRef: string
}

/** One side of a bridged setup: relay (optional) + parachains, wired with UMP/DMP/HRMP. */
const setupBridgeSide = async (
  relayConfigRef: string | undefined,
  parachainConfigRefs: string[],
): Promise<BridgeSideChain[]> => {
  const sideChains: BridgeSideChain[] = []
  for (const configRef of parachainConfigRefs) {
    const { chain, addr } = await setupWithServer(await fetchConfig(configRef))
    const url = `ws://${addr}`
    const api = await ApiPromise.create({ provider: new WsProvider(url, 3_000), noInitWarn: true })
    sideChains.push({ chain, api, url, configRef })
  }

  if (sideChains.length > 1) {
    await connectParachains(
      sideChains.map((c) => c.chain),
      environment.DISABLE_AUTO_HRMP,
    )
  }

  if (relayConfigRef) {
    const { chain: relay } = await setupWithServer(await fetchConfig(relayConfigRef))
    for (const c of sideChains) await connectVertical(relay, c.chain)
  }

  return sideChains
}

/** Pick the parachain whose runtime registers `pallet_bridge_messages`. */
const findBridgeHub = (side: BridgeSideChain[], label: 'left' | 'right'): BridgeSideChain => {
  const candidates = side.filter((c) =>
    Object.keys(c.api.query).some((p) => {
      const pallet = (c.api.query as any)[p]
      return pallet?.outboundLanes && pallet?.outboundMessages
    }),
  )
  if (candidates.length === 0) {
    throw new Error(
      `chopsticks bridge: no ${label}-side parachain hosts pallet_bridge_messages. ` +
        `Provided: ${side.map((c) => c.configRef).join(', ')}. Include a bridge-hub config.`,
    )
  }
  if (candidates.length > 1) {
    throw new Error(
      `chopsticks bridge: multiple ${label}-side parachains host pallet_bridge_messages (${candidates
        .map((c) => c.configRef)
        .join(', ')}). Cannot disambiguate — provide only one bridge hub per side.`,
    )
  }
  return candidates[0]
}

const processArgv: MiddlewareFunction<{ config?: string; port?: number; unsafeRpcMethods?: string }> = async (argv) => {
  try {
    if (argv.unsafeRpcMethods) {
      await loadRpcMethodsByScripts(argv.unsafeRpcMethods)
    }
    if (argv.config) {
      Object.assign(argv, _.defaults(argv, await fetchConfig(argv.config)))
    }
    if (environment.PORT) {
      argv.port = Number(environment.PORT)
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new Error('Bad argv', { cause: error.flatten().fieldErrors })
    }
    throw error
  }
}

const commands = yargs(hideBin(process.argv))
  .scriptName('chopsticks')
  .middleware(processArgv, false)
  .command(
    '*',
    'Dev mode, fork off a chain',
    (yargs) =>
      yargs
        .config(
          'config',
          'Path to config file with default options',
          () => ({}), // we load config in middleware
        )
        .options(getYargsOptions(configSchema.shape))
        .deprecateOption('addr', '⚠️ Use --host instead.'),
    async (argv) => {
      await setupWithServer(configSchema.parse(argv))
    },
  )
  .command(
    'xcm',
    'XCM setup with relaychain and parachains',
    (yargs) =>
      yargs
        .options({
          relaychain: {
            desc: 'Relaychain config file path',
            string: true,
          },
          parachain: {
            desc: 'Parachain config file path',
            type: 'array',
            string: true,
            required: true,
          },
        })
        .alias('relaychain', 'r')
        .alias('parachain', 'p'),
    async (argv) => {
      const parachains: Blockchain[] = []
      for (const config of argv.parachain) {
        const { chain } = await setupWithServer(await fetchConfig(config))
        parachains.push(chain)
      }

      if (parachains.length > 1) {
        await connectParachains(parachains, environment.DISABLE_AUTO_HRMP)
      }

      if (argv.relaychain) {
        const { chain: relaychain } = await setupWithServer(await fetchConfig(argv.relaychain))
        for (const parachain of parachains) {
          await connectVertical(relaychain, parachain)
        }
      }
    },
  )
  .command(
    'bridge',
    'Bridged-XCM setup: two ecosystems wired with pallet_bridge_messages in both directions',
    (yargs) =>
      yargs
        .options({
          'left-relaychain': {
            desc: 'Left-side relaychain config (named or path). Example: westend',
            string: true,
          },
          'left-parachain': {
            desc: 'Left-side parachain config(s). One of them must host pallet_bridge_messages.',
            type: 'array',
            string: true,
            required: true,
          },
          'right-relaychain': {
            desc: 'Right-side relaychain config (named or path). Example: rococo',
            string: true,
          },
          'right-parachain': {
            desc: 'Right-side parachain config(s). One of them must host pallet_bridge_messages.',
            type: 'array',
            string: true,
            required: true,
          },
          'bridge-signer-uri': {
            desc: 'URI for the relayer keypair that submits receive_messages_proof / _delivery_proof on each side',
            string: true,
            default: '//Alice',
          },
        })
        .alias('left-relaychain', 'r')
        .alias('left-parachain', 'p')
        .alias('right-relaychain', 'R')
        .alias('right-parachain', 'P'),
    async (argv) => {
      await cryptoWaitReady()
      const left = await setupBridgeSide(argv['left-relaychain'], argv['left-parachain'])
      const right = await setupBridgeSide(argv['right-relaychain'], argv['right-parachain'])

      const leftBh = findBridgeHub(left, 'left')
      const rightBh = findBridgeHub(right, 'right')

      // One signer for both directions; the relayer only pushes to the hubs' pools, so it works
      // under any build mode (auto-build applies the pushes; under Manual, drive blocks yourself).
      const signer = new Keyring({ type: 'sr25519' }).addFromUri(argv['bridge-signer-uri'])

      await connectBridgeHubs(leftBh.api, rightBh.api, { signer })
      await connectBridgeHubs(rightBh.api, leftBh.api, { signer })

      console.log(
        `Bridge connected:\n  left  bridge-hub @ ${leftBh.url}\n  right bridge-hub @ ${rightBh.url}\n` +
          `Relayer ${signer.address} must be funded on both hubs. The relayer pushes proofs to each ` +
          'hub; blocks are produced by the hubs (build mode) or by you (dev_newBlock) — the relayer reacts.',
      )
    },
  )
  .strict()
  .help()
  .alias('help', 'h')
  .alias('version', 'v')
  .alias('config', 'c')
  .alias('endpoint', 'e')
  .alias('port', 'p')
  .alias('block', 'b')
  .alias('unsafe-rpc-methods', 'ur')
  .alias('import-storage', 's')
  .alias('wasm-override', 'w')
  .usage('Usage: $0 <command> [options]')
  .example('$0', '-c acala')
  .showHelpOnFail(false)

if (!environment.DISABLE_PLUGINS) {
  pluginExtendCli(
    commands.config(
      'config',
      'Path to config file with default options',
      () => ({}), // we load config in middleware
    ),
  ).then(() => commands.parse())
} else {
  commands.parse()
}
