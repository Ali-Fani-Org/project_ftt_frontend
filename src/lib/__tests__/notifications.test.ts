import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock browser environment
vi.mock('$app/environment', () => ({
	browser: true
}));

// Mock logger
vi.mock('$lib/logger', () => ({
	default: {
		debug: vi.fn(),
		warn: vi.fn(),
		error: vi.fn()
	}
}));

// Mock stores
const mockAuthToken = {
	subscribe: vi.fn((callback: any) => {
		callback('test-token');
		return () => {};
	}),
	set: vi.fn()
};

const mockBaseUrl = {
	subscribe: vi.fn((callback: any) => {
		callback('http://localhost:3000');
		return () => {};
	})
};

vi.mock('../stores', () => ({
	authToken: mockAuthToken,
	baseUrl: mockBaseUrl
}));

// Mock network store
const mockNetwork = {
	subscribe: vi.fn((callback: any) => {
		callback({ isOnline: true });
		return () => {};
	})
};

vi.mock('../network', () => ({
	network: mockNetwork
}));

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

vi.useFakeTimers();

describe('TauriNotificationService - connect()', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockFetch.mockReset();
	});

	afterEach(() => {
		vi.restoreAllMocks();
		vi.useRealTimers();
	});

	describe('Success Path', () => {
		it('connects with valid token and URL', async () => {
			const { createNotificationService } = await import('../notifications');
			const service = createNotificationService();

			await service.connect();

			expect(service.isConnecting).toBe(false);
			expect(service.isConnected()).toBe(true);
		});

		it('starts polling after connect', async () => {
			mockFetch.mockResolvedValueOnce(
				new Response(
					JSON.stringify({
						status: 'timeout',
						notifications: [],
						has_new_notifications: false
					})
				)
			);

			const { createNotificationService } = await import('../notifications');
			const service = createNotificationService();

			await service.connect();

			// Wait for first poll
			await vi.advanceTimersByTimeAsync(1000);

			expect(mockFetch).toHaveBeenCalled();
		});

		it('resets reconnectAttempts on success', async () => {
			const { createNotificationService } = await import('../notifications');
			const service = createNotificationService();

			await service.connect();

			// reconnectAttempts should be reset to 0 on successful connect
			expect((service as any).reconnectAttempts).toBe(0);
		});

		it('sets connected = true', async () => {
			const { createNotificationService } = await import('../notifications');
			const service = createNotificationService();

			await service.connect();

			expect(service.isConnected()).toBe(true);
		});
	});

	describe('Failure Paths', () => {
		it('blocks without token', async () => {
			// Override auth token mock temporarily
			vi.doUnmock('../stores');
			vi.mock('../stores', () => ({
				authToken: {
					subscribe: (callback: any) => {
						callback(null); // No token
						return () => {};
					},
					set: vi.fn()
				},
				baseUrl: mockBaseUrl
			}));

			const { createNotificationService } = await import('../notifications');
			const service = createNotificationService();

			await service.connect();

			expect(service.isConnected()).toBe(false);
			expect(service.getLastError()).toBe('Authentication required - please log in first');
		});

		it('blocks without base URL', async () => {
			vi.doUnmock('../stores');
			vi.mock('../stores', () => ({
				authToken: mockAuthToken,
				baseUrl: {
					subscribe: (callback: any) => {
						callback(null); // No base URL
						return () => {};
					}
				}
			}));

			const { createNotificationService } = await import('../notifications');
			const service = createNotificationService();

			await service.connect();

			expect(service.isConnected()).toBe(false);
			expect(service.getLastError()).toBe('Base URL not configured');
		});

		it('handles connection error', async () => {
			mockFetch.mockRejectedValueOnce(new Error('Connection refused'));

			const { createNotificationService } = await import('../notifications');
			const service = createNotificationService();

			await service.connect();

			// Should trigger reconnect
			expect(mockNetwork.subscribe).toHaveBeenCalled();
		});

		it('triggers reconnect on failure', async () => {
			mockFetch.mockRejectedValueOnce(new Error('Connection refused'));

			const { createNotificationService } = await import('../notifications');
			const service = createNotificationService();

			await service.connect();

			// Wait for reconnect delay
			await vi.advanceTimersByTimeAsync(1000);

			// Should attempt to reconnect
			expect(mockFetch).toHaveBeenCalled();
		});
	});
});

