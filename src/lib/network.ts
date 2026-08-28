import { writable, derived, get } from 'svelte/store';
import { browser } from '$app/environment';
import { baseUrl } from './stores';

// Network status interface
export interface NetworkStatus {
	isOnline: boolean;
	isChecking: boolean;
	lastChecked: Date | null;
	lastOnline: Date | null; // NEW
	connectionType: 'online' | 'offline' | 'unknown';
	connectionQuality: 'fast' | 'slow' | 'unknown'; // NEW
	connectionInfo: any | null;
	retryCount: number; // NEW
}

// Shared function to create probe URL
const createProbeUrl = (baseUrlValue: string): string | null => {
	try {
		const url = new URL(baseUrlValue);
		// Probe the API root itself: the backend's ping view answers GET / with
		// {"status": "ok"} (health_check app, mounted at the Django root, and
		// nginx proxies / to it). The old /__ping probe was nginx-only and is
		// no longer needed. No cache-buster param — every probe fetch uses
		// cache: 'no-store'.
		url.pathname = `${url.pathname.replace(/\/+$/, '')}/`;
		url.search = '';
		return url.toString();
	} catch (error) {
		console.warn('Invalid base URL for network probe:', baseUrlValue);
		return null;
	}
};

export type BaseUrlPingResult = {
	ok: boolean;
	pingMs: number | null;
	checkedAt: number;
	error: string | null;
};

export async function pingBaseUrl(
	baseUrlValue: string,
	options?: { timeoutMs?: number }
): Promise<BaseUrlPingResult> {
	const checkedAt = Date.now();
	const timeoutMs = options?.timeoutMs ?? 3000;

	if (!browser) {
		return { ok: false, pingMs: null, checkedAt, error: 'Not in browser environment' };
	}

	if (!navigator.onLine) {
		return { ok: false, pingMs: null, checkedAt, error: 'Offline' };
	}

	const probeUrl = createProbeUrl(baseUrlValue);
	if (!probeUrl) {
		return { ok: false, pingMs: null, checkedAt, error: 'Invalid URL' };
	}

	const controller = new AbortController();
	const timer = window.setTimeout(() => controller.abort(), timeoutMs);
	const start = performance.now();
	try {
		const response = await fetch(probeUrl, {
			method: 'GET',
			cache: 'no-store',
			signal: controller.signal
		});
		if (!response.ok) throw new Error(`HTTP ${response.status}`);

		const pingMs = Math.max(0, Math.round(performance.now() - start));
		return { ok: true, pingMs, checkedAt, error: null };
	} catch (e: any) {
		const pingMs = Math.max(0, Math.round(performance.now() - start));
		const error = e?.name === 'AbortError' ? 'Timeout' : (e?.message ?? 'Network error');
		return { ok: false, pingMs: null, checkedAt, error: `${error}${Number.isFinite(pingMs) ? ` (${pingMs}ms)` : ''}` };
	} finally {
		clearTimeout(timer);
	}
}

