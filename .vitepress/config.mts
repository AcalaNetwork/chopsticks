import { defineConfig } from 'vitepress'

// https://vitepress.dev/reference/site-config
export default defineConfig({
	title: 'Chopsticks Docs',
	description: 'Chopsticks Types Documentation',
	base: '/chopsticks/docs/',
	srcDir: 'docs-src',
	outDir: 'dist/docs',
	lastUpdated: true,
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
		search: {
			provider: 'local',
		},
		socialLinks: [{ icon: 'github', link: 'https://github.com/AcalaNetwork/chopsticks' }],
		outline: 3,
	},
	markdown: {
		anchor: {
			slugify: (s) => encodeURIComponent(String(s).trim().replace(/\s+/g, '-')).toLocaleLowerCase(),
		},
	},
})
