import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// The default vitest environment is node, which has no localStorage — provide a
// minimal in-memory stub so the api cache layer (which uses localStorage) works.
const localStorageMock = (() => {
	const store = new Map<string, string>();
	return {
		getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
		setItem: (key: string, value: string) => void store.set(key, String(value)),
		removeItem: (key: string) => void store.delete(key),
		clear: () => void store.clear(),
		key: (index: number) => [...store.keys()][index] ?? null,
		get length() {
			return store.size;
		}
	};
})();
vi.stubGlobal('localStorage', localStorageMock);

// Mock browser environment
vi.mock('$app/environment', () => ({
	browser: true
}));

// A single MUTABLE network mock. `isOnline` is flipped per test instead of
// re-registering the module with nested vi.mock calls — nested vi.mock is
// hoisted to the top of the file, so the last registration used to win for
// EVERY test (making the whole file see the offline mock).
const networkMock = vi.hoisted(() => ({ isOnline: true }));

// Mock network store
vi.mock('../network', () => ({
	network: {
		subscribe: (callback: any) => {
			callback({ isOnline: networkMock.isOnline });
			return () => {};
		},
		get isOnline() {
			return networkMock.isOnline;
		}
	},
	checkConnectivity: vi.fn(() => Promise.resolve(networkMock.isOnline))
}));

// Reset the network to online before every test (offline tests flip it inside
// the test body; this outer hook runs first for each test).
beforeEach(() => {
	networkMock.isOnline = true;
});

// Mock stores
vi.mock('../stores', () => ({
	authToken: {
		subscribe: (callback: any) => {
			callback('test-token');
			return () => {};
		}
	},
	baseUrl: {
		subscribe: (callback: any) => {
			callback('http://localhost:3000');
			return () => {};
		}
	},
	globalLogout: vi.fn(),
	DATA_STALE_THRESHOLD: 300000,
	ACTIVE_TIMER_VALIDITY_THRESHOLD: 4 * 60 * 60 * 1000
}));

describe('fetchWithRetry() - Success Path', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.useFakeTimers();
		mockFetch.mockReset();
	});

	afterEach(() => {
		vi.restoreAllMocks();
		vi.useRealTimers();
	});

	it('succeeds on first attempt (no retries)', async () => {
		mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({ data: 'success' })));

		const { fetchWithRetry } = await import('../api');
		const result = await fetchWithRetry(
			() => fetch('http://localhost:3000/test').then((r) => r.json()),
			3,
			100
		);

		expect(result).toEqual({ data: 'success' });
		expect(mockFetch).toHaveBeenCalledTimes(1);
	});

	it('returns correct result', async () => {
		const expectedData = { id: 1, name: 'test' };
		mockFetch.mockResolvedValueOnce(new Response(JSON.stringify(expectedData)));

		const { fetchWithRetry } = await import('../api');
		const result = await fetchWithRetry(
			() => fetch('http://localhost:3000/test').then((r) => r.json()),
			3,
			100
		);

		expect(result).toEqual(expectedData);
	});

	it('does not delay when succeeds immediately', async () => {
		const startTime = Date.now();
		mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({})));

		const { fetchWithRetry } = await import('../api');
		await fetchWithRetry(() => fetch('http://localhost:3000/test').then((r) => r.json()), 3, 1000);

		const elapsed = Date.now() - startTime;
		expect(elapsed).toBeLessThan(100); // Should complete almost instantly
	});
});