// Create the network status store
const createNetworkStore = () => {
	const { subscribe, set, update } = writable<NetworkStatus>({
		isOnline: false,
		isChecking: true,
		lastChecked: null,
		lastOnline: null, // NEW
		connectionType: 'unknown',
		connectionQuality: 'unknown', // NEW
		connectionInfo: null,
		retryCount: 0 // NEW
	});

	const DEFAULT_TIMEOUT_MS = 3000;
	const ONLINE_POLL_MS = 30000;
	const OFFLINE_POLL_MS = 5000;
	const FAILURES_BEFORE_OFFLINE = 2;

	// Retry configuration for probe
	const PROBE_RETRIES = 3;
	const PROBE_BASE_DELAY_MS = 500;
	const PROBE_MAX_DELAY_MS = 3000;

	// Debounce configuration for heartbeat
	const HEARTBEAT_DEBOUNCE_MS = 1000;

	let consecutiveFailures = 0;
	let heartbeatIntervalId: number | null = null;
	let heartbeatDebounceTimer: number | null = null;
	let checkInFlight: Promise<boolean> | null = null;
	let cachedBaseUrl: string | null = null;
	let isDestroyed = false;

	const getConnectionInfo = () =>
		(navigator as any).connection || (navigator as any).mozConnection || (navigator as any).webkitConnection;

	const getProbeUrl = () => {
		// Use cached value or get fresh value
		if (!cachedBaseUrl) {
			cachedBaseUrl = get(baseUrl);
		}
		return createProbeUrl(cachedBaseUrl ?? '');
	};

	// Single probe attempt (no retry)
	const probeOnce = async (timeout: number = DEFAULT_TIMEOUT_MS): Promise<boolean> => {
		if (!browser) return false;
		if (!navigator.onLine) return false;

		const probeUrl = getProbeUrl();
		if (!probeUrl) return navigator.onLine;

		const controller = new AbortController();
		const timer = window.setTimeout(() => controller.abort(), timeout);
		try {
			await fetch(probeUrl, {
				method: 'GET',
				mode: 'no-cors',
				cache: 'no-store',
				signal: controller.signal
			});

			return true;
		} catch {
			return false;
		} finally {
			clearTimeout(timer);
		}
	};

	// Probe with retry logic and exponential backoff + jitter
	const probeConnectivity = async (timeout: number = DEFAULT_TIMEOUT_MS): Promise<boolean> => {
		let lastError: Error | null = null;

		for (let attempt = 0; attempt < PROBE_RETRIES; attempt++) {
			try {
				const result = await probeOnce(timeout);
				return result;
			} catch (error) {
				lastError = error as Error;

				// Don't retry if explicitly offline
				if (!navigator.onLine) return false;

				if (attempt < PROBE_RETRIES - 1) {
					// Exponential backoff with jitter to avoid thundering herd
					const baseDelay = Math.min(
						PROBE_BASE_DELAY_MS * Math.pow(2, attempt),
						PROBE_MAX_DELAY_MS
					);
					const jitteredDelay = baseDelay * (0.5 + Math.random());
					await new Promise(resolve => setTimeout(resolve, jitteredDelay));
				}
			}
		}

		console.warn(`Probe failed after ${PROBE_RETRIES} attempts`, lastError);
		return false;
	};

	const applyConnectivityResult = (online: boolean) => {
		const connectionInfo = getConnectionInfo();
		const connectionQuality = getConnectionQuality(connectionInfo);

		update((status) => {
			const nextIsOnline = online;
			const lastOnline = nextIsOnline ? new Date() : status.lastOnline;

			return {
				...status,
				isOnline: nextIsOnline,
				isChecking: false,
				lastChecked: new Date(),
				lastOnline,
				connectionType: nextIsOnline ? 'online' : 'offline',
				connectionQuality: nextIsOnline ? connectionQuality : 'unknown',
				connectionInfo: nextIsOnline ? connectionInfo || null : null,
				retryCount: nextIsOnline ? 0 : status.retryCount + 1
			};
		});
	};

	const runActiveCheck = async (): Promise<boolean> => {
		if (!browser || isDestroyed) return false;

		update((status) => ({
			...status,
			isChecking: true
		}));

		try {
			if (!checkInFlight) {
				checkInFlight = probeConnectivity().finally(() => {
					checkInFlight = null;
				});
			}

			const ok = await checkInFlight;
			
			// Check if destroyed during async operation
			if (isDestroyed) return false;
			
			if (ok) {
				consecutiveFailures = 0;
				scheduleHeartbeat(ONLINE_POLL_MS);
				applyConnectivityResult(true);
				return true;
			}

			consecutiveFailures += 1;
			
			// Only switch to fast polling and mark offline after reaching threshold
			if (consecutiveFailures >= FAILURES_BEFORE_OFFLINE) {
				scheduleHeartbeat(OFFLINE_POLL_MS);
				applyConnectivityResult(false);
			} else {
				// Still online, keep normal polling
				scheduleHeartbeat(ONLINE_POLL_MS);
			}
			
			return false;
		} catch (error) {
			console.warn('Network check failed:', error);
			return false;
		}
	};

	const scheduleHeartbeat = (intervalMs: number) => {
		if (!browser) return;

		// Clear previous debounce timer
		if (heartbeatDebounceTimer) {
			clearTimeout(heartbeatDebounceTimer);
			heartbeatDebounceTimer = null;
		}

		// Debounce the scheduling to prevent rapid conflicting intervals
		heartbeatDebounceTimer = window.setTimeout(() => {
			if (heartbeatIntervalId) {
				clearInterval(heartbeatIntervalId);
				heartbeatIntervalId = null;
			}

			heartbeatIntervalId = window.setInterval(() => {
				runActiveCheck();
			}, intervalMs);
			
			heartbeatDebounceTimer = null;
		}, HEARTBEAT_DEBOUNCE_MS);
	};

	// Initialize network detection
	if (browser) {
		// Check initial connection status
		const checkInitialStatus = () => {
			const connectionInfo = getConnectionInfo();
			const connectionQuality = getConnectionQuality(connectionInfo);

			set({
				isOnline: navigator.onLine,
				isChecking: true,
				lastChecked: new Date(),
				lastOnline: navigator.onLine ? new Date() : null,
				connectionType: navigator.onLine ? 'online' : 'offline',
				connectionQuality,
				connectionInfo: connectionInfo || null,
				retryCount: 0
			});

			runActiveCheck();
			scheduleHeartbeat(navigator.onLine ? ONLINE_POLL_MS : OFFLINE_POLL_MS);
		};

		// Event listeners for connection changes
		const handleOnline = () => {
			consecutiveFailures = 0;
			scheduleHeartbeat(ONLINE_POLL_MS);
			runActiveCheck();
		};

		const handleOffline = () => {
			consecutiveFailures = FAILURES_BEFORE_OFFLINE;
			scheduleHeartbeat(OFFLINE_POLL_MS);
			update((status) => ({
				...status,
				isOnline: false,
				isChecking: false,
				lastChecked: new Date(),
				connectionType: 'offline',
				connectionQuality: 'unknown',
				connectionInfo: null,
				retryCount: status.retryCount + 1 // NEW - Increment retry count when offline
			}));
		};

		const handleConnectionChange = () => {
			const connectionInfo = getConnectionInfo();
			const connectionQuality = getConnectionQuality(connectionInfo);
			update((status) => ({
				...status,
				connectionInfo: connectionInfo || null,
				connectionQuality
			}));
		};

		// Add event listeners
		window.addEventListener('online', handleOnline);
		window.addEventListener('offline', handleOffline);
		window.addEventListener('focus', runActiveCheck);
		document.addEventListener('visibilitychange', () => {
			if (!document.hidden) runActiveCheck();
		});

		if ((navigator as any).connection) {
			(navigator as any).connection.addEventListener('change', handleConnectionChange);
		}

		// Check initial status
		checkInitialStatus();
		
		// Update cached value when baseUrl changes
		baseUrl.subscribe((newUrl: string) => {
			cachedBaseUrl = newUrl;
		});
	}

	const cleanup = () => {
		if (heartbeatIntervalId) {
			clearInterval(heartbeatIntervalId);
			heartbeatIntervalId = null;
		}
		if (heartbeatDebounceTimer) {
			clearTimeout(heartbeatDebounceTimer);
			heartbeatDebounceTimer = null;
		}
	};

	// Destroy function for HMR/test scenarios
	const destroy = () => {
		isDestroyed = true;
		cleanup();
		checkInFlight = null;
		if (heartbeatDebounceTimer) {
			clearTimeout(heartbeatDebounceTimer);
			heartbeatDebounceTimer = null;
		}
	};

	// Cleanup on page unload
	if (browser) {
		window.addEventListener('beforeunload', cleanup);
	}

	return { subscribe, cleanup, destroy };
};

