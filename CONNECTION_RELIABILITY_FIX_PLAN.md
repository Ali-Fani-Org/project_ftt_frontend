# Connection Reliability Fix Plan

**Date:** 2026-04-14  
**Status:** Proposed  
**Reason:** Users reported unreliable connections; code review identified multiple reliability issues in connection check and retry logic.

---

## Critical Issues Identified

### 1. `network.ts` - No Retry Logic for Probe Failures
**Location:** `src/lib/network.ts`, lines 113-130 (`probeConnectivity`)

**Problem:** The `probeConnectivity()` function makes a single `fetch()` attempt with no retry. Transient network failures (DNS resolution delays, brief connectivity drops) immediately count as failures, causing false-negative offline detection.

**Impact:** Users briefly losing connectivity get marked as offline even when connection recovers within milliseconds.

### 2. `network.ts` - Race Condition in Heartbeat Scheduling
**Location:** `src/lib/network.ts`, lines 198-210 (`scheduleHeartbeat`), called from multiple handlers

**Problem:** `runActiveCheck()` can schedule conflicting heartbeat intervals when called rapidly from multiple event handlers (`focus`, `visibilitychange`, `handleOnline`). While `scheduleHeartbeat` clears previous intervals, rapid calls can cause intervals to fire before being cleared.

**Impact:** Duplicate network checks firing simultaneously, wasting bandwidth and causing inconsistent state.

### 3. `network.ts` - Aggressive Offline Polling on Single Failure
**Location:** `src/lib/network.ts`, line 178

**Problem:** Switches to `OFFLINE_POLL_MS` (5s polling) on **first failure** even if previously healthy:
```typescript
if (consecutiveFailures === 1) {
    scheduleHeartbeat(OFFLINE_POLL_MS);
}
```

**Impact:** Brief network hiccup triggers aggressive polling, increasing load and battery drain on mobile devices.

### 4. `notifications.ts` - Polling Doesn't Integrate with Network Store
**Location:** `src/lib/notifications.ts`, lines 343-382 (`handleReconnect`)

**Problem:** The notification service has its own reconnection logic that doesn't coordinate with the network status store. Reconnect attempts continue even when `network.isOnline === false`, wasting resources and generating errors.

**Impact:** Notification service keeps trying to reconnect when device is clearly offline, generating error logs and delaying recovery.

### 5. `api.ts` - `fetchWithRetry` Doesn't Check Network Before First Attempt
**Location:** `src/lib/api.ts`, lines 285-322 (`fetchWithRetry`)

**Problem:** Starts the request before checking if online. Should check network status **before** attempting the fetch.

**Impact:** Wastes time attempting network call when offline, only to fail and then check network status.

### 6. `api.ts` - No Timeout on API Client
**Location:** `src/lib/api.ts`, lines 7-45 (`createApiClient`)

**Problem:** The `ky.create()` calls have no `timeout` configuration. Requests can hang indefinitely on slow/unreliable connections.

**Impact:** Users on poor connections experience hanging requests that never complete or fail.

### 7. `refreshController.ts` - Triggers Refresh Immediately on Reconnect
**Location:** `src/lib/refreshController.ts`, lines 28-58

**Problem:** Doesn't wait for connection to stabilize before triggering bulk refresh. Can cause cascade of failures if connection is still unstable.

**Impact:** Connection restored toast appears, but immediate refresh fails because connection isn't stable yet.

---

## Proposed Fixes

### Fix 1: network.ts - Robust Connection Probing with Retries

**Changes:**
- Add `PROBE_RETRIES = 3` constant
- Add `probeWithRetry()` function with exponential backoff + jitter
- Modify `probeConnectivity()` to call `probeWithRetry()`
- Add jitter formula: `delay * (0.5 + Math.random())` to avoid thundering herd

**New Constants:**
```typescript
const PROBE_RETRIES = 3;
const PROBE_BASE_DELAY_MS = 500;
const PROBE_MAX_DELAY_MS = 3000;
```

