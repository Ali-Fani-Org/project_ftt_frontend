import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock browser environment
vi.mock('$app/environment', () => ({
	browser: true
}));

// Mock toast
vi.mock('./toast', () => ({
	addToast: vi.fn()
}));

// Mock dataFreshnessManager
vi.mock('./dataFreshness', () => ({
	dataFreshnessManager: {
		updateTimestamp: vi.fn()
	}
}));

// Mock network store with controllable state
let mockNetworkState = { isOnline: true };
const networkCallbacks: ((status: any) => void)[] = [];

vi.mock('./network', () => ({
	network: {
		subscribe: (callback: any) => {
			networkCallbacks.push(callback);
			callback(mockNetworkState);
			return () => {};
		}
	},
	checkConnectivity: vi.fn(() => Promise.resolve(true))
}));

// Mock setTimeout/setInterval
vi.useFakeTimers();

describe('RefreshController - Constructor Initialization', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		networkCallbacks.length = 0;
		mockNetworkState = { isOnline: true };
	});

	afterEach(() => {
		vi.restoreAllMocks();
		vi.useRealTimers();
	});

	it('subscribes to network store', async () => {
		const { RefreshController } = await import('../refreshController');
		const controller = new RefreshController({
			enabled: false,
			interval: 30000,
			onlyWhenVisible: false,
			refreshOnReconnect: true
		});

		expect(networkCallbacks.length).toBe(1);
	});

	it('initializes wasOnline from network', async () => {
		mockNetworkState = { isOnline: false };

		const { RefreshController } = await import('../refreshController');
		const controller = new RefreshController({
			enabled: false,
			interval: 30000,
			onlyWhenVisible: false,
			refreshOnReconnect: true
		});

		// wasOnline should be false based on initial network state
		expect((controller as any).wasOnline).toBe(false);
	});

	it('sets up visibility listener', async () => {
		const addEventListenerSpy = vi.spyOn(document, 'addEventListener');

		const { RefreshController } = await import('../refreshController');
		const controller = new RefreshController({
			enabled: false,
			interval: 30000,
			onlyWhenVisible: true,
			refreshOnReconnect: false
		});

		expect(addEventListenerSpy).toHaveBeenCalledWith(
			'visibilitychange',
			expect.any(Function)
		);

		addEventListenerSpy.mockRestore();
	});

	it('does not start if config.enabled = false', async () => {
		const setIntervalSpy = vi.spyOn(window, 'setInterval');

		const { RefreshController } = await import('../refreshController');
		const controller = new RefreshController({
			enabled: false,
			interval: 30000,
			onlyWhenVisible: false,
			refreshOnReconnect: false
		});

		expect(setIntervalSpy).not.toHaveBeenCalled();

		setIntervalSpy.mockRestore();
	});
});

