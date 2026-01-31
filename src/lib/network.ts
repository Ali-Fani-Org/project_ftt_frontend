import { writable, derived } from 'svelte/store';
import { browser } from '$app/environment';

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

	// Initialize network detection
	if (browser) {
		// Check initial connection status
		const checkInitialStatus = () => {
			const isOnline = navigator.onLine;
			const connectionInfo =
				(navigator as any).connection ||
				(navigator as any).mozConnection ||
				(navigator as any).webkitConnection;
			const connectionQuality = getConnectionQuality(connectionInfo);

			set({
				isOnline,
				isChecking: false,
				lastChecked: new Date(),
				lastOnline: isOnline ? new Date() : null, // NEW
				connectionType: isOnline ? 'online' : 'offline',
				connectionQuality,
				connectionInfo: connectionInfo || null,
				retryCount: 0 // NEW
			});
		};

		// Event listeners for connection changes
		const handleOnline = () => {
			const connectionInfo =
				(navigator as any).connection ||
				(navigator as any).mozConnection ||
				(navigator as any).webkitConnection;
			const connectionQuality = getConnectionQuality(connectionInfo);

			update((status) => ({
				...status,
				isOnline: true,
				isChecking: false,
				lastChecked: new Date(),
				lastOnline: new Date(), // NEW - Update lastOnline when coming online
				connectionType: 'online',
				connectionQuality,
				connectionInfo: connectionInfo || null,
				retryCount: 0 // NEW - Reset retry count when online
			}));
		};

		const handleOffline = () => {
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
			const connectionInfo =
				(navigator as any).connection ||
				(navigator as any).mozConnection ||
				(navigator as any).webkitConnection;
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

		if ((navigator as any).connection) {
			(navigator as any).connection.addEventListener('change', handleConnectionChange);
		}

		// Check initial status
		checkInitialStatus();
	}

	return { subscribe };
};

// Create and export the network store
export const network = createNetworkStore();

// Derived store for simplified online status
export const isOnline = derived(network, ($network) => $network.isOnline);

// Utility function to check connectivity with timeout
export async function checkConnectivity(timeout: number = 3000): Promise<boolean> {
	if (!browser) return false;

	return new Promise((resolve) => {
		// Check navigator.onLine first
		if (!navigator.onLine) {
			resolve(false);
			return;
		}

		// Create a timeout
		const timer = setTimeout(() => {
			resolve(false);
		}, timeout);

		// Try to fetch a simple resource
		const controller = new AbortController();
		const signal = controller.signal;

		fetch('https://www.google.com', { signal })
			.then(() => {
				clearTimeout(timer);
				controller.abort();
				resolve(true);
			})
			.catch(() => {
				clearTimeout(timer);
				controller.abort();
				resolve(false);
			});
	});
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
