import '@polkadot/api-augment'
import {
	Alert,
	Box,
	CircularProgress,
	Container,
	FormControl,
	Input,
	InputLabel,
	Button as MuiBtn,
	TextField,
	Typography,
} from '@mui/material'
import { ApiPromise } from '@polkadot/api'
import { ChopsticksProvider, setStorage, setup } from '@acala-network/chopsticks-core'
import { HexString } from '@polkadot/util/types'
import { IdbDatabase } from '@acala-network/chopsticks-db/browser.js'
import { createTestPairs } from '@polkadot/keyring'
import { styled } from '@mui/system'
import { useEffect, useState } from 'react'
import type { SetupOptions } from '@acala-network/chopsticks-core'

const { alice, bob } = createTestPairs()

const DocsLink = styled('a')`
	position: absolute;
	top: 16px;
	right: 10px;
`

const Button = styled(MuiBtn)`
	border-radius: 8px;
	padding: 0.4em 0.8em;
	font-weight: 500;
	font-family: inherit;
	cursor: pointer;
	transition: border-color 0.25s;
`

const BlocksContainer = styled('div')`
	width: 100%;
	display: flex;
	flex-direction: column;
	justify-content: start;
	font: 16px monospace;
	overflow-x: scroll;
	padding: 5px;
`

const DryRunTextArea = styled(TextField)({
	width: '100%',
})

const Pre = styled('pre')`
	max-width: 100%;
	overflow: auto;
	font-size: 14px;
	margin: 4px 0;
	padding: 4px 6px;
	border-radius: 4px;
	background-color: #ffe4efb7;
`

const Section = styled('section')`
	min-height: 180px;
	margin-top: 24px;
	display: flex;
	flex-direction: column;
	align-items: start;
	justify-content: start;
	max-width: 100%;
`

const Code = styled('code')`
	font-size: 14px;
	margin: 0 2px;
	padding: 4px 5px;
	border-radius: 4px;
	background-color: #ffe4efb7;
`