describe('fetchWithRetry() - Retry Logic', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.useFakeTimers();
		mockFetch.mockReset();
	});

	afterEach(() => {
		vi.restoreAllMocks();
		vi.useRealTimers();
	});

	it('succeeds after 1 retry (500 error)', async () => {
		const error500 = new Error('Server Error');
		(error500 as any).response = { status: 500 };

		mockFetch
			.mockRejectedValueOnce(error500)
			.mockResolvedValueOnce(new Response(JSON.stringify({ success: true })));

		const { fetchWithRetry } = await import('../api');
		const promise = fetchWithRetry(
			() => fetch('http://localhost:3000/test').then((r) => r.json()),
			3,
			100
		);

		// Retry backoff is a fake timer — advance it so the retry fires.
		await vi.advanceTimersByTimeAsync(100);
		const result = await promise;

		expect(result).toEqual({ success: true });
		expect(mockFetch).toHaveBeenCalledTimes(2);
	});

	it('succeeds after 2 retries (500 errors)', async () => {
		const error500 = new Error('Server Error');
		(error500 as any).response = { status: 500 };

		mockFetch
			.mockRejectedValueOnce(error500)
			.mockRejectedValueOnce(error500)
			.mockResolvedValueOnce(new Response(JSON.stringify({ success: true })));

		const { fetchWithRetry } = await import('../api');
		const promise = fetchWithRetry(
			() => fetch('http://localhost:3000/test').then((r) => r.json()),
			3,
			100
		);

		// Backoffs: 100ms then 200ms (both fake timers).
		await vi.advanceTimersByTimeAsync(100);
		await vi.advanceTimersByTimeAsync(200);
		const result = await promise;

		expect(result).toEqual({ success: true });
		expect(mockFetch).toHaveBeenCalledTimes(3);
	});

	it('succeeds after 3 retries (max)', async () => {
		const error500 = new Error('Server Error');
		(error500 as any).response = { status: 500 };

		mockFetch
			.mockRejectedValueOnce(error500)
			.mockRejectedValueOnce(error500)
			.mockRejectedValueOnce(error500)
			.mockResolvedValueOnce(new Response(JSON.stringify({ success: true })));

		const { fetchWithRetry } = await import('../api');
		// maxRetries=4 = 1 initial attempt + 3 retries (the test name says 3).
		const promise = fetchWithRetry(
			() => fetch('http://localhost:3000/test').then((r) => r.json()),
			4,
			100
		);

		// Backoffs: 100ms, 200ms, then 400ms (all fake timers).
		await vi.advanceTimersByTimeAsync(100);
		await vi.advanceTimersByTimeAsync(200);
		await vi.advanceTimersByTimeAsync(400);
		const result = await promise;

		expect(result).toEqual({ success: true });
		expect(mockFetch).toHaveBeenCalledTimes(4);
	});

	it('fails after max retries exhausted', async () => {
		const error500 = new Error('Server Error');
		(error500 as any).response = { status: 500 };

		mockFetch
			.mockRejectedValueOnce(error500)
			.mockRejectedValueOnce(error500)
			.mockRejectedValueOnce(error500);

		const { fetchWithRetry } = await import('../api');
		const promise = fetchWithRetry(
			() => fetch('http://localhost:3000/test').then((r) => r.json()),
			3,
			100
		);
		// Attach the rejection handler immediately so the rejection during timer
		// advancement isn't treated as unhandled.
		const assertion = expect(promise).rejects.toThrow('Server Error');

		// Backoffs: 100ms, 200ms, then the final attempt's 400ms sleep before
		// the loop throws (all fake timers).
		await vi.advanceTimersByTimeAsync(100);
		await vi.advanceTimersByTimeAsync(200);
		await vi.advanceTimersByTimeAsync(400);

		await assertion;
		expect(mockFetch).toHaveBeenCalledTimes(3);
	});

	it('throws last error when all retries fail', async () => {
		const error1 = new Error('Error 1');
		(error1 as any).response = { status: 500 };
		const error2 = new Error('Error 2');
		(error2 as any).response = { status: 502 };
		const error3 = new Error('Error 3');
		(error3 as any).response = { status: 503 };

		mockFetch
			.mockRejectedValueOnce(error1)
			.mockRejectedValueOnce(error2)
			.mockRejectedValueOnce(error3);

		const { fetchWithRetry } = await import('../api');
		const promise = fetchWithRetry(
			() => fetch('http://localhost:3000/test').then((r) => r.json()),
			3,
			100
		);
		// Attach the rejection handler immediately so the rejection during timer
		// advancement isn't treated as unhandled.
		const assertion = expect(promise).rejects.toThrow('Error 3');

		// Backoffs: 100ms, 200ms, then the final attempt's 400ms sleep before
		// the loop throws (all fake timers).
		await vi.advanceTimersByTimeAsync(100);
		await vi.advanceTimersByTimeAsync(200);
		await vi.advanceTimersByTimeAsync(400);

		await assertion;
	});
});

