import { ApiPromise } from '@polkadot/api'
import { ChopsticksProvider } from '@acala-network/chopsticks-core'
import { HexString } from '@polkadot/util/types'
import { Keyring } from '@polkadot/keyring'
import { createRoot } from 'react-dom/client'
import React from 'react'

import './index.css'
import App from './App'

// for playing with chopsticks apiPromise in dev console
try {
	const keyring = new Keyring({ type: 'ed25519' })
	const alice = keyring.addFromUri('//Alice') // 5FA9nQDVg267DEd8m1ZypXLBnvN7SFxYwV7ndqSYGiN9TTpu
	const bob = keyring.addFromUri('//Bob') // 5GoNkf6WdbxCFnPdAnYYQyCjAKPJgLNxXwPjwTh6DGg6gN3E

	const api = new ApiPromise({
		provider: new ChopsticksProvider({
			endpoint: 'wss://acala-rpc.aca-api.network',
			// 3,800,000
			blockHash: '0x0df086f32a9c3399f7fa158d3d77a1790830bd309134c5853718141c969299c7' as HexString,
			storageValues: {
				System: {
					Account: [
						[[alice.address], { providers: 1, data: { free: 1 * 1e12 } }],
						[[bob.address], { providers: 1, data: { free: 1 * 1e12 } }],
					],
				},
			},
		}),
	})
	globalThis.api = api
	api.isReady.then(() => {
		api.rpc('new_block')
		api.tx.balances.transfer(bob.address, 1000).signAndSend(alice, () => console.log('sent'))
	})
} catch (e) {
	console.log(e)
}

createRoot(document.getElementById('root')!).render(
	<React.StrictMode>
		<App />
	</React.StrictMode>,
)
