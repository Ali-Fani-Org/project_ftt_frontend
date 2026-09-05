/**
 * Stand-ins for vite-plugin-pwa virtual modules. Aliased in only when
 * ENABLE_PWA is false (Tauri / local `bun run build`) so those builds do
 * not try to resolve `virtual:pwa-register` / `virtual:pwa-info`.
 */
export const pwaInfo = undefined;

export function registerSW(_options?: Record<string, unknown>) {
	return async (_reloadPage?: boolean) => {};
}

export function useRegisterSW(_options?: Record<string, unknown>) {
	const noop = { subscribe: (fn: (v: boolean) => void) => { fn(false); return () => {}; } };
	return {
		needRefresh: noop,
		offlineReady: noop,
		updateServiceWorker: async (_reloadPage?: boolean) => {}
	};
}
