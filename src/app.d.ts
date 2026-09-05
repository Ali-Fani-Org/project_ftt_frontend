/// <reference types="vite-plugin-pwa/client" />
/// <reference types="vite-plugin-pwa/info" />
/// <reference types="vite-plugin-pwa/svelte" />

declare module '*.svg?raw' {
	const src: string;
	export default src;
}

declare module '*.png' {
	const src: string;
	export default src;
}
// See https://svelte.dev/docs/kit/types#app
// for information about these interfaces
declare global {
	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}

	// Injected via vite.config.ts `define` from package.json version.
	// Available in both Tauri and web (PWA) builds.
	const __APP_VERSION__: string;
	// True only for web builds with ENABLE_PWA=true (GitHub Pages).
	// Lets components strip all PWA wiring from Tauri builds at compile time.
	const __PWA_ENABLED__: boolean;
}

export {};
