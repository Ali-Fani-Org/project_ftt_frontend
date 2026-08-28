import { MutationCache, QueryClient, focusManager, onlineManager } from '@tanstack/svelte-query';
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';
import { get } from 'svelte/store';
import {
	autoRefreshEnabled,
	refreshInterval,
	refreshOnReconnect,
	refreshOnlyWhenVisible
} from './stores';
import { network } from './network';
import { toastStore } from './toast';

/**
 * App-wide TanStack Query client.
 *
 * The app is fully client-rendered (`ssr = false` in +layout.ts), so a single
 * module-level client is safe — there is no per-request isolation to worry about.
 *
 * Defaults are tuned to replace the old manual cache + 30s refreshController:
 * - staleTime 0: data is NEVER considered fresh, so every mount, window focus,
 *   reconnect, filter change, and invalidation refetches from the server while
 *   online. Cached data only ever shows when the app is offline (served by the
 *   api layer's fetchWithCache) or as an error fallback — never as a substitute
 *   for a live fetch. The top-bar refresh button is a convenience, not the only
 *   way to get fresh data.
 * - networkMode offlineFirst: queries still run while offline, but the api layer
 *   (fetchWithCache) short-circuits to cached data whenever the probe-based
 *   `network` store reports offline, so no request actually leaves the machine;
 *   the moment connectivity returns, refetchOnReconnect resumes them.
 * - retry 1: one retry for flaky connections without hammering a broken backend.
 *
 * The "Data Refresh Settings" from the settings page are applied reactively
 * below, replacing the old refreshController singleton:
 * - autoRefreshEnabled + refreshInterval → default refetchInterval for queries
 *   that don't set their own (timer/dashboard pages set their own per-query).
 * - refreshOnReconnect → refetchOnReconnect.
 * - refreshOnlyWhenVisible → refetchIntervalInBackground (when paused, TanStack
 *   keeps polling only while the tab is visible).
 */
function mutationErrorMessage(error: unknown): string {
	if (error instanceof Error && error.message) return error.message;
	return 'Something went wrong. Please try again.';
}

export const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			// Never treat cached data as fresh: while online every mount/focus/
			// reconnect/period change refetches from the server; the cache is only
			// a fallback when offline or when a fetch fails.
			staleTime: 0,
			gcTime: 10 * 60_000,
			retry: 1,
			networkMode: 'offlineFirst',
			refetchOnWindowFocus: true,
			refetchOnReconnect: true
		},
		mutations: {
			retry: 0
		}
	},
	mutationCache: new MutationCache({
		// Surface every failed mutation as a toast — the one place that turns
		// silent write failures into visible feedback.
		onError: (error) => {
			toastStore.add(mutationErrorMessage(error), 'error', 6000);
		}
	})
});

// --- Offline-first: mirror the app's probe-based network store into TanStack's
// onlineManager, so queries pause retries while the backend is unreachable and
// resume (refetchOnReconnect) the moment a probe succeeds. The store starts with
// isChecking=true, and checkInitialStatus() flips isOnline to navigator.onLine
// immediately, so we never leave the manager stuck offline at boot.
network.subscribe((status) => {
	onlineManager.setOnline(status.isOnline);
});

// --- Tauri focus/visibility refetch ---------------------------------------------
// Browser focus/visibility events are unreliable inside Tauri webviews (e.g.
// clicking back to the app from another window doesn't fire a visibilitychange),
// so the desktop window's real state drives TanStack's focusManager:
// - onFocusChanged covers plain app-switch focus (regaining focus refetches
//   every active query through the normal refetchOnWindowFocus path, and
//   blurring pauses retries).
// - visibilitychange covers restore-from-tray and restore-from-minimize, which
//   can skip focus events on some platforms — the webview document goes hidden
//   when the window is minimized/hidden and visible again on restore.
// Plain browsers keep the default visibility-based handling — the listeners are
// only registered when the Tauri bridge is present.
async function setupTauriFocusRefetch(): Promise<void> {
	if (typeof window === 'undefined' || !('__TAURI_INTERNALS__' in window)) return;
	try {
		const { getCurrentWindow } = await import('@tauri-apps/api/window');
		const appWindow = getCurrentWindow();
		await appWindow.onFocusChanged(({ payload: focused }) => {
			focusManager.setFocused(focused);
		});
		document.addEventListener('visibilitychange', () => {
			focusManager.setFocused(document.visibilityState !== 'hidden');
		});
	} catch {
		// Not running inside Tauri (or the API is unavailable) — the default
		// visibility-based focus handling still applies in the plain browser.
	}
}

