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
}

export {};