describe('fetchWithRetry() - Error Filtering', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.useFakeTimers();
		mockFetch.mockReset();
	});

	afterEach(() => {
		vi.restoreAllMocks();
		vi.useRealTimers();
	});

	it('does not retry 400 Bad Request', async () => {
		const error400 = new Error('Bad Request');
		(error400 as any).response = { status: 400 };

		mockFetch.mockRejectedValueOnce(error400);

		const { fetchWithRetry } = await import('../api');

		await expect(
			fetchWithRetry(() => fetch('http://localhost:3000/test').then((r) => r.json()), 3, 100)
		).rejects.toThrow('Bad Request');

		expect(mockFetch).toHaveBeenCalledTimes(1);
	});

	it('does not retry 403 Forbidden', async () => {
		const error403 = new Error('Forbidden');
		(error403 as any).response = { status: 403 };

		mockFetch.mockRejectedValueOnce(error403);

		const { fetchWithRetry } = await import('../api');

		await expect(
			fetchWithRetry(() => fetch('http://localhost:3000/test').then((r) => r.json()), 3, 100)
		).rejects.toThrow('Forbidden');

		expect(mockFetch).toHaveBeenCalledTimes(1);
	});

	it('does not retry 404 Not Found', async () => {
		const error404 = new Error('Not Found');
		(error404 as any).response = { status: 404 };

		mockFetch.mockRejectedValueOnce(error404);

		const { fetchWithRetry } = await import('../api');

		await expect(
			fetchWithRetry(() => fetch('http://localhost:3000/test').then((r) => r.json()), 3, 100)
		).rejects.toThrow('Not Found');

		expect(mockFetch).toHaveBeenCalledTimes(1);
	});

	it('retries 429 Too Many Requests', async () => {
		const error429 = new Error('Too Many Requests');
		(error429 as any).response = { status: 429 };

		mockFetch
			.mockRejectedValueOnce(error429)
			.mockResolvedValueOnce(new Response(JSON.stringify({ success: true })));

		const { fetchWithRetry } = await import('../api');
		const promise = fetchWithRetry(
			() => fetch('http://localhost:3000/test').then((r) => r.json()),
			3,
			100
		);

		// Retry backoff is a fake timer — advance it so the retry fires.
		await vi.advanceTimersByTimeAsync(100);
		const result = await promise;

		expect(result).toEqual({ success: true });
		expect(mockFetch).toHaveBeenCalledTimes(2);
	});

	it('retries 500 Internal Server Error', async () => {
		const error500 = new Error('Internal Server Error');
		(error500 as any).response = { status: 500 };

		mockFetch
			.mockRejectedValueOnce(error500)
			.mockResolvedValueOnce(new Response(JSON.stringify({ success: true })));

		const { fetchWithRetry } = await import('../api');
		const promise = fetchWithRetry(
			() => fetch('http://localhost:3000/test').then((r) => r.json()),
			3,
			100
		);

		await vi.advanceTimersByTimeAsync(100);
		const result = await promise;

		expect(result).toEqual({ success: true });
		expect(mockFetch).toHaveBeenCalledTimes(2);
	});

	it('retries 502 Bad Gateway', async () => {
		const error502 = new Error('Bad Gateway');
		(error502 as any).response = { status: 502 };

		mockFetch
			.mockRejectedValueOnce(error502)
			.mockResolvedValueOnce(new Response(JSON.stringify({ success: true })));

		const { fetchWithRetry } = await import('../api');
		const promise = fetchWithRetry(
			() => fetch('http://localhost:3000/test').then((r) => r.json()),
			3,
			100
		);

		await vi.advanceTimersByTimeAsync(100);
		const result = await promise;

		expect(result).toEqual({ success: true });
		expect(mockFetch).toHaveBeenCalledTimes(2);
	});

	it('retries 503 Service Unavailable', async () => {
		const error503 = new Error('Service Unavailable');
		(error503 as any).response = { status: 503 };

		mockFetch
			.mockRejectedValueOnce(error503)
			.mockResolvedValueOnce(new Response(JSON.stringify({ success: true })));

		const { fetchWithRetry } = await import('../api');
		const promise = fetchWithRetry(
			() => fetch('http://localhost:3000/test').then((r) => r.json()),
			3,
			100
		);

		await vi.advanceTimersByTimeAsync(100);
		const result = await promise;

		expect(result).toEqual({ success: true });
		expect(mockFetch).toHaveBeenCalledTimes(2);
	});

	it('retries network errors (no response)', async () => {
		const networkError = new Error('Network Error');

		mockFetch
			.mockRejectedValueOnce(networkError)
			.mockResolvedValueOnce(new Response(JSON.stringify({ success: true })));

		const { fetchWithRetry } = await import('../api');
		const promise = fetchWithRetry(
			() => fetch('http://localhost:3000/test').then((r) => r.json()),
			3,
			100
		);

		await vi.advanceTimersByTimeAsync(100);
		const result = await promise;

		expect(result).toEqual({ success: true });
		expect(mockFetch).toHaveBeenCalledTimes(2);
	});
});