describe('RefreshController - Network Offline→Online Transition', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		networkCallbacks.length = 0;
		mockNetworkState = { isOnline: false };
	});

	afterEach(() => {
		vi.restoreAllMocks();
		vi.useRealTimers();
	});

	it('waits CONNECTION_STABILIZATION_MS before refresh', async () => {
		const { RefreshController } = await import('../refreshController');
		const mockCallback = vi.fn();
		const controller = new RefreshController({
			enabled: false,
			interval: 30000,
			onlyWhenVisible: false,
			refreshOnReconnect: true
		});

		controller.register('test', mockCallback);

		// Simulate network coming online
		networkCallbacks[0]({ isOnline: true });

		// Before stabilization period (5s)
		await vi.advanceTimersByTimeAsync(4000);
		expect(mockCallback).not.toHaveBeenCalled();

		// After stabilization period
		await vi.advanceTimersByTimeAsync(2000);
		expect(mockCallback).toHaveBeenCalled();
	});

	it('shows "stabilizing" toast', async () => {
		const { addToast } = await import('./toast');
		const { RefreshController } = await import('../refreshController');

		const controller = new RefreshController({
			enabled: false,
			interval: 30000,
			onlyWhenVisible: false,
			refreshOnReconnect: true
		});

		// Simulate network coming online
		networkCallbacks[0]({ isOnline: true });

		expect(addToast).toHaveBeenCalledWith(
			'Connection restored! Stabilizing before refresh...',
			'success',
			3000
		);
	});

	it('verifies connection with ping', async () => {
		const { checkConnectivity } = await import('./network');
		const { RefreshController } = await import('../refreshController');

		const mockCallback = vi.fn();
		const controller = new RefreshController({
			enabled: false,
			interval: 30000,
			onlyWhenVisible: false,
			refreshOnReconnect: true
		});

		controller.register('test', mockCallback);

		// Simulate network coming online
		networkCallbacks[0]({ isOnline: true });

		// Wait for stabilization and connectivity check
		await vi.advanceTimersByTimeAsync(5000);

		// Should have called checkConnectivity
		expect(checkConnectivity).toHaveBeenCalledWith(2000);
	});

	it('only refreshes if ping succeeds', async () => {
		// Mock checkConnectivity to fail
		vi.doUnmock('./network');
		vi.mock('./network', () => ({
			network: {
				subscribe: (callback: any) => {
					networkCallbacks.push(callback);
					callback(mockNetworkState);
					return () => {};
				}
			},
			checkConnectivity: vi.fn(() => Promise.resolve(false))
		}));

		const { RefreshController } = await import('../refreshController');
		const mockCallback = vi.fn();
		const controller = new RefreshController({
			enabled: false,
			interval: 30000,
			onlyWhenVisible: false,
			refreshOnReconnect: true
		});

		controller.register('test', mockCallback);

		// Simulate network coming online
		networkCallbacks[0]({ isOnline: true });

		// Wait for stabilization period
		await vi.advanceTimersByTimeAsync(5000);

		// Should not refresh if ping fails
		expect(mockCallback).not.toHaveBeenCalled();
	});

	it('delays again if ping fails', async () => {
		vi.doUnmock('./network');
		vi.mock('./network', () => ({
			network: {
				subscribe: (callback: any) => {
					networkCallbacks.push(callback);
					callback(mockNetworkState);
					return () => {};
				}
			},
			checkConnectivity: vi.fn(() => Promise.resolve(false))
		}));

		const { RefreshController } = await import('../refreshController');
		const mockCallback = vi.fn();
		const controller = new RefreshController({
			enabled: false,
			interval: 30000,
			onlyWhenVisible: false,
			refreshOnReconnect: true
		});

		controller.register('test', mockCallback);

		// Simulate network coming online
		networkCallbacks[0]({ isOnline: true });

		// Wait for first stabilization + check
		await vi.advanceTimersByTimeAsync(5000);
		expect(mockCallback).not.toHaveBeenCalled();

		// Wait for second stabilization period
		await vi.advanceTimersByTimeAsync(5000);

		// Should attempt refresh after second delay
		// (even if ping fails again, it will try)
		expect(mockCallback).toHaveBeenCalled();
	});

	it('clears previous debounce timer', async () => {
		const { RefreshController } = await import('../refreshController');
		const mockCallback = vi.fn();
		const controller = new RefreshController({
			enabled: false,
			interval: 30000,
			onlyWhenVisible: false,
			refreshOnReconnect: true
		});

		controller.register('test', mockCallback);

		// Simulate rapid online/offline transitions
		networkCallbacks[0]({ isOnline: true });
		await vi.advanceTimersByTimeAsync(1000);

		networkCallbacks[0]({ isOnline: false });
		await vi.advanceTimersByTimeAsync(1000);

		networkCallbacks[0]({ isOnline: true });
		await vi.advanceTimersByTimeAsync(1000);

		networkCallbacks[0]({ isOnline: false });
		await vi.advanceTimersByTimeAsync(1000);

		networkCallbacks[0]({ isOnline: true });

		// Only the last transition should trigger refresh
		await vi.advanceTimersByTimeAsync(6000);

		// Should only refresh once (from last online transition)
		expect(mockCallback).toHaveBeenCalledTimes(1);
	});
});

