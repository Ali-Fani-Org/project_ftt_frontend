import ky from 'ky';
import {
	authToken,
	baseUrl,
	globalLogout,
	DATA_STALE_THRESHOLD,
	ACTIVE_TIMER_VALIDITY_THRESHOLD
} from './stores';
import { get, writable } from 'svelte/store';

// Create API client with 401 handling and timeout
const createApiClient = () => {
	return ky.create({
		prefixUrl: get(baseUrl),
		timeout: 15000, // 15 second timeout to prevent hanging requests
		hooks: {
			beforeRequest: [
				(request: any) => {
					const token = get(authToken);
					if (token) {
						request.headers.set('Authorization', `Token ${token}`);
					}
				}
			],
			afterResponse: [
				async (request: any, options: any, response: any) => {
					// Check if response is 401 Unauthorized
					if (response.status === 401) {
						console.warn('Received 401 Unauthorized, logging out user');

						// Perform logout using global function with autoLogout flag
						globalLogout(true);

						// Throw an error to prevent further processing
						throw new Error('Authentication failed');
					}
				}
			],
			beforeError: [
				async (error: any) => {
					const { response } = error;
					if (response && response.body) {
						try {
							error.response._data = await response.clone().json();
						} catch {
							// Non-JSON error body — leave _data unset
						}
					}
					return error;
				}
			]
		}
	});
};

const apiStore = writable(createApiClient());

baseUrl.subscribe((url: string) => {
	apiStore.set(
		ky.create({
			prefixUrl: url,
			timeout: 15000, // 15 second timeout to prevent hanging requests
			hooks: {
				beforeRequest: [
					(request: any) => {
						const token = get(authToken);
						if (token) {
							request.headers.set('Authorization', `Token ${token}`);
						}
					}
				],
				afterResponse: [
					async (request: any, options: any, response: any) => {
						// Check if response is 401 Unauthorized
						if (response.status === 401) {
							console.warn('Received 401 Unauthorized, logging out user');

							// Perform logout using global function with autoLogout flag
							globalLogout(true);

							// Throw an error to prevent further processing
							throw new Error('Authentication failed');
						}
					}
				],
				beforeError: [
					async (error: any) => {
						const { response } = error;
						if (response && response.body) {
							try {
								error.response._data = await response.clone().json();
							} catch {
								// Non-JSON error body — leave _data unset
							}
						}
						return error;
					}
				]
			}
		})
	);
});

const api = {
	get: (url: string, options?: any) => get(apiStore).get(url, options),
	post: (url: string, options?: any) => get(apiStore).post(url, options),
	put: (url: string, options?: any) => get(apiStore).put(url, options),
	patch: (url: string, options?: any) => get(apiStore).patch(url, options),
	delete: (url: string, options?: any) => get(apiStore).delete(url, options)
};

export interface Project {
	id: number;
	title: string;
	description: string;
}

export interface Tag {
	id: number;
	title: string;
	tag: string;
	icon: string;
	color: string;
	created_at: string;
}

export interface TimeEntry {
	id: number;
	title: string;
	description: string;
	start_time: string;
	end_time: string | null;
	duration: string | null; // Duration in seconds as string (e.g., "8526.0")
	is_active: boolean;
	user: string;
	project: string;
	tags: Tag[];
}

export interface PaginatedTimeEntries {
	next: string | null;
	previous: string | null;
	results: TimeEntry[];
}

// --- Aggregated report payload (api/time_entries/report_data/) -----------------

export interface ReportFilters {
	start_date_after_tz: string;
	start_date_before_tz: string;
	prev_start_date_after_tz?: string;
	prev_start_date_before_tz?: string;
}

export interface ReportWindowSummary {
	start: string;
	end: string;
	span_days: number;
	total_seconds: number;
	entry_count: number;
}

export interface ReportDailyRow {
	date: string; // YYYY-MM-DD (Asia/Tehran)
	seconds: number;
	count: number;
}

export interface ReportRankedRow {
	name: string;
	seconds: number;
	count: number;
}

export interface ReportTagRow {
	id: number;
	title: string;
	color: string;
	seconds: number;
	count: number;
}

export interface ReportRecentTag {
	id: number;
	title: string;
	icon: string;
	color: string;
}