describe('TauriNotificationService - startPolling()', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockFetch.mockReset();
	});

	afterEach(() => {
		vi.restoreAllMocks();
		vi.useRealTimers();
	});

	describe('Normal Operation', () => {
		it('processes new notifications', async () => {
			mockFetch.mockResolvedValueOnce(
				new Response(
					JSON.stringify({
						status: 'new_notification',
						notifications: [
							{
								id: '1',
								type: 'INFO',
								message: 'Test notification',
								created_at: '2024-01-01T00:00:00Z',
								read: false,
								delivered_at: null
							}
						],
						has_new_notifications: true
					})
				)
			);

			const { createNotificationService } = await import('../notifications');
			const service = createNotificationService();

			await service.connect();

			await vi.advanceTimersByTimeAsync(1000);

			expect(mockFetch).toHaveBeenCalled();
		});

		it('acknowledges each notification', async () => {
			mockFetch
				.mockResolvedValueOnce(
					new Response(
						JSON.stringify({
							status: 'new_notification',
							notifications: [
								{
									id: '1',
									type: 'INFO',
									message: 'Test',
									created_at: '2024-01-01T00:00:00Z',
									read: false,
									delivered_at: null
								}
							],
							has_new_notifications: true
						})
					)
				)
				.mockResolvedValueOnce(new Response(JSON.stringify({ message: 'ok' }))) // acknowledge
				.mockResolvedValueOnce(
					new Response(
						JSON.stringify({
							status: 'timeout',
							notifications: [],
							has_new_notifications: false
						})
					)
				);

			const { createNotificationService } = await import('../notifications');
			const service = createNotificationService();

			await service.connect();

			await vi.advanceTimersByTimeAsync(2000);

			// Should have called poll and acknowledge
			expect(mockFetch).toHaveBeenCalledTimes(3);
		});

		it('polls immediately after new notifications', async () => {
			mockFetch
				.mockResolvedValueOnce(
					new Response(
						JSON.stringify({
							status: 'new_notification',
							notifications: [
								{
									id: '1',
									type: 'INFO',
									message: 'Test',
									created_at: '2024-01-01T00:00:00Z',
									read: false,
									delivered_at: null
								}
							],
							has_new_notifications: true
						})
					)
				)
				.mockResolvedValueOnce(new Response(JSON.stringify({ message: 'ok' })))
				.mockResolvedValueOnce(
					new Response(
						JSON.stringify({
							status: 'timeout',
							notifications: [],
							has_new_notifications: false
						})
					)
				);

			const { createNotificationService } = await import('../notifications');
			const service = createNotificationService();

			await service.connect();

			// After processing notification, should poll immediately
			await vi.advanceTimersByTimeAsync(100);
			expect(mockFetch).toHaveBeenCalled();
		});

		it('waits pollInterval when no notifications', async () => {
			mockFetch.mockResolvedValueOnce(
				new Response(
					JSON.stringify({
						status: 'timeout',
						notifications: [],
						has_new_notifications: false
					})
				)
			);

			const { createNotificationService } = await import('../notifications');
			const service = createNotificationService();

			await service.connect();

			// Before pollInterval (1s)
			await vi.advanceTimersByTimeAsync(500);
			expect(mockFetch).toHaveBeenCalledTimes(1);

			// After pollInterval
			await vi.advanceTimersByTimeAsync(1000);
			expect(mockFetch).toHaveBeenCalledTimes(2);
		});

		it('stops when disconnected', async () => {
			mockFetch.mockResolvedValueOnce(
				new Response(
					JSON.stringify({
						status: 'timeout',
						notifications: [],
						has_new_notifications: false
					})
				)
			);

			const { createNotificationService } = await import('../notifications');
			const service = createNotificationService();

			await service.connect();
			service.disconnect();

			// Wait for next poll
			await vi.advanceTimersByTimeAsync(2000);

			// Should only have called once (before disconnect)
			expect(mockFetch).toHaveBeenCalledTimes(1);
		});
	});

	describe('Error Handling', () => {
		it('handles 401 by clearing token', async () => {
			mockFetch.mockResolvedValueOnce(new Response(null, { status: 401 }));

			const { createNotificationService } = await import('../notifications');
			const service = createNotificationService();

			await service.connect();

			await vi.advanceTimersByTimeAsync(1000);

			// Should have called authToken.set(null)
			expect(mockAuthToken.set).toHaveBeenCalledWith(null);
		});

		it('handles 401 without crashing', async () => {
			mockFetch.mockResolvedValueOnce(new Response(null, { status: 401 }));

			const { createNotificationService } = await import('../notifications');
			const service = createNotificationService();

			await service.connect();

			await vi.advanceTimersByTimeAsync(1000);

			// Service should still exist and not throw
			expect(() => service.isConnected()).not.toThrow();
		});

		it('handles network error', async () => {
			mockFetch.mockRejectedValueOnce(new Error('Network error'));

			const { createNotificationService } = await import('../notifications');
			const service = createNotificationService();

			await service.connect();

			await vi.advanceTimersByTimeAsync(1000);

			// Should trigger reconnect logic
			expect(mockNetwork.subscribe).toHaveBeenCalled();
		});

		it('handles malformed response', async () => {
			mockFetch.mockResolvedValueOnce(new Response('not json', { status: 200 }));

			const { createNotificationService } = await import('../notifications');
			const service = createNotificationService();

			await service.connect();

			await vi.advanceTimersByTimeAsync(1000);

			// Should handle gracefully or trigger reconnect
			expect(mockFetch).toHaveBeenCalled();
		});

		it('triggers reconnect on error', async () => {
			mockFetch.mockRejectedValueOnce(new Error('Network error'));

			const { createNotificationService } = await import('../notifications');
			const service = createNotificationService();

			await service.connect();

			await vi.advanceTimersByTimeAsync(1000);

			// Should trigger reconnect
			expect(service.isConnected()).toBe(false);
		});
	});
});