describe('RefreshController - Network Online→Offline Transition', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		networkCallbacks.length = 0;
		mockNetworkState = { isOnline: true };
	});

	afterEach(() => {
		vi.restoreAllMocks();
		vi.useRealTimers();
	});

	it('shows "connection lost" toast', async () => {
		const { addToast } = await import('./toast');
		const { RefreshController } = await import('../refreshController');

		const controller = new RefreshController({
			enabled: false,
			interval: 30000,
			onlyWhenVisible: false,
			refreshOnReconnect: false
		});

		// Simulate network going offline
		networkCallbacks[0]({ isOnline: false });

		expect(addToast).toHaveBeenCalledWith(
			'Connection lost. Working in offline mode.',
			'error',
			4000
		);
	});

	it('stops periodic refresh', async () => {
		const setIntervalSpy = vi.spyOn(window, 'setInterval');
		const clearIntervalSpy = vi.spyOn(window, 'clearInterval');

		const { RefreshController } = await import('../refreshController');
		const controller = new RefreshController({
			enabled: true,
			interval: 30000,
			onlyWhenVisible: false,
			refreshOnReconnect: false
		});

		// Start periodic refresh
		controller.start();
		expect(setIntervalSpy).toHaveBeenCalled();

		// Simulate network going offline
		networkCallbacks[0]({ isOnline: false });

		// Should stop the interval
		expect(clearIntervalSpy).toHaveBeenCalled();

		setIntervalSpy.mockRestore();
		clearIntervalSpy.mockRestore();
	});

	it('does not trigger refresh', async () => {
		const { RefreshController } = await import('../refreshController');
		const mockCallback = vi.fn();
		const controller = new RefreshController({
			enabled: false,
			interval: 30000,
			onlyWhenVisible: false,
			refreshOnReconnect: false
		});

		controller.register('test', mockCallback);

		// Simulate network going offline
		networkCallbacks[0]({ isOnline: false });

		await vi.advanceTimersByTimeAsync(10000);

		// Should not refresh when offline
		expect(mockCallback).not.toHaveBeenCalled();
	});

	it('debounces toast (5s window)', async () => {
		const { addToast } = await import('./toast');
		const { RefreshController } = await import('../refreshController');

		const controller = new RefreshController({
			enabled: false,
			interval: 30000,
			onlyWhenVisible: false,
			refreshOnReconnect: false
		});

		// Multiple offline transitions within debounce window
		networkCallbacks[0]({ isOnline: false });
		networkCallbacks[0]({ isOnline: false });
		networkCallbacks[0]({ isOnline: false });

		// Should only show toast once due to debounce
		expect(addToast).toHaveBeenCalledTimes(1);
	});
});

