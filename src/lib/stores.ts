import { derived, writable, type Writable } from 'svelte/store';
import { browser } from '$app/environment';
import { gotoApp } from '$lib/navigation';
import logger from '$lib/logger';

// Data staleness threshold (milliseconds)
// Note: This is a constant, not user-configurable, but easy to change here
export const DATA_STALE_THRESHOLD = 24 * 60 * 60 * 1000; // 1 day

// Data outdated threshold (milliseconds) - shorter than stale, equals refresh interval
export const DATA_OUTDATED_THRESHOLD = 5 * 60 * 1000; // 5 minutes (increased from 30s to reduce toast spam)

// Active timer validity threshold (milliseconds)
// How long to show cached active timer when offline
export const ACTIVE_TIMER_VALIDITY_THRESHOLD = 4 * 60 * 60 * 1000; // 4 hours

// Initialize Tauri settings store
let tauriSettingsStore: any = null;
let tauriSettingsInitialized = false;

async function initializeTauriSettingsStore() {
	if (tauriSettingsInitialized) return tauriSettingsStore;

	if (typeof window !== 'undefined' && (window as any).__TAURI__) {
		try {
			const { LazyStore } = await import('@tauri-apps/plugin-store');
			tauriSettingsStore = new LazyStore('settings.json');
			await tauriSettingsStore.load();
			tauriSettingsInitialized = true;
			logger.debug('✅ Tauri settings store initialized');
		} catch (e) {
			logger.error('Failed to initialize Tauri settings store:', e);
			tauriSettingsInitialized = true; // Prevent repeated failed attempts
		}
	}

	return tauriSettingsStore;
}

async function getTauriSetting<T>(key: string, initialValue: T): Promise<T> {
	try {
		const store = await initializeTauriSettingsStore();
		if (store) {
			const value = await store.get(key);
			if (value !== null && value !== undefined) {
				logger.debug(`✅ Loaded setting ${key} from Tauri store:`, value);
				return value as T;
			}
		}
	} catch (e) {
		logger.error(`Failed to load setting ${key} from Tauri store:`, e);
	}

	// Fallback to localStorage for web development
	if (browser) {
		const storedValue = localStorage.getItem(key);
		if (storedValue !== null) {
			try {
				const parsedValue = JSON.parse(storedValue);
				logger.debug(`✅ Loaded setting ${key} from localStorage (fallback, JSON):`, parsedValue);
				return parsedValue;
			} catch {
				// Some keys (e.g., theme) may be stored as plain strings by theme-change
				logger.debug(`✅ Loaded setting ${key} from localStorage (fallback, raw):`, storedValue);
				return storedValue as T;
			}
		}
	}

	logger.debug(`🔄 Using default value for ${key}:`, initialValue);
	return initialValue;
}

async function setTauriSetting(key: string, value: any): Promise<void> {
	try {
		const store = await initializeTauriSettingsStore();
		if (store) {
			await store.set(key, value);
			await store.save();
			logger.debug(`✅ Saved setting ${key} to Tauri store:`, value);
		}
	} catch (e) {
		logger.error(`Failed to save setting ${key} to Tauri store:`, e);
	}

	// Also save to localStorage as fallback for web development
	if (browser) {
		try {
			localStorage.setItem(key, JSON.stringify(value));
			if (!window.__pendingLocalStorageLogs) {
				window.__pendingLocalStorageLogs = new Map();
			}
			window.__pendingLocalStorageLogs.set(key, value);
			scheduleLogBatch();
		} catch (e) {
			logger.error(`Failed to save setting ${key} to localStorage:`, e);
		}
	}
}

// Batch logging variables
declare global {
	interface Window {
		__pendingLocalStorageLogs?: Map<string, any>;
		__logTimeout?: NodeJS.Timeout | null;
	}
}

function scheduleLogBatch() {
	if (window.__logTimeout) clearTimeout(window.__logTimeout);

	window.__logTimeout = setTimeout(() => {
		if (window.__pendingLocalStorageLogs && window.__pendingLocalStorageLogs.size > 0) {
			logger.debug(`✅ Saved ${window.__pendingLocalStorageLogs.size} settings to localStorage`, {
				changes: Object.fromEntries(window.__pendingLocalStorageLogs),
				supportedKeys: [
					'authToken',
					'user',
					'baseUrl',
					'baseUrlHistory',
					'theme',
					'customThemes',
					'minimizeToTray',
					'closeToTray',
					'autostart',
					'timeEntriesDisplayMode',
					'sidebarCollapsed'
				]
			});
			window.__pendingLocalStorageLogs.clear();
		}
		window.__logTimeout = null;
	}, 100); // 100ms batching window
}