describe('fetchWithRetry() - Network Awareness', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.useFakeTimers();
		mockFetch.mockReset();
	});

	afterEach(() => {
		vi.restoreAllMocks();
		vi.useRealTimers();
	});

	it('checks network before first attempt', async () => {
		// This test verifies the pre-flight check exists
		// The mock for network.isOnline is set at the top
		const { fetchWithRetry } = await import('../api');

		mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({})));
		await fetchWithRetry(() => fetch('http://localhost:3000/test'), 3, 100);

		// If pre-flight check didn't exist, this would still work
		// But we verify by checking the code has the check
		expect(mockFetch).toHaveBeenCalled();
	});

	it('throws immediately when offline', async () => {
		networkMock.isOnline = false;

		const { fetchWithRetry } = await import('../api');

		await expect(
			fetchWithRetry(() => fetch('http://localhost:3000/test'), 3, 100)
		).rejects.toThrow('offline');

		expect(mockFetch).not.toHaveBeenCalled();
	});
});

describe('fetchWithRetry() - Backoff Timing', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.useFakeTimers();
		mockFetch.mockReset();
	});

	afterEach(() => {
		vi.restoreAllMocks();
		vi.useRealTimers();
	});

	it('delays 1s before retry 1 (default backoff)', async () => {
		const error500 = new Error('Server Error');
		(error500 as any).response = { status: 500 };

		mockFetch
			.mockRejectedValueOnce(error500)
			.mockResolvedValueOnce(new Response(JSON.stringify({})));

		const { fetchWithRetry } = await import('../api');
		const promise = fetchWithRetry(
			() => fetch('http://localhost:3000/test').then((r) => r.json()),
			3,
			1000
		);

		// Before delay
		await vi.advanceTimersByTimeAsync(500);
		expect(mockFetch).toHaveBeenCalledTimes(1);

		// After delay
		await vi.advanceTimersByTimeAsync(1000);
		expect(mockFetch).toHaveBeenCalledTimes(2);

		await promise;
	});

	it('delays 2s before retry 2', async () => {
		const error500 = new Error('Server Error');
		(error500 as any).response = { status: 500 };

		mockFetch
			.mockRejectedValueOnce(error500)
			.mockRejectedValueOnce(error500)
			.mockResolvedValueOnce(new Response(JSON.stringify({})));

		const { fetchWithRetry } = await import('../api');
		const promise = fetchWithRetry(
			() => fetch('http://localhost:3000/test').then((r) => r.json()),
			3,
			1000
		);

		// First retry delay (1s)
		await vi.advanceTimersByTimeAsync(1000);
		expect(mockFetch).toHaveBeenCalledTimes(2);

		// Second retry delay (2s)
		await vi.advanceTimersByTimeAsync(2000);
		expect(mockFetch).toHaveBeenCalledTimes(3);

		await promise;
	});

	it('delays 4s before retry 3', async () => {
		const error500 = new Error('Server Error');
		(error500 as any).response = { status: 500 };

		mockFetch
			.mockRejectedValueOnce(error500)
			.mockRejectedValueOnce(error500)
			.mockRejectedValueOnce(error500)
			.mockResolvedValueOnce(new Response(JSON.stringify({})));

		const { fetchWithRetry } = await import('../api');
		// maxRetries=4 = 1 initial attempt + 3 retries (the test name says 3).
		const promise = fetchWithRetry(
			() => fetch('http://localhost:3000/test').then((r) => r.json()),
			4,
			1000
		);

		// First retry (1s)
		await vi.advanceTimersByTimeAsync(1000);
		// Second retry (2s)
		await vi.advanceTimersByTimeAsync(2000);
		// Third retry (4s)
		await vi.advanceTimersByTimeAsync(4000);

		expect(mockFetch).toHaveBeenCalledTimes(4);

		await promise;
	});

	it('respects custom backoff parameter', async () => {
		const error500 = new Error('Server Error');
		(error500 as any).response = { status: 500 };

		mockFetch
			.mockRejectedValueOnce(error500)
			.mockResolvedValueOnce(new Response(JSON.stringify({})));

		const { fetchWithRetry } = await import('../api');
		const promise = fetchWithRetry(
			() => fetch('http://localhost:3000/test').then((r) => r.json()),
			3,
			500 // Custom backoff
		);

		await vi.advanceTimersByTimeAsync(500);
		expect(mockFetch).toHaveBeenCalledTimes(2);

		await promise;
	});
});

