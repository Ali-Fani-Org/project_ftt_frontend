import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

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
			// GitHub Pages workflow sets BASE_PATH='/project_ftt_frontend'.
			base: process.argv.includes('dev') ? '' : (process.env.BASE_PATH ?? '')
		},
		// PWA registration is owned by virtual:pwa-register/svelte (PwaPrompt).
		// Pin this off so SvelteKit never double-registers a worker.
		serviceWorker: {
			register: false
		}
	}
};

export default config;