**New Function:**
```typescript
const probeWithRetry = async (timeout: number = DEFAULT_TIMEOUT_MS): Promise<boolean> => {
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
                // Exponential backoff with jitter
                const baseDelay = Math.min(
                    PROBE_BASE_DELAY_MS * Math.pow(2, attempt),
                    PROBE_MAX_DELAY_MS
                );
                const jitteredDelay = baseDelay * (0.5 + Math.random());
                await new Promise(resolve => setTimeout(resolve, jitteredDelay));
            }
        }
    }
    
    return false;
};
```

### Fix 2: network.ts - Debounced Heartbeat Scheduling

**Changes:**
- Add `heartbeatDebounceTimer` to prevent rapid rescheduling
- Debounce duration: 1000ms
- Clear previous debounce timer before scheduling new one

**New Constant:**
```typescript
const HEARTBEAT_DEBOUNCE_MS = 1000;
```

**Modified `scheduleHeartbeat`:**
```typescript
let heartbeatDebounceTimer: number | null = null;

const scheduleHeartbeat = (intervalMs: number) => {
    if (!browser) return;
    
    // Clear previous debounce timer
    if (heartbeatDebounceTimer) {
        clearTimeout(heartbeatDebounceTimer);
        heartbeatDebounceTimer = null;
    }
    
    // Debounce the scheduling
    heartbeatDebounceTimer = window.setTimeout(() => {
        if (heartbeatIntervalId) {
            clearInterval(heartbeatIntervalId);
            heartbeatIntervalId = null;
        }
        
        heartbeatIntervalId = window.setInterval(() => {
            runActiveCheck();
        }, intervalMs);
    }, HEARTBEAT_DEBOUNCE_MS);
};
```

### Fix 3: network.ts - Require 2 Failures Before Fast Polling

**Changes:**
- Remove line 178 (`if (consecutiveFailures === 1)`)
- Only switch to `OFFLINE_POLL_MS` after `FAILURES_BEFORE_OFFLINE` failures

**Modified `runActiveCheck` failure handling:**
```typescript
consecutiveFailures += 1;

if (consecutiveFailures >= FAILURES_BEFORE_OFFLINE) {
    scheduleHeartbeat(OFFLINE_POLL_MS);
    applyConnectivityResult(false);
} else {
    // Still online, keep normal polling
    scheduleHeartbeat(ONLINE_POLL_MS);
}
```

### Fix 4: notifications.ts - Network-Aware Reconnection

**Changes:**
- Import `network` store
- Subscribe to network status changes
- Pause reconnection when offline
- Resume when network comes online

**Modified `handleReconnect`:**
```typescript
import { network } from './network';

private handleReconnect(): void {
    this.connected = false;
    this.isConnecting = false;
    this.isPolling = false;
    
    // Check if we still have authentication
    const token = get(authToken);
    if (!token) {
        this.lastError = 'Authentication required - please log in first';
        return;
    }
    
    // Pause reconnection when offline
    if (!get(network).isOnline) {
        logger.debug('[NotificationService] Pausing reconnection - device is offline');
        this.lastError = 'Waiting for network connection...';
        return;
    }
    
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
        this.reconnectAttempts++;
        
        // Exponential backoff with max cap
        const delay = Math.min(
            1000 * Math.pow(2, this.reconnectAttempts - 1),
            60000  // 60 second max cap
        );
        
        setTimeout(() => {
            this.connect().catch(logger.error);
        }, delay);
    } else {
        this.lastError = 'Max reconnection attempts reached. Please check your network connection.';
    }
}
```

**Add Network Subscription:**
```typescript
// Subscribe to network changes in constructor or init
network.subscribe((status) => {
    if (status.isOnline && !this.connected && this.reconnectAttempts > 0) {
        logger.debug('[NotificationService] Network restored, resuming connection');
        this.reconnectAttempts = 0; // Reset attempts on restore
        this.connect().catch(logger.error);
    }
});
```

### Fix 5: api.ts - Check Network Before Fetch

**Changes:**
- Add network check at start of `fetchWithRetry`
- Return immediately with error if offline

**Modified `fetchWithRetry`:**
```typescript
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
            if (
                error.response?.status >= 400 &&
                error.response?.status < 500 &&
                error.response?.status !== 429
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
```

### Fix 6: api.ts - Add Timeout to API Client

**Changes:**
- Add `timeout: 15000` to ky client configuration