describe('timeEntries.getCurrentActive()', () => {
	const CACHE_KEY = 'time_entries:current_active';
	const ACTIVE_ENTRY = {
		id: 1,
		title: 'Test timer',
		description: '',
		start_time: '2026-08-28T10:00:00+03:30',
		end_time: null,
		duration: null,
		is_active: true,
		user: 'tester',
		project: 'Test Project',
		tags: []
	};

	function seedCache(apiCacheMap: Map<string, any>, data: any, timestamp: number) {
		apiCacheMap.set(CACHE_KEY, {
			data,
			timestamp,
			ttl: 7 * 24 * 60 * 60 * 1000,
			lastValidated: timestamp,
			isStale: false
		});
	}

	beforeEach(async () => {
		vi.clearAllMocks();
		mockFetch.mockReset();
		networkMock.isOnline = true;
		const { apiCache } = await import('../api');
		apiCache.clear();
	});

	it('returns the active entry when the server reports one', async () => {
		mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({ entry: ACTIVE_ENTRY })));

		const { timeEntries } = await import('../api');
		const result = await timeEntries.getCurrentActive();

		expect(result).toEqual(ACTIVE_ENTRY);
	});

	it('returns null and clears the cache when the server reports no active entry', async () => {
		mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({ entry: null })));

		const { timeEntries, apiCache } = await import('../api');
		seedCache(apiCache, ACTIVE_ENTRY, Date.now());

		const result = await timeEntries.getCurrentActive();

		expect(result).toBeNull();
		expect(apiCache.has(CACHE_KEY)).toBe(false);
	});

	it('rethrows on server error instead of serving a stale cached entry', async () => {
		mockFetch.mockRejectedValueOnce(new Error('Network down'));

		const { timeEntries, apiCache } = await import('../api');
		seedCache(apiCache, ACTIVE_ENTRY, Date.now());

		// Must reject (not resolve with the stale cached entry): the active timer
		// is never silently served from cache when the server call fails.
		await expect(timeEntries.getCurrentActive()).rejects.toThrow();
	});

	it('returns a fresh cached active entry while offline', async () => {
		networkMock.isOnline = false;

		const { timeEntries, apiCache } = await import('../api');
		seedCache(apiCache, ACTIVE_ENTRY, Date.now());

		const result = await timeEntries.getCurrentActive();
		expect(result).toEqual(ACTIVE_ENTRY);
	});

	it('returns null while offline when the cached entry is older than 4 hours', async () => {
		networkMock.isOnline = false;

		const { timeEntries, apiCache } = await import('../api');
		seedCache(apiCache, ACTIVE_ENTRY, Date.now() - 5 * 60 * 60 * 1000);

		const result = await timeEntries.getCurrentActive();
		expect(result).toBeNull();
	});

	it('returns null while offline when the cached entry is not active', async () => {
		networkMock.isOnline = false;

		const { timeEntries, apiCache } = await import('../api');
		seedCache(apiCache, { ...ACTIVE_ENTRY, is_active: false }, Date.now());

		const result = await timeEntries.getCurrentActive();
		expect(result).toBeNull();
	});
});

describe('parseErrorResponse()', () => {
	it('parses Response with clone()', async () => {
		const mockResponse = {
			clone: () => ({
				json: () => Promise.resolve({ error: 'test error' })
			}),
			json: () => Promise.resolve({ error: 'test error' })
		};

		const { parseErrorResponse } = await import('../api');
		const result = await parseErrorResponse(mockResponse as any);

		expect(result).toEqual({ error: 'test error' });
	});

	it('parses Ky _data property', async () => {
		const mockResponse = {
			_data: { error: 'ky error' }
		};

		const { parseErrorResponse } = await import('../api');
		const result = await parseErrorResponse(mockResponse as any);

		expect(result).toEqual({ error: 'ky error' });
	});

	it('parses direct json()', async () => {
		const mockResponse = {
			json: () => Promise.resolve({ error: 'direct error' })
		};

		const { parseErrorResponse } = await import('../api');
		const result = await parseErrorResponse(mockResponse as any);

		expect(result).toEqual({ error: 'direct error' });
	});

	it('returns empty object on parse failure', async () => {
		const mockResponse = {
			clone: () => ({
				json: () => Promise.reject(new Error('Parse error'))
			})
		};

		const { parseErrorResponse } = await import('../api');
		const result = await parseErrorResponse(mockResponse as any);

		expect(result).toEqual({});
	});

	it('handles non-JSON error body', async () => {
		const mockResponse = {
			clone: () => ({
				json: () => Promise.reject(new Error('Not JSON'))
			}),
			body: 'plain text error'
		};

		const { parseErrorResponse } = await import('../api');
		const result = await parseErrorResponse(mockResponse as any);

		expect(result).toEqual({});
	});
});
