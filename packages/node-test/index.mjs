import { setupWithServer, destroyWorker } from '@acala-network/chopsticks'

const server = await setupWithServer({
	endpoint: ['wss://polkadot-rpc.dwellir.com', 'wss://rpc.ibp.network/polkadot', 'wss://rpc.polkadot.io'],
	db: 'db.sqlite',
})
await server.chain.newBlock()
await server.close()
await destroyWorker()