**Modified `createApiClient`:**
```typescript
const createApiClient = () => {
    return ky.create({
        prefixUrl: get(baseUrl),
        timeout: 15000, // 15 second timeout
        hooks: {
            beforeRequest: [ /* existing hooks */ ],
            afterResponse: [ /* existing hooks */ ],
            beforeError: [ /* existing hooks */ ]
        }
    });
};
```

**Also update the baseUrl.subscribe ky.create call with same timeout.**

### Fix 7: refreshController.ts - Stabilization Delay Before Refresh

**Changes:**
- Add `CONNECTION_STABILIZATION_MS = 5000` constant
- Add `verifyConnectionStable()` helper using `checkConnectivity`
- Wait stabilization period before triggering refresh
- Verify connection with ping before proceeding

**Modified Reconnection Handler:**
```typescript
private CONNECTION_STABILIZATION_MS = 5000;

network.subscribe((status) => {
    if (status.isOnline && !this.wasOnline && this.config.refreshOnReconnect) {
        console.log('Connection restored, waiting for stabilization...');
        
        if (this.connectionRestoredDebounce) {
            clearTimeout(this.connectionRestoredDebounce);
        }
        
        addToast('Connection restored! Stabilizing before refresh...', 'success', 3000);
        
        // Wait for connection to stabilize
        this.connectionRestoredDebounce = window.setTimeout(async () => {
            // Verify connection is still stable with quick ping
            const { checkConnectivity } = await import('./network');
            const isStable = await checkConnectivity(2000);
            
            if (isStable) {
                this.refreshAll()
                    .then(() => {
                        addToast('Data refreshed successfully', 'success', 2000);
                    })
                    .catch((err) => {
                        addToast('Failed to refresh some data', 'error', 3000);
                    });
            } else {
                console.warn('Connection not stable yet, delaying refresh');
                // Reschedule after another delay
                this.connectionRestoredDebounce = window.setTimeout(() => {
                    this.refreshAll().catch(() => {});
                }, this.CONNECTION_STABILIZATION_MS);
            }
            
            this.connectionRestoredDebounce = null;
        }, this.CONNECTION_STABILIZATION_MS);
    }
    
    this.wasOnline = status.isOnline;
});
```

---

## Testing Plan

### Test Files to Create

All tests will be placed in `src/lib/__tests__/` directory.

### 1. `src/lib/__tests__/network.test.ts`

**Test Cases:**

```
probeConnectivity() - Success Path
├── succeeds on first attempt
├── returns true with valid response
└── measures ping time correctly

probeConnectivity() - Retry Logic
├── succeeds after 1 transient failure
├── succeeds after 2 transient failures
├── fails after all 3 retries exhausted
├── doesn't retry when navigator.onLine is false
└── respects jitter (delays are randomized)

probeConnectivity() - Timeout
├── aborts request after timeout
├── returns false on timeout
└── clears timeout on success (no leak)

runActiveCheck() - State Transitions
├── transitions from unknown to online
├── transitions from online to offline after 2 failures
├── stays online after 1 failure (doesn't flip immediately)
├── transitions from offline to online on success
└── marks isChecking during async operation

runActiveCheck() - Heartbeat Scheduling
├── debounces rapid scheduling calls
├── only schedules after debounce delay
├── clears previous interval before setting new one
└── doesn't schedule when destroyed

handleOnline Event
├── resets consecutiveFailures to 0
├── schedules ONLINE_POLL_MS heartbeat
└── triggers immediate check

handleOffline Event
├── sets consecutiveFailures to FAILURES_BEFORE_OFFLINE
├── schedules OFFLINE_POLL_MS heartbeat
├── immediately marks as offline
└── increments retryCount

checkConnectivity() Utility
├── returns false when !browser
├── returns false when !navigator.onLine
├── returns true when ping succeeds
├── returns false when ping fails
└── respects custom timeout

Network Store Lifecycle
├── initializes with isChecking: true
├── cleans up intervals on destroy
├── cleans up on beforeunload
└── unsubscribes from baseUrl on destroy

baseUrl Change Handling
├── updates cached probe URL
├── uses new URL for subsequent probes
└── handles invalid URL gracefully
```

### 2. `src/lib/__tests__/api.test.ts`

**Test Cases:**

