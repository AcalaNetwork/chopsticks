import { defineConfig } from 'vitepress'

// https://vitepress.dev/reference/site-config
export default defineConfig({
	title: 'Chopsticks (WIP)',
	description: 'Chopsticks Types Documentation',
	// Required for api-extractor markdown (https://github.com/vuejs/vitepress/pull/664)
	markdown: { attrs: { disable: true } },
	base: '/chopsticks/docs/',
	srcDir: 'docs-src',
	outDir: 'dist/docs',
	rewrites: {
		'chopsticks/:file': ':file',
		'core/:file': ':file',
	},
	themeConfig: {
		// https://vitepress.dev/reference/default-theme-config
		nav: [{ text: 'Home', link: '/' }],
		sidebar: [
			{
				text: 'Packages',
				items: [
					{ text: 'Chopsticks', link: '/chopsticks.html' },
					{ text: 'Core', link: '/chopsticks-core.html' },
				],
			},
		],
		socialLinks: [{ icon: 'github', link: 'https://github.com/AcalaNetwork/chopsticks' }],
	},
})