function App() {
	const [dryRunLoading, setDryRunLoading] = useState(false)
	const [chainLoading, setChainLoading] = useState(false)
	const [building, setBuilding] = useState(false)
	const [extrinsic, setExtrinsic] = useState('')
	const [dryRunResult, setDryRunResult] = useState('')
	const [config, setConfig] = useState<SetupOptions>({
		endpoint: 'wss://acala-rpc.aca-api.network',
		block: 4_000_000,
	})
	const [blocks, setBlocks] = useState<{ number: number; hash: HexString }[]>([])
	const [bobBalance, setBobBalance] = useState('')
	const [transferDisabled, setTransferDisabled] = useState(false)

	const resetState = () => {
		setBlocks([])
		setDryRunLoading(false)
		setExtrinsic('0x0a000088dc3417d5058ec4b4503e0c12ea1a0a89be200fe98922423d4334014fa6b0ee0f0090c04bb6db2b')
		setDryRunResult('')
	}

	const setupChain = async () => {
		setChainLoading(true)
		const chain = await setup({
			endpoint: config.endpoint,
			block: config.block,
			mockSignatureHost: true,
			db: new IdbDatabase('cache'),
		})
		globalThis.chain = chain

		await setStorage(chain, {
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
					[[alice.address], { providers: 1, data: { free: 1 * 1e12 } }],
					[[bob.address], { providers: 1, data: { free: 1 * 1e12 } }],
				],
			},
		})

		const provider = new ChopsticksProvider(globalThis.chain)
		const api = new ApiPromise({ provider, noInitWarn: true })
		await api.isReadyOrError
		globalThis.api = api

		setChainLoading(false)
		setBlocks([{ number: chain.head.number, hash: chain.head.hash }])
	}

	useEffect(() => {
		resetState()
		setupChain()

		return () => {
			globalThis.chain?.close()
		}
	}, [])

	const handleBuildBlock = async () => {
		// build a block
		setBuilding(true)
		await chain.newBlock().catch(console.error)
		setBlocks((blocks) => [...blocks, { number: chain.head.number, hash: chain.head.hash }])
		setBuilding(false)
	}

	const testChopsticksProvider = async () => {
		setTransferDisabled(true)

		await new Promise<void>((resolve) => {
			globalThis.api.tx.balances.transfer(bob.address, 1000).signAndSend(alice, (status) => {
				if (status.isInBlock || status.isFinalized) {
					resolve()
				}
			})
		})

		const bobAccount = await globalThis.api.query.system.account(bob.address)
		setBobBalance(bobAccount.data.free.toString())
		setTransferDisabled(false)
	}

	const handleDryRun = async () => {
		setDryRunResult('')
		setDryRunLoading(true)
		const call = extrinsic.trim() as HexString
		try {
			const { outcome, storageDiff } = await globalThis.chain.dryRunExtrinsic({
				call,
				address: '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY',
			})
			setDryRunResult(JSON.stringify({ outcome: outcome.toHuman(), storageDiff }, null, 2))
		} catch (e) {
			setDryRunResult((e as Error).toString())
		}
		setDryRunLoading(false)
	}

	const handleSaveConfig = async () => {
		await chain.api.disconnect()
		await chain.close()
		resetState()
		setupChain()
	}

	return (
		<Container sx={{ mt: 2, width: 700, maxWidth: '70vw' }}>
			<DocsLink href="/chopsticks/docs">
				<Button variant="outlined">Go to docs</Button>
			</DocsLink>

			<Alert severity="info" sx={{ borderRadius: 2 }}>
				Open console to access <Code>chain</Code>
			</Alert>

			<Section sx={{ minHeight: 100 }}>
				<Typography variant="h5" component="h2">
					Configuration
				</Typography>
				<FormControl variant="standard" sx={{ width: '100%', mt: 1 }}>
					<InputLabel shrink htmlFor="block-input">
						Block Number or Hash
					</InputLabel>
					<Input
						id="block-input"
						placeholder="4000000"
						value={config.block}
						onChange={(e) => setConfig({ ...config, block: e.target.value })}
					/>
				</FormControl>
				<FormControl variant="standard" sx={{ width: '100%', mt: 1 }}>
					<InputLabel shrink htmlFor="endpoint-input">
						API Url
					</InputLabel>
					<Input
						id="endpoint-input"
						placeholder="wss://acala-rpc.aca-api.network"
						value={config.endpoint}
						onChange={(e) => setConfig({ ...config, endpoint: e.target.value })}
					/>
				</FormControl>
				<Button
					variant="outlined"
					disabled={chainLoading || !globalThis.chain}
					onClick={handleSaveConfig}
					sx={{ mt: 1 }}
				>
					Save
					{chainLoading && (
						<Box sx={{ display: 'flex', ml: 1 }}>
							<CircularProgress size={13} />
						</Box>
					)}
				</Button>
			</Section>

			<Section id="blocks-section">
				<Typography variant="h5" component="h2">
					Blocks
				</Typography>
				<BlocksContainer>
					{blocks.map((block) => (
						<Pre key={block.number}>
							{block.number} {block.hash}
						</Pre>
					))}
				</BlocksContainer>
				<Button
					variant="outlined"
					disabled={chainLoading || building || !globalThis.chain}
					onClick={handleBuildBlock}
					sx={{ mt: 1 }}
				>
					Build Block
					{building && (
						<Box sx={{ display: 'flex', ml: 1 }}>
							<CircularProgress size={13} />
						</Box>
					)}
				</Button>
			</Section>

			<Section id="extrinsic-section">
				<Typography variant="h5" component="h2">
					Dry Run
				</Typography>
				<Pre>Caller 5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY</Pre>
				<DryRunTextArea
					label="Extrinsic"
					value={extrinsic}
					multiline
					rows={3}
					sx={{ mt: 1 }}
					onChange={(e) => {
						setExtrinsic(e.target.value)
					}}
				/>
				<Button
					variant="outlined"
					onClick={handleDryRun}
					disabled={dryRunLoading || chainLoading || !globalThis.chain}
					sx={{ mt: 1, mb: 1 }}
				>
					Dry Run Call
				</Button>
				{dryRunResult && <Pre sx={{ fontSize: 13 }}>{dryRunResult}</Pre>}
				{dryRunLoading && <Pre>Loading dry run result...</Pre>}
			</Section>
			<Section id="chopsticks-provider">
				<Button
					variant="outlined"
					onClick={testChopsticksProvider}
					disabled={transferDisabled || chainLoading || !globalThis.chain}
					sx={{ mt: 1, mb: 1 }}
				>
					Alice transfer 1000 to Bob
				</Button>
				{transferDisabled && <Pre>Transferring...</Pre>}
				{bobBalance && <Pre>Bob balance: {bobBalance}</Pre>}
			</Section>
		</Container>
	)
}

export default App