```
fetchWithRetry() - Success Path
├── succeeds on first attempt (no retries)
├── returns correct result
└── doesn't delay when succeeds immediately

fetchWithRetry() - Retry Logic
├── succeeds after 1 retry (500 error)
├── succeeds after 2 retries (500 errors)
├── succeeds after 3 retries (max)
├── fails after max retries exhausted
└── throws last error when all retries fail

fetchWithRetry() - Error Filtering
├── doesn't retry 400 Bad Request
├── doesn't retry 403 Forbidden
├── doesn't retry 404 Not Found
├── retries 429 Too Many Requests
├── retries 500 Internal Server Error
├── retries 502 Bad Gateway
├── retries 503 Service Unavailable
└── retries network errors (no response)

fetchWithRetry() - Network Awareness
├── checks network before first attempt
├── throws immediately when offline
├── stops retrying when goes offline mid-retry
└── continues retrying when online

fetchWithRetry() - Backoff Timing
├── delays 1s before retry 1 (default backoff)
├── delays 2s before retry 2
├── delays 4s before retry 3
└── respects custom backoff parameter

API Client Timeout
├── request succeeds within timeout
├── request fails after 15s timeout
├── timeout error is thrown correctly
└── timeout is configurable

fetchWithCache() - Offline Behavior
├── returns cache immediately when offline
├── doesn't call fetchFn when offline
├── returns stale cache when available
├── returns null when no cache available
└── logs warning when no offline cache

fetchWithCache() - Online Behavior
├── calls fetchFn when online
├── updates cache on success
├── falls back to cache on failure
├── updates freshness manager on success
└── returns stale=false on fresh fetch

parseErrorResponse()
├── parses Response with clone()
├── parses Ky _data property
├── parses direct json()
├── returns empty object on parse failure
└── handles non-JSON error body
```

### 3. `src/lib/__tests__/notifications.test.ts`

**Test Cases:**

```
connect() - Success Path
├── connects with valid token and URL
├── starts polling after connect
├── resets reconnectAttempts on success
└── sets connected = true

connect() - Failure Paths
├── blocks without token
├── blocks without base URL
├── handles connection error
└── triggers reconnect on failure

startPolling() - Normal Operation
├── processes new notifications
├── acknowledges each notification
├── polls immediately after new notifications
├── waits pollInterval when no notifications
└── stops when disconnected

startPolling() - Error Handling
├── handles 401 by clearing token
├── handles 401 without crashing
├── handles network error
├── handles malformed response
└── triggers reconnect on error

handleReconnect() - Backoff Logic
├── delays 1s before attempt 1
├── delays 2s before attempt 2
├── delays 4s before attempt 3
├── delays 8s before attempt 4
├── delays 16s before attempt 5
├── caps at 60s max delay
└── resets attempts on successful connect

handleReconnect() - Network Awareness
├── pauses when network is offline
├── doesn't schedule setTimeout when offline
├── sets appropriate "waiting for network" message
├── resumes when network comes online
└── resets reconnectAttempts on network restore

handleReconnect() - Max Attempts
├── gives up after 5 attempts
├── sets "max attempts" error message
├── doesn't schedule more retries
└── can retry after manual reconnect call

disconnect()
├── aborts poll controller
├── sets connected = false
├── sets isPolling = false
├── clears connectionStartTime
└── can be called multiple times safely
```

### 4. `src/lib/__tests__/refreshController.test.ts`

**Test Cases:**