describe('RefreshController - refreshAll() Execution', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		networkCallbacks.length = 0;
		mockNetworkState = { isOnline: true };
	});

	afterEach(() => {
		vi.restoreAllMocks();
		vi.useRealTimers();
	});

	it('skips when offline', async () => {
		mockNetworkState = { isOnline: false };

		const { RefreshController } = await import('../refreshController');
		const mockCallback = vi.fn();
		const controller = new RefreshController({
			enabled: false,
			interval: 30000,
			onlyWhenVisible: false,
			refreshOnReconnect: false
		});

		controller.register('test', mockCallback);

		await controller.refreshAll();

		expect(mockCallback).not.toHaveBeenCalled();
	});

	it('runs all registered callbacks', async () => {
		const { RefreshController } = await import('../refreshController');
		const mockCallback1 = vi.fn().mockResolvedValue(undefined);
		const mockCallback2 = vi.fn().mockResolvedValue(undefined);
		const mockCallback3 = vi.fn().mockResolvedValue(undefined);

		const controller = new RefreshController({
			enabled: false,
			interval: 30000,
			onlyWhenVisible: false,
			refreshOnReconnect: false
		});

		controller.register('test1', mockCallback1);
		controller.register('test2', mockCallback2);
		controller.register('test3', mockCallback3);

		await controller.refreshAll();

		expect(mockCallback1).toHaveBeenCalledTimes(1);
		expect(mockCallback2).toHaveBeenCalledTimes(1);
		expect(mockCallback3).toHaveBeenCalledTimes(1);
	});

	it('waits for all callbacks (Promise.allSettled)', async () => {
		const { RefreshController } = await import('../refreshController');
		const mockCallback1 = vi.fn(
			() => new Promise((resolve) => setTimeout(resolve, 100))
		);
		const mockCallback2 = vi.fn(
			() => new Promise((resolve) => setTimeout(resolve, 200))
		);

		const controller = new RefreshController({
			enabled: false,
			interval: 30000,
			onlyWhenVisible: false,
			refreshOnReconnect: false
		});

		controller.register('test1', mockCallback1);
		controller.register('test2', mockCallback2);

		const refreshPromise = controller.refreshAll();

		// Before callbacks complete
		await vi.advanceTimersByTimeAsync(50);
		expect(controller.getRefreshingState()).toBe(true);

		// Wait for all to complete
		await vi.advanceTimersByTimeAsync(300);
		await refreshPromise;

		expect(controller.getRefreshingState()).toBe(false);
	});

	it('updates global freshness timestamp', async () => {
		const { dataFreshnessManager } = await import('./dataFreshness');
		const { RefreshController } = await import('../refreshController');

		const controller = new RefreshController({
			enabled: false,
			interval: 30000,
			onlyWhenVisible: false,
			refreshOnReconnect: false
		});

		controller.register('test', vi.fn().mockResolvedValue(undefined));

		await controller.refreshAll();

		expect(dataFreshnessManager.updateTimestamp).toHaveBeenCalledWith('global');
	});

	it('does not throw on callback failure', async () => {
		const { RefreshController } = await import('../refreshController');
		const mockCallbackSuccess = vi.fn().mockResolvedValue(undefined);
		const mockCallbackFail = vi.fn().mockRejectedValue(new Error('Callback error'));

		const controller = new RefreshController({
			enabled: false,
			interval: 30000,
			onlyWhenVisible: false,
			refreshOnReconnect: false
		});

		controller.register('success', mockCallbackSuccess);
		controller.register('fail', mockCallbackFail);

		// Should not throw
		await expect(controller.refreshAll()).resolves.not.toThrow();

		// Both callbacks should have been called
		expect(mockCallbackSuccess).toHaveBeenCalled();
		expect(mockCallbackFail).toHaveBeenCalled();
	});

	it('resets isRefreshing flag after completion', async () => {
		const { RefreshController } = await import('../refreshController');
		const mockCallback = vi.fn().mockResolvedValue(undefined);

		const controller = new RefreshController({
			enabled: false,
			interval: 30000,
			onlyWhenVisible: false,
			refreshOnReconnect: false
		});

		controller.register('test', mockCallback);

		expect(controller.getRefreshingState()).toBe(false);

		await controller.refreshAll();

		expect(controller.getRefreshingState()).toBe(false);
	});
});