interface PersistentStore<T> extends Writable<T> {
	initialized: Promise<T>;
}

function createPersistentStore<T>(key: string, initialValue: T): PersistentStore<T> {
	let store: any;
	let isInitialized = false;
	// Keep track of subscribers while waiting for initialization
	let pendingSubscribers: Array<(value: T) => void> = [];
	// Track subscribers that unsubscribed before initialization completed
	const cleanedUpBeforeInit = new WeakSet<(value: T) => void>();
	// Promise that resolves when initialization is complete
	let initResolve: (value: T) => void;
	const initPromise = new Promise<T>((resolve) => {
		initResolve = resolve;
	});

	// Create the store with proper initialization
	const createStore = async () => {
		const loadedValue = await getTauriSetting(key, initialValue);
		store = writable<T>(loadedValue);
		isInitialized = true;

		// Resolve the initialization promise
		initResolve(loadedValue);

		// Notify any pending subscribers (skip those that unsubscribed before init)
		pendingSubscribers.forEach((run) => {
			if (!cleanedUpBeforeInit.has(run)) {
				run(loadedValue);
			}
		});
		pendingSubscribers = [];

		// Subscribe to changes and save to Tauri store
		store.subscribe((value: T) => {
			if (isInitialized) {
				setTauriSetting(key, value);
			}
		});

		return store;
	};

	// Initialize asynchronously
	createStore();

	// Return a proxy that will be properly initialized
	return {
		subscribe: (run: any) => {
			if (!isInitialized) {
				// Store subscriber to call once initialized
				pendingSubscribers.push(run);
				return () => {
					// Mark as cleaned up to prevent calling after unsubscribe
					cleanedUpBeforeInit.add(run);
					// Cleanup: remove from pending subscribers
					const index = pendingSubscribers.indexOf(run);
					if (index > -1) {
						pendingSubscribers.splice(index, 1);
					}
				};
			}
			// Already initialized, subscribe normally
			return store.subscribe(run);
		},
		set: (value: T) => {
			if (!isInitialized) {
				// Use queueMicrotask instead of polling for better performance
				queueMicrotask(() => {
					if (isInitialized) {
						store.set(value);
					} else {
						// Fallback with single retry after short delay
						setTimeout(() => {
							if (isInitialized) store.set(value);
						}, 100);
					}
				});
				return;
			}
			store.set(value);
		},
		update: (fn: any) => {
			if (!isInitialized) {
				// Use queueMicrotask instead of polling for better performance
				queueMicrotask(() => {
					if (isInitialized) {
						store.update(fn);
					} else {
						// Fallback with single retry after short delay
						setTimeout(() => {
							if (isInitialized) store.update(fn);
						}, 100);
					}
				});
				return;
			}
			store.update(fn);
		},
		// Promise that resolves when the store is initialized with the loaded value
		initialized: initPromise
	};
}

export const authToken = createPersistentStore<string | null>('authToken', null);
export const user = createPersistentStore<{
	id: number;
	username: string;
	first_name: string;
	last_name: string;
	profile_image: string | null;
	is_staff?: boolean;
} | null>('user', null);

/** True when the current user is staff — gates tag-management UI. */
export const isAdmin = derived(user, ($user) => ($user?.is_staff ?? false) === true);

export const baseUrl = createPersistentStore<string>('baseUrl', 'https://hr.alpharency.com');

export type BaseUrlHistoryEntry = {
	url: string;
	lastPingMs: number | null;
	lastCheckedAt: number | null;
	ok: boolean | null;
};

export const baseUrlHistory = createPersistentStore<BaseUrlHistoryEntry[]>('baseUrlHistory', []);
export const theme = createPersistentStore<string>('theme', 'light');
export const customThemes = createPersistentStore<Record<string, Record<string, string>>>(
	'customThemes',
	{}
);

// Variable to track if we've loaded the initial baseUrl value
let hasLoadedInitialBaseUrl = false;
let previousBaseUrl: string | null = null;

