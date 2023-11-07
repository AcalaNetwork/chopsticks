const { setupWithServer } = require('@acala-network/chopsticks')

async function main() {
	const server = await setupWithServer({ endpoint: 'wss://rpc.polkadot.io', db: 'db.sqlite' })
	await server.close()
}
main()