// Create and export the network store
export const network = createNetworkStore();

// Derived store for simplified online status
export const isOnline = derived(network, ($network) => $network.isOnline);

// Utility function to check connectivity with timeout
export async function checkConnectivity(timeout: number = 3000): Promise<boolean> {
	if (!browser) return false;
	if (!navigator.onLine) return false;

	const configuredBaseUrl = String(get(baseUrl));
	const probeUrl = createProbeUrl(configuredBaseUrl);

	if (!probeUrl) return navigator.onLine;

	const controller = new AbortController();
	const timer = window.setTimeout(() => controller.abort(), timeout);
	try {
		await fetch(probeUrl, {
			method: 'GET',
			mode: 'no-cors',
			cache: 'no-store',
			signal: controller.signal
		});
		return true;
	} catch {
		return false;
	} finally {
		clearTimeout(timer);
	}
}

// Utility function to show network status in console
export function logNetworkStatus(): void {
	if (browser) {
		const connectionInfo = (navigator as any).connection;
		console.log('Network Status:', {
			isOnline: navigator.onLine,
			connectionType: connectionInfo?.effectiveType || 'unknown',
			downlink: connectionInfo?.downlink || 'unknown',
			rtt: connectionInfo?.rtt || 'unknown'
		});
	}
}

// Helper function to determine connection quality
function getConnectionQuality(connectionInfo: any): 'fast' | 'slow' | 'unknown' {
	if (!connectionInfo) return 'unknown';

	const effectiveType = connectionInfo.effectiveType || connectionInfo.type;
	if (!effectiveType) return 'unknown';

	switch (effectiveType.toLowerCase()) {
		case '4g':
		case 'wifi':
		case 'ethernet':
			return 'fast';
		case '3g':
		case '2g':
		case 'slow-2g':
			return 'slow';
		default:
			return 'unknown';
	}
}

// Export the network utility functions
export const networkUtils = {
	checkConnectivity,
	logNetworkStatus,
	isOnline
};

// Development helper to simulate network conditions
if (import.meta.env.DEV) {
	(window as any).__debugNetwork = {
		// Force offline mode
		goOffline: () => {
			window.dispatchEvent(new Event('offline'));
		},

		// Force online mode
		goOnline: () => {
			window.dispatchEvent(new Event('online'));
		},

		// Simulate slow connection
		simulateSlow: () => {
			// Add artificial delay to API calls
			console.log('Simulating slow connection...');
		},

		// Clear all cache
		clearCache: () => {
			import('./api').then(({ apiCache }) => {
				apiCache.clear();
				localStorage.clear();
			});
		}
	};
}

// Export the network store
export default network;