export interface ReportRecentEntry {
	id: number;
	title: string;
	project: string | null;
	start_time: string | null;
	end_time: string | null;
	duration: string | null;
	is_active: boolean;
	tags: ReportRecentTag[];
}

export interface ReportData {
	current: ReportWindowSummary & {
		daily: ReportDailyRow[];
		weekday_seconds: number[]; // Saturday-first, matching DAY_LABELS_SAT_FIRST
		weekday_counts: number[];
		hour_seconds: number[]; // index = local hour 0..23
		hour_counts: number[];
		heatmap: number[][]; // [weekdayIndex][hour]
		projects: ReportRankedRow[]; // sorted by seconds desc
		tasks: ReportRankedRow[]; // top 20 by seconds desc
		tags: ReportTagRow[]; // top 20 by seconds desc
		recent: ReportRecentEntry[]; // 12 newest, newest first
	};
	previous: ReportWindowSummary;
}

export interface RegistrationStatus {
	public_registration: boolean;
}

export interface Notification {
	id: string;
	type: 'INFO' | 'WARNING' | 'ERROR' | 'SUCCESS' | 'CRITICAL' | 'OTHER';
	message: string;
	created_at: string;
	read: boolean;
	delivered_at: string | null;
}

// Cache for API responses to improve performance
export const apiCache = new Map<
	string,
	{ data: any; timestamp: number; ttl: number; lastValidated: number; isStale: boolean }
>();

// Cache TTL in milliseconds (7 days for all the data)
const CACHE_TTL = 7 * 24 * 60 * 60 * 1000;

// Flag to disable caching globally
let disableCache = false;

// LocalStorage key prefix for persistence across app restarts
const LOCALSTORAGE_PREFIX = 'api_cache_';

/**
 * Enable or disable API caching globally
 * @param flag - true to disable cache, false to enable cache
 */
export function setCacheDisabled(flag: boolean) {
	disableCache = flag;
	console.log(`API cache ${flag ? 'disabled' : 'enabled'}`);
}

/**
 * Save cache to localStorage
 */
function saveToLocalStorage(key: string, data: any, ttl: number) {
	try {
		const storageData = {
			data,
			timestamp: Date.now(),
			ttl,
			lastValidated: Date.now(),
			isStale: false
		};
		localStorage.setItem(LOCALSTORAGE_PREFIX + key, JSON.stringify(storageData));
	} catch (err) {
		console.warn('Failed to save to localStorage:', err);
	}
}

/**
 * Load cache from localStorage
 */
function loadFromLocalStorage(key: string) {
	try {
		const stored = localStorage.getItem(LOCALSTORAGE_PREFIX + key);
		if (stored) {
			const parsed = JSON.parse(stored);
			// Ensure backward compatibility with old cache entries
			if (parsed.lastValidated === undefined) {
				parsed.lastValidated = parsed.timestamp;
			}
			if (parsed.isStale === undefined) {
				parsed.isStale = false;
			}
			return parsed;
		}
	} catch (err) {
		console.warn('Failed to load from localStorage:', err);
	}
	return null;
}

import { network } from './network';
import { dataFreshnessManager } from './dataFreshness';

/**
 * Try to fetch data from API, falling back to cache on failure
 * @param key - Cache key
 * @param fetchFn - Function to fetch data from API
 * @param ttl - Cache TTL in milliseconds
 * @param allowStale - Whether to return stale data as fallback
 * @returns Object with data, stale flag, and cached flag
 */
export async function fetchWithCache<T>(
	key: string,
	fetchFn: () => Promise<T>,
	ttl: number = CACHE_TTL,
	allowStale: boolean = true // NEW: allow stale data as fallback
): Promise<{ data: T | null; stale: boolean; cached: boolean }> {
	// CRITICAL: No API calls when offline - return cache immediately
	if (!get(network).isOnline) {
		console.log(`Offline: returning cached data for ${key}`);
		const cached = getCached<T>(key, allowStale);

		if (cached) {
			return { data: cached, stale: true, cached: true };
		}

		console.warn(`No cached data available for ${key} while offline`);
		return { data: null, stale: true, cached: false };
	}

	try {
		// Try fresh fetch (only when online)
		const data = await fetchFn();
		setCached(key, data, ttl);

		// Update freshness tracker
		dataFreshnessManager.updateTimestamp(key);
		dataFreshnessManager.updateTimestamp('global'); // Update global freshness

		return { data, stale: false, cached: false };
	} catch (error) {
		console.warn(`API call failed for ${key}, trying cache...`, error);

		// Fallback to cache (even if stale)
		const cached = getCached<T>(key, allowStale);

		if (cached) {
			console.log(`Using ${allowStale ? 'stale' : 'fresh'} cached data for ${key}`);
			return { data: cached, stale: true, cached: true };
		}

		return { data: null, stale: true, cached: false };
	}
}

