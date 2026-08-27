import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import path from 'path';
import { visualizer } from 'rollup-plugin-visualizer';
import { readFileSync } from 'fs';

// Read version from package.json
const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'));

const host = process.env.TAURI_DEV_HOST;

export default defineConfig(() => {
	return {
		define: {
			__APP_VERSION__: JSON.stringify(pkg.version)
		},
		plugins: [
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