void setupTauriFocusRefetch();

function applyRefreshSettings(): void {
	const enabled = get(autoRefreshEnabled);
	const interval = get(refreshInterval);

	const intervalMs = Number(interval);
	queryClient.setQueryDefaults(['time-entries'], {
		refetchInterval: enabled && intervalMs > 0 ? intervalMs : false
	});

	queryClient.setDefaultOptions({
		queries: {
			...queryClient.getDefaultOptions().queries,
			refetchOnReconnect: get(refreshOnReconnect),
			refetchIntervalInBackground: !get(refreshOnlyWhenVisible)
		}
	});
}

// Reactively sync the settings stores into the query client.
applyRefreshSettings();
autoRefreshEnabled.subscribe(applyRefreshSettings);
refreshInterval.subscribe(applyRefreshSettings);
refreshOnReconnect.subscribe(applyRefreshSettings);
refreshOnlyWhenVisible.subscribe(applyRefreshSettings);

// --- Persistence: the whole time-entries + projects cache survives restarts so
// the app works offline-first (replaces the old per-query localStorage seeds).
// Bump `buster` whenever the cached data shape changes to force a clean slate
// (v2: the active-timer query is no longer persisted — a stale/synthetic entry
// used to be hydrated as fresh after a restart, showing a phantom timer).
export const queryPersister = createSyncStoragePersister({
	storage: localStorage,
	key: 'ftt-query-cache',
	throttleTime: 1_000
});

// --- One-time migration: the old hand-rolled seeds are dead now that the query
// cache persists. Sweep their leftover keys so stale data doesn't linger.
const LEGACY_SEED_KEYS = [
	'timer_last_active_entry',
	'timer_last_today_sessions',
	'timer_last_projects',
	'timer_last_update',
	'dashboard_today_entries',
	'dashboard_recent_entries'
];

try {
	for (const key of LEGACY_SEED_KEYS) {
		localStorage.removeItem(key);
	}
	// Also clear any per-month heatmap caches the old chart wrote.
	const staleKeys: string[] = [];
	for (let i = localStorage.length - 1; i >= 0; i--) {
		const k = localStorage.key(i);
		if (k?.startsWith('chart_heatmap_')) staleKeys.push(k);
	}
	for (const k of staleKeys) localStorage.removeItem(k);
} catch {
	// Best-effort cleanup; non-fatal if storage is unavailable.
}

export const queryPersistOptions = {
	persister: queryPersister,
	maxAge: 7 * 24 * 60 * 60 * 1000, // keep persisted queries for 7 days
	buster: 'ftt-v2',
	dehydrateOptions: {
		shouldDehydrateQuery: (query: { queryKey: readonly unknown[]; state: { data: unknown } }) => {
			const root = String(query.queryKey[0] ?? '');
			// Never persist the active-timer query: it is live, server-truth state
			// seeded at boot from the WebSocket snapshot + a refetch, so a stale
			// or synthetic entry can never be hydrated as fresh after a restart.
			const isActiveTimer =
				query.queryKey[0] === 'time-entries' && query.queryKey[1] === 'active';
			// Only persist our data queries — never auth/user/temp state.
			return (
				(root === 'time-entries' || root === 'projects') &&
				query.state.data !== undefined &&
				!isActiveTimer
			);
		}
	}
} as const;