/**
 * Network-aware retry logic for failed requests
 * @param fetchFn - Function to fetch data from API
 * @param maxRetries - Maximum number of retries
 * @param backoff - Initial backoff time in ms
 * @returns Promise with the result
 */
export async function fetchWithRetry<T>(
	fetchFn: () => Promise<T>,
	maxRetries: number = 3,
	backoff: number = 1000
): Promise<T> {
	// Check network before first attempt
	if (!get(network).isOnline) {
		throw new Error('Device is offline - cannot make request');
	}

	let lastError: Error;

	for (let i = 0; i < maxRetries; i++) {
		try {
			return await fetchFn();
		} catch (error) {
			lastError = error as Error;

			// Don't retry if offline
			if (!get(network).isOnline) {
				throw error;
			}

			// Don't retry 4xx errors (except 429)
			const httpError = error as { response?: { status?: number } };
			if (
				httpError.response?.status !== undefined &&
				httpError.response.status >= 400 &&
				httpError.response.status < 500 &&
				httpError.response.status !== 429
			) {
				throw error;
			}

			// Wait with exponential backoff
			const delay = backoff * Math.pow(2, i);
			console.log(`Retry ${i + 1}/${maxRetries} after ${delay}ms`);
			await new Promise((resolve) => setTimeout(resolve, delay));
		}
	}

	throw lastError!;
}

/**
 * Get cached data if available and not expired
 * @param key - Cache key
 * @param allowStale - Whether to return stale data
 * @returns Cached data or null if not available/expired
 */
function getCached<T>(key: string, allowStale: boolean = false): T | null {
	// Return null if caching is disabled
	if (disableCache) {
		console.log(`Cache disabled, returning null for: ${key}`);
		return null;
	}

	// First check in-memory cache
	let cached = apiCache.get(key);

	// If not in memory, try localStorage
	if (!cached) {
		const stored = loadFromLocalStorage(key);
		if (stored) {
			// Restore to in-memory cache
			apiCache.set(key, stored);
			cached = stored;
		}
	}

	if (cached) {
		const age = Date.now() - cached.timestamp;
		const isExpired = age > cached.ttl;
		const isStale = age > DATA_STALE_THRESHOLD;

		if (isExpired && !allowStale) {
			// Remove expired cache
			apiCache.delete(key);
			try {
				localStorage.removeItem(LOCALSTORAGE_PREFIX + key);
			} catch (err) {
				console.warn('Failed to remove stale cache from localStorage:', err);
			}
			return null;
		}

		if (isStale && !allowStale) {
			console.warn(`Cache for ${key} is stale (${age}ms old)`);
		}

		console.log(`Cache hit for: ${key}`);
		return cached.data;
	}

	return null;
}

function setCached(key: string, data: any, ttl: number = CACHE_TTL) {
	const cacheData = {
		data,
		timestamp: Date.now(),
		ttl,
		lastValidated: Date.now(),
		isStale: false
	};
	apiCache.set(key, cacheData);
	saveToLocalStorage(key, data, ttl);
}

/**
 * Type for error response objects that can come from different HTTP clients
 * Supports standard Response objects and Ky-specific response objects
 */
export type ErrorResponse =
	| Response
	| { _data?: Record<string, any>; clone?: () => Response; json?: () => Promise<any> };

/**
 * Parse error response from API calls
 * Handles different response formats from various HTTP clients
 * @param response - The error response object (can be Response or Ky-specific)
 * @returns Parsed error data as JSON object
 */