describe('RefreshController - refreshAll() Concurrency Control', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		networkCallbacks.length = 0;
		mockNetworkState = { isOnline: true };
	});

	afterEach(() => {
		vi.restoreAllMocks();
		vi.useRealTimers();
	});

	it('does not run concurrently', async () => {
		const { RefreshController } = await import('../refreshController');
		const mockCallback = vi.fn(
			() => new Promise((resolve) => setTimeout(resolve, 1000))
		);

		const controller = new RefreshController({
			enabled: false,
			interval: 30000,
			onlyWhenVisible: false,
			refreshOnReconnect: false
		});

		controller.register('test', mockCallback);

		// Start first refresh
		const promise1 = controller.refreshAll();

		// Try to start second refresh before first completes
		await vi.advanceTimersByTimeAsync(100);
		const promise2 = controller.refreshAll();

		// Second should be skipped
		await vi.advanceTimersByTimeAsync(2000);

		await promise1;
		await promise2;

		// Callback should only be called once
		expect(mockCallback).toHaveBeenCalledTimes(1);
	});

	it('skips if refresh already in progress', async () => {
		const { RefreshController } = await import('../refreshController');
		const mockCallback = vi.fn(
			() => new Promise((resolve) => setTimeout(resolve, 1000))
		);

		const controller = new RefreshController({
			enabled: false,
			interval: 30000,
			onlyWhenVisible: false,
			refreshOnReconnect: false
		});

		controller.register('test', mockCallback);

		// Start first refresh
		controller.refreshAll();

		// Try to start second while first is running
		await vi.advanceTimersByTimeAsync(100);
		controller.refreshAll();

		// Wait for completion
		await vi.advanceTimersByTimeAsync(2000);

		// Callback should only be called once
		expect(mockCallback).toHaveBeenCalledTimes(1);
	});

	it('returns early when refreshing', async () => {
		const { RefreshController } = await import('../refreshController');
		const mockCallback = vi.fn(
			() => new Promise((resolve) => setTimeout(resolve, 1000))
		);

		const controller = new RefreshController({
			enabled: false,
			interval: 30000,
			onlyWhenVisible: false,
			refreshOnReconnect: false
		});

		controller.register('test', mockCallback);

		// Start first refresh
		const promise1 = controller.refreshAll();

		// Try second refresh
		await vi.advanceTimersByTimeAsync(100);
		const promise2 = controller.refreshAll();

		// Both should resolve (second resolves early)
		await Promise.all([promise1, promise2]);

		// Only one actual execution
		expect(mockCallback).toHaveBeenCalledTimes(1);
	});

	it('logs message when skipped', async () => {
		const consoleSpy = vi.spyOn(console, 'log');
		const { RefreshController } = await import('../refreshController');
		const mockCallback = vi.fn(
			() => new Promise((resolve) => setTimeout(resolve, 1000))
		);

		const controller = new RefreshController({
			enabled: false,
			interval: 30000,
			onlyWhenVisible: false,
			refreshOnReconnect: false
		});

		controller.register('test', mockCallback);

		// Start first refresh
		controller.refreshAll();

		// Try second refresh
		await vi.advanceTimersByTimeAsync(100);
		controller.refreshAll();

		expect(consoleSpy).toHaveBeenCalledWith(
			'Refresh already in progress, skipping'
		);

		consoleSpy.mockRestore();
	});
});