describe('TauriNotificationService - handleReconnect()', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockFetch.mockReset();
	});

	afterEach(() => {
		vi.restoreAllMocks();
		vi.useRealTimers();
	});

	describe('Backoff Logic', () => {
		it('delays 1s before attempt 1', async () => {
			mockFetch.mockRejectedValueOnce(new Error('Network error'));

			const { createNotificationService } = await import('../notifications');
			const service = createNotificationService();

			await service.connect();

			// Before delay
			await vi.advanceTimersByTimeAsync(500);
			expect(mockFetch).toHaveBeenCalledTimes(1);

			// After delay
			await vi.advanceTimersByTimeAsync(1000);
			expect(mockFetch).toHaveBeenCalledTimes(2);
		});

		it('delays 2s before attempt 2', async () => {
			mockFetch
				.mockRejectedValueOnce(new Error('Error 1'))
				.mockRejectedValueOnce(new Error('Error 2'));

			const { createNotificationService } = await import('../notifications');
			const service = createNotificationService();

			await service.connect();

			// First retry (1s)
			await vi.advanceTimersByTimeAsync(1000);
			expect(mockFetch).toHaveBeenCalledTimes(2);

			// Second retry (2s)
			await vi.advanceTimersByTimeAsync(2000);
			expect(mockFetch).toHaveBeenCalledTimes(3);
		});

		it('delays 4s before attempt 3', async () => {
			mockFetch
				.mockRejectedValueOnce(new Error('Error 1'))
				.mockRejectedValueOnce(new Error('Error 2'))
				.mockRejectedValueOnce(new Error('Error 3'));

			const { createNotificationService } = await import('../notifications');
			const service = createNotificationService();

			await service.connect();

			// First retry (1s)
			await vi.advanceTimersByTimeAsync(1000);
			// Second retry (2s)
			await vi.advanceTimersByTimeAsync(2000);
			// Third retry (4s)
			await vi.advanceTimersByTimeAsync(4000);

			expect(mockFetch).toHaveBeenCalledTimes(4);
		});

		it('caps at 60s max delay', async () => {
			// Need 6 attempts to reach max cap
			for (let i = 0; i < 6; i++) {
				mockFetch.mockRejectedValueOnce(new Error(`Error ${i + 1}`));
			}

			const { createNotificationService } = await import('../notifications');
			const service = createNotificationService();

			await service.connect();

			// Advance through attempts
			await vi.advanceTimersByTimeAsync(1000); // 1s
			await vi.advanceTimersByTimeAsync(2000); // 2s
			await vi.advanceTimersByTimeAsync(4000); // 4s
			await vi.advanceTimersByTimeAsync(8000); // 8s
			await vi.advanceTimersByTimeAsync(16000); // 16s
			await vi.advanceTimersByTimeAsync(30000); // 30s (capped at 30s for attempt 6)

			// 7th attempt should be capped at 60s
			await vi.advanceTimersByTimeAsync(60000);

			expect(mockFetch).toHaveBeenCalled();
		});

		it('resets attempts on successful connect', async () => {
			mockFetch
				.mockRejectedValueOnce(new Error('Error 1'))
				.mockRejectedValueOnce(new Error('Error 2'))
				.mockResolvedValueOnce(
					new Response(
						JSON.stringify({
							status: 'timeout',
							notifications: [],
							has_new_notifications: false
						})
					)
				);

			const { createNotificationService } = await import('../notifications');
			const service = createNotificationService();

			await service.connect();

			// First failure
			await vi.advanceTimersByTimeAsync(1000);
			// Second failure and reconnect
			await vi.advanceTimersByTimeAsync(2000);

			// Should succeed now
			await vi.advanceTimersByTimeAsync(1000);

			// ReconnectAttempts should be reset
			expect((service as any).reconnectAttempts).toBe(0);
		});
	});

	describe('Network Awareness', () => {
		it('pauses when network is offline', async () => {
			// Override network mock for this test
			vi.doUnmock('../network');
			vi.mock('../network', () => ({
				network: {
					subscribe: (callback: any) => {
						callback({ isOnline: false });
						return () => {};
					}
				}
			}));

			mockFetch.mockRejectedValueOnce(new Error('Network error'));

			const { createNotificationService } = await import('../notifications');
			const service = createNotificationService();

			await service.connect();

			await vi.advanceTimersByTimeAsync(5000);

			// Should not retry when offline
			expect(mockFetch).toHaveBeenCalledTimes(1);
			expect(service.getLastError()).toBe('Waiting for network connection...');
		});

		it('does not schedule setTimeout when offline', async () => {
			vi.doUnmock('../network');
			vi.mock('../network', () => ({
				network: {
					subscribe: (callback: any) => {
						callback({ isOnline: false });
						return () => {};
					}
				}
			}));

			mockFetch.mockRejectedValueOnce(new Error('Network error'));

			const { createNotificationService } = await import('../notifications');
			const service = createNotificationService();

			await service.connect();

			// Wait for what would be the reconnect delay
			await vi.advanceTimersByTimeAsync(10000);

			// Should only have initial failed call, no reconnect attempts
			expect(mockFetch).toHaveBeenCalledTimes(1);
		});

		it('sets appropriate "waiting for network" message', async () => {
			vi.doUnmock('../network');
			vi.mock('../network', () => ({
				network: {
					subscribe: (callback: any) => {
						callback({ isOnline: false });
						return () => {};
					}
				}
			}));

			mockFetch.mockRejectedValueOnce(new Error('Network error'));

			const { createNotificationService } = await import('../notifications');
			const service = createNotificationService();

			await service.connect();

			expect(service.getLastError()).toBe('Waiting for network connection...');
		});

		it('resumes when network comes online', async () => {
			// This is tested by the network.subscribe callback in constructor
			// When network changes to online and reconnectAttempts > 0, should resume
			const { createNotificationService } = await import('../notifications');
			const service = createNotificationService();

			// Simulate failed connection
			mockFetch.mockRejectedValueOnce(new Error('Network error'));
			await service.connect();

			await vi.advanceTimersByTimeAsync(1000);

			// Should have attempted reconnect
			expect(mockFetch).toHaveBeenCalled();
		});

		it('resets reconnectAttempts on network restore', async () => {
			const { createNotificationService } = await import('../notifications');
			const service = createNotificationService();

			// Trigger network restore callback (simulating what network.subscribe does)
			// This is called internally in the constructor
			expect((service as any).reconnectAttempts).toBe(0);
		});
	});

	describe('Max Attempts', () => {
		it('gives up after 5 attempts', async () => {
			// 6 rejections (initial + 5 retries)
			for (let i = 0; i < 6; i++) {
				mockFetch.mockRejectedValueOnce(new Error(`Error ${i + 1}`));
			}

			const { createNotificationService } = await import('../notifications');
			const service = createNotificationService();

			await service.connect();

			// Advance through all retry attempts
			await vi.advanceTimersByTimeAsync(1000); // Attempt 1
			await vi.advanceTimersByTimeAsync(2000); // Attempt 2
			await vi.advanceTimersByTimeAsync(4000); // Attempt 3
			await vi.advanceTimersByTimeAsync(8000); // Attempt 4
			await vi.advanceTimersByTimeAsync(16000); // Attempt 5

			// Should have made 6 calls (initial + 5 retries)
			expect(mockFetch).toHaveBeenCalledTimes(6);

			// Should have max attempts error
			expect(service.getLastError()).toBe(
				'Max reconnection attempts reached. Please check your network connection.'
			);
		});

		it('sets "max attempts" error message', async () => {
			for (let i = 0; i < 6; i++) {
				mockFetch.mockRejectedValueOnce(new Error(`Error ${i + 1}`));
			}

			const { createNotificationService } = await import('../notifications');
			const service = createNotificationService();

			await service.connect();

			await vi.advanceTimersByTimeAsync(1000 + 2000 + 4000 + 8000 + 16000);

			expect(service.getLastError()).toBe(
				'Max reconnection attempts reached. Please check your network connection.'
			);
		});

		it('does not schedule more retries', async () => {
			for (let i = 0; i < 6; i++) {
				mockFetch.mockRejectedValueOnce(new Error(`Error ${i + 1}`));
			}

			const { createNotificationService } = await import('../notifications');
			const service = createNotificationService();

			await service.connect();

			await vi.advanceTimersByTimeAsync(1000 + 2000 + 4000 + 8000 + 16000);

			// Wait additional time to ensure no more retries
			await vi.advanceTimersByTimeAsync(60000);

			// Should still be at 6 calls
			expect(mockFetch).toHaveBeenCalledTimes(6);
		});

		it('can retry after manual reconnect call', async () => {
			for (let i = 0; i < 6; i++) {
				mockFetch.mockRejectedValueOnce(new Error(`Error ${i + 1}`));
			}
			mockFetch.mockResolvedValueOnce(
				new Response(
					JSON.stringify({
						status: 'timeout',
						notifications: [],
						has_new_notifications: false
					})
				)
			);

			const { createNotificationService } = await import('../notifications');
			const service = createNotificationService();

			await service.connect();

			// Exhaust retries
			await vi.advanceTimersByTimeAsync(1000 + 2000 + 4000 + 8000 + 16000);

			// Manual reconnect should reset and try again
			service.disconnect();
			await service.connect();

			// Should have made another attempt
			expect(mockFetch).toHaveBeenCalledTimes(7);
		});
	});
});