export async function parseErrorResponse(response: ErrorResponse): Promise<Record<string, any>> {
	try {
		// Method 1: Clone + parse (standard Response objects)
		// This avoids "body already read" errors
		if (response.clone && typeof response.clone === 'function') {
			const clonedResponse = response.clone();
			return await clonedResponse.json();
		}

		// Method 2: Ky-specific _data property
		// Some HTTP clients (e.g., Ky) cache parsed response data here
		if ('_data' in response && response._data) {
			return response._data;
		}

		// Method 3: Direct parse (last resort)
		if ('json' in response && typeof response.json === 'function') {
			return await response.json();
		}

		// No parseable format found
		console.warn('Could not parse error response: unknown format');
		return {};
	} catch (parseError) {
		console.warn('Could not parse error response:', parseError);
		return {};
	}
}

export const auth = {
	login: async (username: string, password: string) => {
		const response = await ky
			.post(`${get(baseUrl)}/auth/token/login/`, {
				json: { username, password }
			})
			.json<{ auth_token: string }>();
		return response.auth_token;
	},
	register: async (username: string, password: string, first_name: string, last_name: string) => {
		try {
			await ky.post(`${get(baseUrl)}/auth/users/`, {
				json: { username, password, first_name, last_name }
			});
		} catch (error: any) {
			if (error.response) {
				// Add the JSON data to the error response for field-specific errors
				try {
					const errorData = await error.response.json();
					error.response._data = errorData;
				} catch (parseError) {
					// If parsing fails, continue with original error
					console.warn('Could not parse error response as JSON:', parseError);
				}
			}
			throw error;
		}
	},
	getUser: async (): Promise<{
		id: number;
		username: string;
		first_name: string;
		last_name: string;
		profile_image: string | null;
	}> => {
		const cacheKey = 'user:me:v2';
		const cached = getCached<{
			id: number;
			username: string;
			first_name: string;
			last_name: string;
			profile_image: string | null;
			is_staff?: boolean;
		}>(cacheKey);
		if (cached) return cached;

		const result = await api.get('auth/users/me/').json<{
			id: number;
			username: string;
			first_name: string;
			last_name: string;
			profile_image: string | null;
			is_staff?: boolean;
		}>();
		setCached(cacheKey, result, CACHE_TTL);
		return result;
	},
	updateUser: async (data: {
		username?: string;
		first_name?: string;
		last_name?: string;
		profile_image?: string | null;
	}) => {
		// Clear cache when updating
		apiCache.delete('user:me:v2');
		try {
			localStorage.removeItem(LOCALSTORAGE_PREFIX + 'user:me:v2');
		} catch (err) {}
		// Use PUT to replace or update the resource; many DRF endpoints also accept PATCH
		const result = await api.put('auth/users/me/', { json: data }).json<{
			id: number;
			username: string;
			first_name: string;
			last_name: string;
			profile_image: string | null;
			is_staff?: boolean;
		}>();
		setCached('user:me:v2', result, CACHE_TTL);
		return result;
	},
	updateUserForm: async (form: FormData) => {
		// Clear cache when updating
		apiCache.delete('user:me:v2');
		try {
			localStorage.removeItem(LOCALSTORAGE_PREFIX + 'user:me:v2');
		} catch (err) {}
		// Use PATCH with form data to support partial updates and file upload.
		const result = await api.patch('auth/users/me/', { body: form }).json<{
			id: number;
			username: string;
			first_name: string;
			last_name: string;
			profile_image: string | null;
			is_staff?: boolean;
		}>();
		setCached('user:me:v2', result, CACHE_TTL);
		return result;
	}
};

export const projects = {
	list: async () => {
		const cacheKey = 'projects:all';
		const cached = getCached(cacheKey);
		if (cached) return cached;

		const result = await api.get('api/projects/').json<Project[]>();
		setCached(cacheKey, result, CACHE_TTL);
		return result;
	},

	/**
	 * Fetch projects without using cache (always makes fresh API request)
	 */
	listFresh: async () => {
		const cacheKey = 'projects:all';
		const result = await api.get('api/projects/').json<Project[]>();
		setCached(cacheKey, result, CACHE_TTL);
		return result;
	}
};

