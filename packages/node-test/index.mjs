import { setupWithServer } from '@acala-network/chopsticks'

const server = await setupWithServer({ endpoint: 'wss://rpc.polkadot.io', db: 'db.sqlite' })
await server.close()