// Subscribe to baseUrl changes to handle logout when URL changes
baseUrl.subscribe((newBaseUrl: string) => {
	if (!hasLoadedInitialBaseUrl) {
		// This is the first time loading the baseUrl value from storage, just mark as loaded
		hasLoadedInitialBaseUrl = true;
		previousBaseUrl = newBaseUrl;
	} else if (previousBaseUrl !== newBaseUrl) {
		// Base URL has changed after initial load, log out the user and show appropriate message
		logger.log(`Base URL changed from ${previousBaseUrl} to ${newBaseUrl}, logging out user`);

		// Perform logout with a custom message about the base URL change
		const customMessage = `Base URL changed from "${previousBaseUrl}" to "${newBaseUrl}". You have been logged out for security reasons.`;
		globalLogout(false, customMessage);

		// Update the previous URL to the new one after logout
		previousBaseUrl = newBaseUrl;
	}
});
export const minimizeToTray = createPersistentStore<boolean>('minimizeToTray', true);
export const closeToTray = createPersistentStore<boolean>('closeToTray', false);
export const autostart = createPersistentStore<boolean>('autostart', false);

export const timeEntriesDisplayMode = createPersistentStore<string>(
	'timeEntriesDisplayMode',
	'window'
);
export const backgroundAnimationEnabled = createPersistentStore<boolean>(
	'backgroundAnimationEnabled',
	true
);
export type BackgroundAnimationStyle = 'drift' | 'wave' | 'bokeh' | 'ocean' | 'nebula' | 'lattice';
export const backgroundAnimationStyle = createPersistentStore<BackgroundAnimationStyle>(
	'backgroundAnimationStyle',
	'drift'
);
export const oceanWaveCharacter = createPersistentStore<number>('oceanWaveCharacter', 0.5); // 0 calm swells — 1 stormy chop
export const statsPanelEnabled = createPersistentStore<boolean>('statsPanelEnabled', false);
export const timerRefreshInterval = createPersistentStore<number>('timerRefreshInterval', 30000); // Default: 30 seconds (30000ms)

// Auto-refresh settings
export const autoRefreshEnabled = createPersistentStore<boolean>('autoRefreshEnabled', true);
export const refreshInterval = createPersistentStore<number>('refreshInterval', 30000); // 30 seconds default
export const refreshOnReconnect = createPersistentStore<boolean>('refreshOnReconnect', true);
export const refreshOnlyWhenVisible = createPersistentStore<boolean>(
	'refreshOnlyWhenVisible',
	true
);

// Logout alert state
export const logoutAlert = writable<{ show: boolean; message: string }>({
	show: false,
	message: ''
});

// Global logout function that can be used by API hooks
export function globalLogout(autoLogout = false, customMessage?: string) {
	// Clear only authentication-related data from localStorage, preserve settings
	if (browser) {
		// Get all keys before clearing to preserve settings
		const keysToPreserve = [
			'baseUrl',
			'baseUrlHistory',
			'theme',
			'customThemes',
			'minimizeToTray',
			'closeToTray',
			'autostart',
			'timeEntriesDisplayMode',
			'sidebarCollapsed'
		];

		// Create a temporary object to store settings
		const preservedSettings: Record<string, any> = {};
		for (const key of keysToPreserve) {
			const storedValue = localStorage.getItem(key);
			if (storedValue !== null) {
				// Always try to parse as JSON first, fall back to raw value
				try {
					preservedSettings[key] = JSON.parse(storedValue);
				} catch (e) {
					// If parsing fails, it's a plain string value
					preservedSettings[key] = storedValue;
				}
			}
		}

		// Clear all localStorage
		localStorage.clear();

		// Restore only the preserved settings
		for (const [key, value] of Object.entries(preservedSettings)) {
			try {
				localStorage.setItem(key, JSON.stringify(value));
			} catch (e) {
				logger.error(`Failed to restore setting ${key}:`, e);
			}
		}

		// Clear sessionStorage completely (for security)
		sessionStorage.clear();
	}

	// Reset stores
	authToken.set(null);
	user.set(null);

	// Reset the baseUrl tracking so that the next app load won't trigger logout
	hasLoadedInitialBaseUrl = false;
	previousBaseUrl = null;

	// Show alert with appropriate message based on context
	let message = '';
	if (customMessage) {
		// Use custom message if provided (e.g., for base URL changes)
		message = customMessage;
	} else if (autoLogout) {
		// Automatic logout due to 401 response (session expired)
		message = 'Your session has expired. Please log in again.';
	} else {
		// User-initiated logout
		message = 'You have been logged out successfully.';
	}

	// Set the logout alert with the appropriate message
	logoutAlert.set({
		show: true,
		message: message
	});

	// Redirect to login page
	gotoApp('/');
}

export const logout = () => globalLogout(false);

// Sidebar collapsed state store (persistent)
export const sidebarCollapsed = createPersistentStore<boolean>('sidebarCollapsed', false);