export const tags = {
	/** Tags endpoint returns a plain array (pagination_class = None). */
	list: async () => {
		const result = await api.get('api/tags/').json<Tag[]>();
		return result;
	},
	create: async (data: { title: string; tag?: string; icon: string; color: string }) => {
		return await api.post('api/tags/', { json: data }).json<Tag>();
	},
	update: async (
		id: number,
		data: Partial<{ title: string; tag: string; icon: string; color: string }>
	) => {
		return await api.patch(`api/tags/${id}/`, { json: data }).json<Tag>();
	},
	remove: async (id: number) => {
		await api.delete(`api/tags/${id}/`);
	}
};

export const timeEntries = {
	list: async (cursor?: string, limit?: number) => {
		const params = new URLSearchParams();
		if (cursor) params.append('cursor', cursor);
		if (limit) params.append('limit', limit.toString());
		const url = `api/time_entries/?${params.toString()}`;
		const cacheKey = `time_entries:list:${url}`;

		const result = await fetchWithCache(cacheKey, () => api.get(url).json<PaginatedTimeEntries>());
		return result.data;
	},
	listWithFilters: async (filters?: {
		start_date_after?: string;
		start_date_before?: string;
		end_date_after?: string;
		end_date_before?: string;
		start_date_after_tz?: string;
		start_date_before_tz?: string;
		end_date_after_tz?: string;
		end_date_before_tz?: string;
		duration_min?: string;
		duration_max?: string;
		project?: number;
		search?: string;
		tags?: string;
		cursor?: string;
		limit?: number;
		ordering?: string;
	}) => {
		const params = new URLSearchParams();
		if (filters?.start_date_after) params.append('start_date_after', filters.start_date_after);
		if (filters?.start_date_before) params.append('start_date_before', filters.start_date_before);
		if (filters?.end_date_after) params.append('end_date_after', filters.end_date_after);
		if (filters?.end_date_before) params.append('end_date_before', filters.end_date_before);
		if (filters?.start_date_after_tz)
			params.append('start_date_after_tz', filters.start_date_after_tz);
		if (filters?.start_date_before_tz)
			params.append('start_date_before_tz', filters.start_date_before_tz);
		if (filters?.end_date_after_tz) params.append('end_date_after_tz', filters.end_date_after_tz);
		if (filters?.end_date_before_tz)
			params.append('end_date_before_tz', filters.end_date_before_tz);
		if (filters?.duration_min) params.append('duration_min', filters.duration_min);
		if (filters?.duration_max) params.append('duration_max', filters.duration_max);
		if (filters?.project) params.append('project', filters.project.toString());
		if (filters?.search) params.append('search', filters.search);
		if (filters?.tags) params.append('tags', filters.tags);
		if (filters?.cursor) params.append('cursor', filters.cursor);
		if (filters?.limit) params.append('limit', filters.limit.toString());
		if (filters?.ordering) params.append('ordering', filters.ordering);
		const url = `api/time_entries/?${params.toString()}`;
		const cacheKey = `time_entries:filtered:${url}`;

		// CRITICAL: No API calls when offline - return cache immediately
		if (!get(network).isOnline) {
			console.log(`Offline: returning cached data for ${cacheKey}`);
			const cached = getCached<PaginatedTimeEntries>(cacheKey);
			if (cached) return cached;
			console.warn(`No cached data available for ${cacheKey} while offline`);
			// Return empty paginated result instead of null (no count field)
			return { results: [], next: null, previous: null };
		}

		const result = await fetchWithCache(cacheKey, () => api.get(url).json<PaginatedTimeEntries>());
		// Return cached data or empty result instead of null (no count field)
		return result.data || { results: [], next: null, previous: null };
	},
	start: async (data: {
		title: string;
		description?: string;
		project: number;
		tags?: number[];
		start_time?: string; // Optional - ISO 8601 datetime string for custom start time (up to 60 min in the past)
	}) => {
		// Clear related caches when starting a new timer
		apiCache.delete('time_entries:all');
		apiCache.delete('time_entries:current_active');
		try {
			localStorage.removeItem(LOCALSTORAGE_PREFIX + 'time_entries:all');
			localStorage.removeItem(LOCALSTORAGE_PREFIX + 'time_entries:current_active');
		} catch (err) {}
		const result = await api.post('api/time_entries/', { json: data }).json<TimeEntry>();
		return result;
	},
	stop: async (id: number) => {
		// Clear related caches when stopping a timer
		apiCache.delete('time_entries:all');
		apiCache.delete('time_entries:current_active');
		try {
			localStorage.removeItem(LOCALSTORAGE_PREFIX + 'time_entries:all');
			localStorage.removeItem(LOCALSTORAGE_PREFIX + 'time_entries:current_active');
		} catch (err) {}
		const result = await api.post(`api/time_entries/${id}/stop/`).json<TimeEntry>();
		return result;
	},
	getCurrentActive: async (): Promise<TimeEntry | null> => {
		const cacheKey = 'time_entries:current_active';

		// The active timer must always reflect the server: it is live state that
		// starts/stops constantly, and a stale entry misleads in both directions
		// (phantom "running" timers and hidden real ones).
		//
		// Offline: show a cached entry ONLY if it is genuinely running and recent
		// (within ACTIVE_TIMER_VALIDITY_THRESHOLD). Anything else means "no active
		// timer" — never a stale phantom.
		if (!get(network).isOnline) {
			const cached = getCached<TimeEntry>(cacheKey);
			if (cached) {
				const meta = apiCache.get(cacheKey);
				const age = meta ? Date.now() - meta.timestamp : Infinity;
				if (cached.is_active && age <= ACTIVE_TIMER_VALIDITY_THRESHOLD) {
					console.log(`Offline: showing cached active timer (${Math.round(age / 60000)}m old)`);
					return cached;
				}
				console.warn(
					`Offline: ignoring cached active timer (${age === Infinity ? 'unknown age' : `${Math.round(age / 60000)}m old`})`
				);
			}
			console.warn(`Offline: no valid cached active timer for ${cacheKey}`);
			return null;
		}

		try {
			// Always 200: `entry` is the active TimeEntry, or null when none is running
			// ("no active entry" is normal state, not an error).
			const { entry } = await api
				.get('api/time_entries/current_active/')
				.json<{ entry: TimeEntry | null }>();
			if (entry === null) {
				apiCache.delete(cacheKey);
				try {
					localStorage.removeItem(LOCALSTORAGE_PREFIX + cacheKey);
				} catch (err) {
					// Ignore localStorage errors
				}
				return null;
			}
			// Cache the successful response as an offline fallback
			setCached(cacheKey, entry, CACHE_TTL);
			return entry;
		} catch (error: any) {
			// Never serve stale data for the active timer on error — surface the
			// failure so TanStack retries (and the UI shows an error) instead of
			// silently presenting a phantom or missing timer.
			console.warn(`API call failed for ${cacheKey}, rethrowing`, error);
			throw error;
		}
	},
	/**
	 * Update a time entry's title, description, and/or tags
	 * @param id - The ID of the time entry to update
	 * @param data - Object containing fields to update (title, description, tags)
	 * @returns The updated TimeEntry object
	 */
	update: async (
		id: number,
		data: { title?: string; description?: string | null; tags?: number[] }
	) => {
		// Clear all time_entries related caches when updating
		// Use known cache keys instead of iterating all localStorage keys
		const knownCacheKeys = [
			'time_entries:all',
			'time_entries:current_active',
			'time_entries:list',
			'time_entries:filtered'
		];

		// Clear from in-memory cache
		for (const key of knownCacheKeys) {
			apiCache.delete(key);
		}

		// Also clear any dynamic filtered keys from in-memory cache
		const dynamicKeys = Array.from(apiCache.keys()).filter((key) =>
			key.startsWith('time_entries:filtered:')
		);
		for (const key of dynamicKeys) {
			apiCache.delete(key);
		}

		// Clear from localStorage using known keys
		for (const key of knownCacheKeys) {
			try {
				localStorage.removeItem(LOCALSTORAGE_PREFIX + key);
			} catch (err) {
				console.warn(`Failed to remove cache key ${key}:`, err);
			}
		}

		// Clear dynamic filtered keys from localStorage
		// Note: We iterate localStorage here because filtered keys are dynamic
		// but we limit the iteration to only keys matching our prefix pattern
		try {
			const storageKeys = Object.keys(localStorage);
			for (const key of storageKeys) {
				if (key.startsWith(LOCALSTORAGE_PREFIX + 'time_entries:')) {
					try {
						localStorage.removeItem(key);
					} catch (removeErr) {
						console.warn(`Failed to remove cache key ${key}:`, removeErr);
					}
				}
			}
		} catch (err) {
			// Ignore localStorage errors - this is non-critical
			console.warn('Error accessing localStorage for cache clearing:', err);
		}

		const result = await api.patch(`api/time_entries/${id}/`, { json: data }).json<TimeEntry>();

		// Update the current_active cache if this is the active entry
		if (result.is_active) {
			setCached('time_entries:current_active', result, CACHE_TTL);
		}

		return result;
	},
	/**
	 * Aggregated reports payload from the server (see
	 * api/time_entries/report_data/): KPIs, daily/weekday/hour series,
	 * project/task/tag totals, recent rows, and the previous-window summary.
	 * One small request at any range size — replaces fetching every raw entry
	 * in the window (which the Year view paid for twice, once per delta).
	 */
	reportData: async (filters: ReportFilters): Promise<ReportData | null> => {
		const params = new URLSearchParams();
		params.append('start_date_after_tz', filters.start_date_after_tz);
		params.append('start_date_before_tz', filters.start_date_before_tz);
		if (filters.prev_start_date_after_tz)
			params.append('prev_start_date_after_tz', filters.prev_start_date_after_tz);
		if (filters.prev_start_date_before_tz)
			params.append('prev_start_date_before_tz', filters.prev_start_date_before_tz);
		const url = `api/time_entries/report_data/?${params.toString()}`;
		const cacheKey = `time_entries:report_data:${url}`;

		// CRITICAL: No API calls when offline - return cache immediately
		if (!get(network).isOnline) {
			const cached = getCached<ReportData>(cacheKey);
			if (cached) return cached;
			console.warn(`Offline: no cached report data for ${cacheKey}`);
			return null;
		}

		const result = await fetchWithCache(cacheKey, () => api.get(url).json<ReportData>());
		return result.data || null;
	}
};