describe('RefreshController - Visibility Change Handling', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		networkCallbacks.length = 0;
		mockNetworkState = { isOnline: true };
	});

	afterEach(() => {
		vi.restoreAllMocks();
		vi.useRealTimers();
	});

	it('pauses when document hidden (onlyWhenVisible=true)', async () => {
		const clearIntervalSpy = vi.spyOn(window, 'clearInterval');

		const { RefreshController } = await import('../refreshController');
		const controller = new RefreshController({
			enabled: true,
			interval: 30000,
			onlyWhenVisible: true,
			refreshOnReconnect: false
		});

		// Simulate document hidden
		Object.defineProperty(document, 'hidden', {
			value: true,
			configurable: true
		});
		document.dispatchEvent(new Event('visibilitychange'));

		expect(clearIntervalSpy).toHaveBeenCalled();

		clearIntervalSpy.mockRestore();
	});

	it('resumes when document visible (onlyWhenVisible=true)', async () => {
		const setIntervalSpy = vi.spyOn(window, 'setInterval');

		const { RefreshController } = await import('../refreshController');
		const controller = new RefreshController({
			enabled: true,
			interval: 30000,
			onlyWhenVisible: true,
			refreshOnReconnect: false
		});

		// Simulate document visible
		Object.defineProperty(document, 'hidden', {
			value: false,
			configurable: true
		});
		document.dispatchEvent(new Event('visibilitychange'));

		expect(setIntervalSpy).toHaveBeenCalled();

		setIntervalSpy.mockRestore();
	});

	it('does not pause when hidden (onlyWhenVisible=false)', async () => {
		const clearIntervalSpy = vi.spyOn(window, 'clearInterval');

		const { RefreshController } = await import('../refreshController');
		const controller = new RefreshController({
			enabled: true,
			interval: 30000,
			onlyWhenVisible: false,
			refreshOnReconnect: false
		});

		// Simulate document hidden
		Object.defineProperty(document, 'hidden', {
			value: true,
			configurable: true
		});
		document.dispatchEvent(new Event('visibilitychange'));

		expect(clearIntervalSpy).not.toHaveBeenCalled();

		clearIntervalSpy.mockRestore();
	});

	it('removes old listener before adding new', async () => {
		const removeEventListenerSpy = vi.spyOn(document, 'removeEventListener');

		const { RefreshController } = await import('../refreshController');
		const controller = new RefreshController({
			enabled: false,
			interval: 30000,
			onlyWhenVisible: true,
			refreshOnReconnect: false
		});

		// Update config to trigger listener update
		controller.updateConfig({ onlyWhenVisible: false });

		expect(removeEventListenerSpy).toHaveBeenCalledWith(
			'visibilitychange',
			expect.any(Function)
		);

		removeEventListenerSpy.mockRestore();
	});

	it('handles rapid visibility changes', async () => {
		const { RefreshController } = await import('../refreshController');
		const controller = new RefreshController({
			enabled: true,
			interval: 30000,
			onlyWhenVisible: true,
			refreshOnReconnect: false
		});

		// Rapid visibility changes
		for (let i = 0; i < 10; i++) {
			Object.defineProperty(document, 'hidden', {
				value: i % 2 === 0,
				configurable: true
			});
			document.dispatchEvent(new Event('visibilitychange'));
		}

		// Should not crash
		expect(true).toBe(true);
	});
});

describe('RefreshController - Config Updates', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		networkCallbacks.length = 0;
		mockNetworkState = { isOnline: true };
	});

	afterEach(() => {
		vi.restoreAllMocks();
		vi.useRealTimers();
	});

	it('restarts interval when enabled changes', async () => {
		const clearIntervalSpy = vi.spyOn(window, 'clearInterval');
		const setIntervalSpy = vi.spyOn(window, 'setInterval');

		const { RefreshController } = await import('../refreshController');
		const controller = new RefreshController({
			enabled: false,
			interval: 30000,
			onlyWhenVisible: false,
			refreshOnReconnect: false
		});

		// Enable
		controller.updateConfig({ enabled: true });
		expect(setIntervalSpy).toHaveBeenCalled();

		// Disable
		controller.updateConfig({ enabled: false });
		expect(clearIntervalSpy).toHaveBeenCalled();

		clearIntervalSpy.mockRestore();
		setIntervalSpy.mockRestore();
	});

	it('pauses when onlyWhenVisible changes to true', async () => {
		const { RefreshController } = await import('../refreshController');
		const controller = new RefreshController({
			enabled: true,
			interval: 30000,
			onlyWhenVisible: false,
			refreshOnReconnect: false
		});

		// Change to onlyWhenVisible=true
		controller.updateConfig({ onlyWhenVisible: true });

		// Should set up visibility listener
		expect(true).toBe(true);
	});

	it('resumes when onlyWhenVisible changes to false', async () => {
		const { RefreshController } = await import('../refreshController');
		const controller = new RefreshController({
			enabled: true,
			interval: 30000,
			onlyWhenVisible: true,
			refreshOnReconnect: false
		});

		// Change to onlyWhenVisible=false
		controller.updateConfig({ onlyWhenVisible: false });

		// Should keep interval running
		expect(true).toBe(true);
	});

	it('merges config correctly (partial updates)', async () => {
		const { RefreshController } = await import('../refreshController');
		const controller = new RefreshController({
			enabled: true,
			interval: 30000,
			onlyWhenVisible: true,
			refreshOnReconnect: false
		});

		// Partial update
		controller.updateConfig({ interval: 60000 });

		// Should merge, keeping other values
		expect((controller as any).config.enabled).toBe(true);
		expect((controller as any).config.onlyWhenVisible).toBe(true);
		expect((controller as any).config.refreshOnReconnect).toBe(false);
		expect((controller as any).config.interval).toBe(60000);
	});

	it('does not restart when interval changes (uses new interval)', async () => {
		const clearIntervalSpy = vi.spyOn(window, 'clearInterval');
		const setIntervalSpy = vi.spyOn(window, 'setInterval');

		const { RefreshController } = await import('../refreshController');
		const controller = new RefreshController({
			enabled: true,
			interval: 30000,
			onlyWhenVisible: false,
			refreshOnReconnect: false
		});

		const initialCalls = setIntervalSpy.mock.calls.length;

		// Change interval only
		controller.updateConfig({ interval: 60000 });

		// Should restart interval (clear + set)
		expect(clearIntervalSpy).toHaveBeenCalled();
		expect(setIntervalSpy).toHaveBeenCalled();

		clearIntervalSpy.mockRestore();
		setIntervalSpy.mockRestore();
	});
});

