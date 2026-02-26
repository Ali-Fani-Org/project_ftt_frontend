import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import type { PluginOption } from 'vite';
import path from 'path';
import { visualizer } from 'rollup-plugin-visualizer';
import { readFileSync } from 'fs';
import { createRequire } from 'module';

// Read version from package.json
const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'));

const host = process.env.TAURI_DEV_HOST;
const require = createRequire(import.meta.url);

export default defineConfig(() => {
	let sentryPlugin: PluginOption[] = [];

	try {
		const { sentrySvelteKit } = require('@sentry/sveltekit');
		sentryPlugin = [
			sentrySvelteKit({
				sourceMapsUploadOptions: {
					org: 'ali-fani',
					project: 'project_ftt_frontend',
					authToken: process.env.SENTRY_AUTH_TOKEN,
					url: 'https://bugsink.p2i.ir',
					pkg:JSON.stringify(pkg.version)
				}
			})
		];
	} catch {
		// Sentry is optional for local development.
	}

	return {
		define: {
			__APP_VERSION__: JSON.stringify(pkg.version)
		},
		plugins: [
			...sentryPlugin,
			sveltekit(),
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
				$lib: path.resolve('./src/lib')
			}
		}
	};
});