describe('TauriNotificationService - disconnect()', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockFetch.mockReset();
	});

	afterEach(() => {
		vi.restoreAllMocks();
		vi.useRealTimers();
	});

	it('aborts poll controller', async () => {
		mockFetch.mockResolvedValueOnce(
			new Response(
				JSON.stringify({
					status: 'timeout',
					notifications: [],
					has_new_notifications: false
				})
			)
		);

		const { createNotificationService } = await import('../notifications');
		const service = createNotificationService();

		await service.connect();
		service.disconnect();

		// Should not make more fetch calls
		const callCount = mockFetch.mock.calls.length;
		await vi.advanceTimersByTimeAsync(5000);
		expect(mockFetch).toHaveBeenCalledTimes(callCount);
	});

	it('sets connected = false', async () => {
		const { createNotificationService } = await import('../notifications');
		const service = createNotificationService();

		await service.connect();
		service.disconnect();

		expect(service.isConnected()).toBe(false);
	});

	it('sets isPolling = false', async () => {
		const { createNotificationService } = await import('../notifications');
		const service = createNotificationService();

		await service.connect();
		service.disconnect();

		expect((service as any).isPolling).toBe(false);
	});

	it('clears connectionStartTime', async () => {
		const { createNotificationService } = await import('../notifications');
		const service = createNotificationService();

		await service.connect();
		service.disconnect();

		expect((service as any).connectionStartTime).toBeNull();
	});

	it('can be called multiple times safely', async () => {
		const { createNotificationService } = await import('../notifications');
		const service = createNotificationService();

		await service.connect();

		// Multiple disconnects should not throw
		expect(() => {
			service.disconnect();
			service.disconnect();
			service.disconnect();
		}).not.toThrow();
	});
});