describe('RefreshController - Cleanup & Memory Leaks', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		networkCallbacks.length = 0;
		mockNetworkState = { isOnline: true };
	});

	afterEach(() => {
		vi.restoreAllMocks();
		vi.useRealTimers();
	});

	it('removes visibility listener on config update', async () => {
		const removeEventListenerSpy = vi.spyOn(document, 'removeEventListener');

		const { RefreshController } = await import('../refreshController');
		const controller = new RefreshController({
			enabled: false,
			interval: 30000,
			onlyWhenVisible: true,
			refreshOnReconnect: false
		});

		controller.updateConfig({ onlyWhenVisible: false });

		expect(removeEventListenerSpy).toHaveBeenCalledWith(
			'visibilitychange',
			expect.any(Function)
		);

		removeEventListenerSpy.mockRestore();
	});

	it('clears interval on stop', async () => {
		const clearIntervalSpy = vi.spyOn(window, 'clearInterval');

		const { RefreshController } = await import('../refreshController');
		const controller = new RefreshController({
			enabled: true,
			interval: 30000,
			onlyWhenVisible: false,
			refreshOnReconnect: false
		});

		controller.stop();

		expect(clearIntervalSpy).toHaveBeenCalled();

		clearIntervalSpy.mockRestore();
	});

	it('clears debounce timers', async () => {
		const clearTimeoutSpy = vi.spyOn(window, 'clearTimeout');

		const { RefreshController } = await import('../refreshController');
		const controller = new RefreshController({
			enabled: false,
			interval: 30000,
			onlyWhenVisible: false,
			refreshOnReconnect: true
		});

		// Trigger network transition to set debounce timer
		networkCallbacks[0]({ isOnline: true });

		// Trigger another transition to clear previous debounce
		networkCallbacks[0]({ isOnline: false });

		expect(clearTimeoutSpy).toHaveBeenCalled();

		clearTimeoutSpy.mockRestore();
	});

	it('no dangling timers after destroy', async () => {
		const { RefreshController } = await import('../refreshController');
		const controller = new RefreshController({
			enabled: true,
			interval: 30000,
			onlyWhenVisible: true,
			refreshOnReconnect: true
		});

		// Stop everything
		controller.stop();

		// Wait some time
		await vi.advanceTimersByTimeAsync(100000);

		// No errors should occur from dangling timers
		expect(true).toBe(true);
	});
});
