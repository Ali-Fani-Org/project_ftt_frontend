import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

/** @type {import('@sveltejs/kit').Config} */
const config = {
	// Consult https://svelte.dev/docs/kit/integrations#preprocessors
	// for more information about preprocessors
	preprocess: vitePreprocess(),

	kit: {
		// adapter-auto only supports some environments, see https://svelte.dev/docs/kit/adapter-auto for a list.
		// If your environment is not supported, or you settled on a specific environment, switch out the adapter.
		// See https://svelte.dev/docs/kit/adapters for more information about adapters.
		adapter: adapter({
			pages: 'build',
			assets: 'build',
			// Tauri canonical SPA fallback. GitHub Pages needs `404.html`,
			// which the Pages workflow creates via `cp build/index.html build/404.html`
			// so the Tauri build output stays unchanged.
			fallback: 'index.html',
			strict: false
		}),
		paths: {
			// Tauri builds leave BASE_PATH unset -> '' (identical to previous behavior).
			// Web (GitHub Pages custom domain time.alpharency.com) serves from the
			// site ROOT, so the Pages workflow sets BASE_PATH='' as well.
			base: process.argv.includes('dev') ? '' : (process.env.BASE_PATH ?? '')
		},
		// PWA registration is owned by virtual:pwa-register/svelte (PwaPrompt).
		// Pin this off so SvelteKit never double-registers a worker.
		serviceWorker: {
			register: false
		},
		// Unique per CI build so `_app/version.json` changes on every Pages
		// deploy. The client polls this (bypassing the SW cache) to notice
		// updates even when GitHub's CDN still has the old `sw.js`.
		version: {
			name: `${pkg.version}-${Date.now()}`,
			pollInterval: 20000
		}
	}
};

export default config;
