import { defineConfig } from 'vitepress'

// https://vitepress.dev/reference/site-config
export default defineConfig({
	title: 'Chopsticks (WIP)',
	description: 'Chopsticks Types Documentation',
	base: '/chopsticks/docs/',
	srcDir: 'docs-src',
	outDir: 'dist/docs',
	themeConfig: {
		// https://vitepress.dev/reference/default-theme-config
		nav: [{ text: 'Home', link: '/' }],
		sidebar: [
			{
				text: 'Packages',
				items: [
					{ text: 'Chopsticks', link: '/chopsticks/README.html' },
					{ text: 'Core', link: '/core/README.html' },
				],
			},
		],
		socialLinks: [{ icon: 'github', link: 'https://github.com/AcalaNetwork/chopsticks' }],
	},
})