export const publicStatus = {
	/**
	 * Whether new-user registration is enabled (public, no auth needed).
	 * Used by the login page to decide whether to show the signup form.
	 */
	getRegistrationStatus: async (): Promise<RegistrationStatus> => {
		return await ky
			.get(`${get(baseUrl)}/api/accounts/registration-status/`)
			.json<RegistrationStatus>();
	}
};

export interface PasskeyCredential {
	id: number;
	device_name: string;
	created_at: string;
	last_used_at: string;
}

export const passkeys = {
	list: async (): Promise<PasskeyCredential[]> => {
		return await api.get('api/passkeys/credentials/').json<PasskeyCredential[]>();
	},
	delete: async (id: number): Promise<void> => {
		await api.delete('api/passkeys/credentials/', { json: { id } });
	},
	registerBegin: async (deviceName?: string): Promise<{ options: string }> => {
		const trimmedDeviceName = deviceName?.trim();
		return await api
			.post('api/passkeys/register/begin/', {
				json: trimmedDeviceName ? { device_name: trimmedDeviceName } : {}
			})
			.json<{ options: string }>();
	},
	registerComplete: async (
		credential: any
	): Promise<{ detail: string; credential: PasskeyCredential }> => {
		return await api
			.post('api/passkeys/register/complete/', { json: { credential } })
			.json<{ detail: string; credential: PasskeyCredential }>();
	},
	authenticateBegin: async (username: string): Promise<{ options: string }> => {
		// Use ky directly (no auth token needed) for unauthenticated endpoints
		return await ky
			.post(`${get(baseUrl)}/api/passkeys/authenticate/begin/`, {
				json: { username }
			})
			.json<{ options: string }>();
	},
	authenticateComplete: async (
		username: string,
		credential: any
	): Promise<{
		detail: string;
		token: string;
		user: {
			id: number;
			username: string;
			first_name: string;
			last_name: string;
			profile_image: string | null;
			is_staff: boolean;
		};
	}> => {
		// Use ky directly (no auth token needed) for unauthenticated endpoints
		return await ky
			.post(`${get(baseUrl)}/api/passkeys/authenticate/complete/`, {
				json: { username, credential }
			})
			.json<{
				detail: string;
				token: string;
				user: {
					id: number;
					username: string;
					first_name: string;
					last_name: string;
					profile_image: string | null;
					is_staff: boolean;
				};
			}>();
	}
};
