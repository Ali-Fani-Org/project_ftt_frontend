import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import path from 'path';
import { visualizer } from 'rollup-plugin-visualizer';
import { readFileSync } from 'fs';
import { SvelteKitPWA } from '@vite-pwa/sveltekit';

// Read version from package.json
const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'));

const host = process.env.TAURI_DEV_HOST;

// SvelteKit owns `base` (kit.paths.base in svelte.config.js) and overrides any
// Vite `base`, so asset subpaths are driven from there. The PWA plugin gets the
// same value passed explicitly via its own `base`/`scope` options.
const BASE_PATH = process.env.BASE_PATH ?? '';
const ENABLE_PWA = process.env.ENABLE_PWA === 'true';
const appBase = BASE_PATH ? `${BASE_PATH}/` : '/';
const pwaScope = BASE_PATH ? `${BASE_PATH}/` : '/';

export default defineConfig(() => {
	return {
		define: {
			__APP_VERSION__: JSON.stringify(pkg.version),
			// Compile-time gate so web-only PWA wiring (manifest link, SW
			// registration) is tree-shaken out of Tauri builds entirely.
			__PWA_ENABLED__: JSON.stringify(ENABLE_PWA)
		},
		plugins: [
			sveltekit(),
			// PWA only for the web (GitHub Pages) target. Excluded from Tauri builds.
			...(ENABLE_PWA
				? [
						SvelteKitPWA({
							strategies: 'generateSW',
							registerType: 'prompt',
							injectRegister: false,
							includeAssets: [
								'favicon.png',
								'apple-touch-icon.png',
								'pwa-192x192.png',
								'pwa-512x512.png',
								'maskable-icon.png',
								'screenshot-narrow.png',
								'screenshot-wide.png'
							],
							base: appBase,
							scope: pwaScope,
							manifest: {
								name: 'Time Tracker',
								short_name: 'TimeTracker',
								description: 'Track time, manage tasks and stay in flow.',
								theme_color: '#392117',
								background_color: '#392117',
								display: 'standalone',
								orientation: 'any',
								scope: pwaScope,
								start_url: pwaScope,
								icons: [
									{
										src: 'pwa-192x192.png',
										sizes: '192x192',
										type: 'image/png',
										purpose: 'any'
									},
									{
										src: 'pwa-512x512.png',
										sizes: '512x512',
										type: 'image/png',
										purpose: 'any'
									},
									{
										src: 'maskable-icon.png',
										sizes: '512x512',
										type: 'image/png',
										purpose: 'maskable'
									}
								],
								screenshots: [
									{
										src: 'screenshot-narrow.png',
										sizes: '540x720',
										type: 'image/png',
										form_factor: 'narrow',
										label: 'Timer on a phone'
									},
									{
										src: 'screenshot-wide.png',
										sizes: '1280x720',
										type: 'image/png',
										form_factor: 'wide',
										label: 'Time Tracker on desktop'
									}
								]
							},
							workbox: {
								navigateFallback: pwaScope,
								globPatterns: [
									'**/*.{js,css,html,ico,png,svg,webmanifest,woff,woff2}'
								],
								// Prompt mode: the new worker waits until Workbox
								// messageSkipWaiting() (the Reload button). Then it
								// claims open clients so the reload picks it up.
								skipWaiting: false,
								clientsClaim: true,
								cleanupOutdatedCaches: true
							},
							devOptions: {
								enabled: false
							},
							kit: {
								includeVersionFile: true
							}
						})
					]
				: []),
			// Enable bundle visualizer when ANALYZE env var is set to 'true'
			...(process.env.ANALYZE === 'true'
				? [visualizer({ filename: 'dist/stats.html', open: false })]
				: [])
		],
		clearScreen: false,
		server: {
			port: 1420,
			strictPort: true,
			host: host || false,
			hmr: host
				? {
						protocol: 'ws',
						host,
						port: 1421
					}
				: undefined,
			watch: {
				ignored: ['**/src-tauri/**']
			}
		},
		resolve: {
			alias: {
				$lib: path.resolve('./src/lib'),
				// Tauri / non-PWA builds don't load SvelteKitPWA, so the
				// virtual modules don't exist. Point them at no-op stubs.
				...(!ENABLE_PWA
					? {
							'virtual:pwa-register': path.resolve('./src/lib/pwa/virtual-stubs.ts'),
							'virtual:pwa-register/svelte': path.resolve(
								'./src/lib/pwa/virtual-stubs.ts'
							),
							'virtual:pwa-info': path.resolve('./src/lib/pwa/virtual-stubs.ts')
						}
					: {})
			}
		}
	};
});