```
Constructor Initialization
├── subscribes to network store
├── initializes wasOnline from network
├── sets up visibility listener
└── doesn't start if config.enabled = false

Network Offline→Online Transition
├── waits CONNECTION_STABILIZATION_MS before refresh
├── shows "stabilizing" toast
├── verifies connection with ping
├── only refreshes if ping succeeds
├── delays again if ping fails
└── clears previous debounce timer

Network Online→Offline Transition
├── shows "connection lost" toast
├── stops periodic refresh
├── doesn't trigger refresh
└── debounces toast (5s window)

refreshAll() - Execution
├── skips when offline
├── runs all registered callbacks
├── waits for all callbacks (Promise.allSettled)
├── updates global freshness timestamp
├── doesn't throw on callback failure
└── resets isRefreshing flag after completion

refreshAll() - Concurrency Control
├── doesn't run concurrently
├── skips if refresh already in progress
├── returns early when refreshing
└── logs message when skipped

Visibility Change Handling
├── pauses when document hidden (onlyWhenVisible=true)
├── resumes when document visible (onlyWhenVisible=true)
├── doesn't pause when hidden (onlyWhenVisible=false)
├── removes old listener before adding new
└── handles rapid visibility changes

Config Updates
├── restarts interval when enabled changes
├── pauses when onlyWhenVisible changes to true
├── resumes when onlyWhenVisible changes to false
├── merges config correctly (partial updates)
└── doesn't restart when interval changes (uses new interval)

Cleanup & Memory Leaks
├── removes visibility listener on config update
├── clears interval on stop
├── clears debounce timers
└── no dangling timers after destroy
```

### 5. Mock Utilities: `src/lib/__tests__/__mocks__/`

**`network.ts` - Network Mock Helpers:**
```typescript
- mockFetch(): Configure fetch to succeed/fail
- mockNavigatorOnline(): Override navigator.onLine
- mockAbortController(): Mock AbortController
- useFakeTimers(): Enable vitest fake timers
- runTimersAsync(): Advance timers asynchronously
```

**`api.ts` - API Mock Helpers:**
```typescript
- mockApiResponse(): Configure response status/body
- mockNetworkError(): Simulate network failure
- mockTimeout(): Simulate request timeout
- createMockKy(): Mock ky.create() calls
```

### Testing Strategy

**Framework:** Vitest (standard for SvelteKit)

**Mocking Approach:**
- Mock all external dependencies: `fetch`, `navigator`, browser APIs
- Use `vi.spyOn()` for selective mocking
- Use `vi.useFakeTimers()` for timing-sensitive tests
- Use `vi.advanceTimersByTimeAsync()` for async timer tests

**Test Categories:**
1. **Unit Tests:** Individual functions in isolation (80% of tests)
2. **Integration Tests:** Store interactions (network → api → notifications) (15%)
3. **Edge Case Tests:** Rapid state changes, destroyed store, missing browser context (5%)

**Coverage Targets:**
- `network.ts`: 90%+ line coverage
- `api.ts`: 85%+ line coverage (retry/cache functions only)
- `notifications.ts`: 80%+ line coverage
- `refreshController.ts`: 85%+ line coverage

**Critical Tests (Must Pass):**
- Retry logic works correctly
- No memory leaks (cleanup removes all listeners/intervals)
- No duplicate heartbeat scheduling
- Network-aware functions check status before making requests
- Offline behavior returns cache immediately

---

## Implementation Order

1. **Phase 1: Core Network Reliability** (network.ts)
   - Add probe retry logic
   - Add heartbeat debounce
   - Fix failure threshold logic
   - Write tests for network.ts

2. **Phase 2: API Client Reliability** (api.ts)
   - Add timeout configuration
   - Add pre-flight network check
   - Write tests for api.ts

3. **Phase 3: Notification Service Integration** (notifications.ts)
   - Add network store subscription
   - Pause reconnection when offline
   - Write tests for notifications.ts

4. **Phase 4: Refresh Controller Stabilization** (refreshController.ts)
   - Add stabilization delay
   - Add connection verification ping
   - Write tests for refreshController.ts

5. **Phase 5: Integration Testing**
   - Test network → api interaction
   - Test network → notifications interaction
   - Test network → refresh controller interaction
   - End-to-end offline → online → refresh flow

---

## Risks & Mitigations

**Risk 1:** Retry logic increases latency on real failures  
**Mitigation:** Keep retry count low (3) and delays short (500ms base)

**Risk 2:** Heartbeat debounce delays offline detection  
**Mitigation:** 1s debounce is acceptable; immediate event handlers still fire

**Risk 3:** Stabilization delay frustrates users waiting for refresh  
**Mitigation:** Show clear "stabilizing" toast to set expectations

**Risk 4:** Notification service pauses too aggressively  
**Mitigation:** Resume immediately when network comes online, reset attempts

**Risk 5:** Test mocks don't match real browser behavior  
**Mitigation:** Manual testing with DevTools network throttling after implementation
