import './index.css'
import { ApiPromise } from '@polkadot/api'
import { ChopsticksProvider } from '@acala-network/chopsticks-core'
import { HexString } from '@polkadot/util/types'
import { createRoot } from 'react-dom/client'
import App from './App'
import React from 'react'

// for playing with chopsticks apiPromise in dev console
try {
	const api = new ApiPromise({
		provider: new ChopsticksProvider({
			endpoint: 'wss://acala-rpc.aca-api.network',
			// 3,800,000
			blockHash: '0x0df086f32a9c3399f7fa158d3d77a1790830bd309134c5853718141c969299c7' as HexString,
			storageValues: {
				System: {
					Account: [
						[
							['5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY'],
							{
								providers: 1,
								data: {
									free: '1000000000000000000',
								},
							},
						],
					],
				},
			},
		}),
		signedExtensions: {
			SetEvmOrigin: {
				extrinsic: {},
				payload: {},
			},
		},
	})
	globalThis.api = api
} catch (e) {
	console.log(e)
}

createRoot(document.getElementById('root')!).render(
	<React.StrictMode>
		<App />
	</React.StrictMode>,
)
