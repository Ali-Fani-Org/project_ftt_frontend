# Time Tracker Frontend Review Findings

_Date: 2026-08-26_

## Verification status

- `npm run build`: passed, but Vite emitted warnings.
- `npm run check`: failed with **139 errors in 27 files**.
- `npm test -- --run`: not runnable because `package.json` has no test script.
- Vitest is referenced by tests but is not installed in `package.json`.

## Critical findings

### 1. Typecheck is severely broken

**Command:** `npm run check`

The project currently reports 139 diagnostics, including missing exports/modules, implicit `any` parameters, invalid SvelteKit types, nullable API results used as non-null values, and updater/API type mismatches.

Important examples:

- `src/lib/stores.ts` imports a non-exported `apiCache` and has untyped feature-flag mappings.
- `src/lib/network.ts` imports a non-exported `apiCache` and has nullable URL/type errors.
- `src/lib/api.ts` uses untyped caught errors and returns values inferred as `{}`.
- `src/lib/preloadOnHover.ts` references an undeclared `browser` symbol.
- `src/lib/utils.ts` references an undeclared `adventurer` symbol.
- `src/hooks.client.ts` returns an invalid `handleError` shape.
- Tests import `RefreshController`, but it is not exported.
- Several tests import missing modules.
- `settings/+page.svelte` dereferences a possibly null updater result.

The production build succeeds because Vite transpiles despite type errors. It is not a correctness gate.

**Recommendation:** Make `npm run check` pass before treating builds as releasable.

### 2. Hover preloading is a stub and has a runtime error

**File:** `src/lib/preloadOnHover.ts`

`browser` is not imported, and `performPreload()` contains only a placeholder instead of performing a preload.

This can cause a runtime `ReferenceError` and means hover preloading does not actually work.

**Recommendation:** Import `browser` and call the real preload implementation, or remove the feature until complete.

### 3. Time-entry cache invalidation misses actual keys

**File:** `src/lib/api.ts`

Actual list keys are dynamic, for example:

```ts
time_entries:list:api/time_entries/?...
time_entries:filtered:api/time_entries/?...
```

Start/stop/update invalidation mostly removes static keys such as `time_entries:all` and `time_entries:current_active`, or incomplete prefixes that do not equal stored keys.

After starting, stopping, or editing a timer, stale lists and reports can remain visible for a long time.

**Recommendation:** Centralize invalidation and remove every key beginning with `time_entries:` from memory and local storage.

### 4. Remember-me behavior can persist session-only tokens

**Files:** `src/lib/auth-context.ts`, `src/lib/stores.ts`

The auth token is stored through a persistent store even when “Remember me” is disabled. The code also writes session storage and removes only the local-storage copy, while the Tauri settings store may still retain the token.

**Impact:** A session-only login may survive app restarts.

**Recommendation:** Use separate persistent and session auth stores, or make token storage explicitly select the desired persistence backend.

## High-priority findings

### 5. Refresh controller can allow overlapping refreshes

**File:** `src/lib/refreshController.ts`

`pause()` sets `isRefreshing = false` even when callbacks are still running. A second refresh can begin while the first is active.

**Impact:** Duplicate API calls, conflicting cache writes, and duplicate notifications.

**Recommendation:** Do not clear the lock until the active operation finishes; use cancellation/AbortSignals if needed.

### 6. Offline auth trusts local storage as identity

**File:** `src/lib/auth-context.ts`

Offline authentication is granted when cached token and user JSON exist. Cached user data is not independently authenticated and is not strongly namespaced by account.

**Impact:** Old or tampered local data can be shown as the current user, especially after account switching or storage corruption.

**Recommendation:** Namespace cached data by account/token identity and treat offline state as a UI convenience, not authoritative authorization.

### 7. Network probe treats any resolved no-cors fetch as online

**File:** `src/lib/network.ts`

Connectivity probes use `mode: 'no-cors'` and treat any resolved fetch as success. Captive portals, proxy pages, or unexpected server responses may be classified as healthy.

There are also multiple duplicated probe implementations.

**Recommendation:** Probe a known health endpoint and validate its response; consolidate probe logic.

### 8. `timeEntries.list()` can return null while callers assume a page

**File:** `src/lib/api.ts`

`fetchWithCache()` returns `data: T | null`, and `timeEntries.list()` returns that value directly. Components such as `TasksModal.svelte` immediately access `result.next` and `result.previous`.

This is a type error and a runtime failure when a request fails without cached data.

**Recommendation:** Return a consistent empty pagination object or handle null at every call site.

### 9. Project pie chart percentages are wrong when more than five projects exist

**File:** `src/lib/ProjectPieChart.svelte`

The total includes all projects, but the displayed data is sliced to the top five. Percentages therefore do not sum to 100% when additional projects exist.

**Recommendation:** Add an “Other” bucket or calculate percentages after grouping the displayed data.

### 10. Project chart merges projects with identical names

**File:** `src/lib/ProjectPieChart.svelte`

Entries are grouped by project name instead of project ID.

**Recommendation:** Group by project ID and use the title only for display.

## Security/privacy findings

### 11. Tauri CSP is disabled

**File:** `src-tauri/tauri.conf.json`

```json
"csp": null
```

A future injection issue has a larger impact without a restrictive content security policy.

**Recommendation:** Configure a CSP allowing only required app, API, telemetry, and update origins.

### 12. Sentry receives default PII and public IP data

**File:** `src/routes/+layout.svelte`

Sentry is initialized with:

```ts
sendDefaultPii: true
```

The app also requests the public IP from `api.ipify.org` and assigns it to the Sentry user context.

**Recommendation:** Disable default PII unless explicitly required, avoid the external IP lookup, and document telemetry behavior.

### 13. Updater proxy URL is user-controlled

**File:** `src/routes/settings/+page.svelte`

An arbitrary persisted proxy URL is passed to the Tauri updater.

This may be intentional, but it allows update metadata/download traffic to be redirected to an untrusted service.

**Recommendation:** Restrict schemes, provide a strong warning, and consider limiting this setting in managed deployments.

## Maintainability/test findings

### 14. Tests are disconnected from project tooling

The repository contains Vitest tests but:

- There is no `test` script.
- Vitest is not installed.
- Several expected exports and modules are missing.

**Recommendation:** Add Vitest, a test script, test configuration, and make the existing tests compile and run in CI.

### 15. API client construction is duplicated

**File:** `src/lib/api.ts`

The `createApiClient()` factory and the `baseUrl.subscribe()` client construction duplicate hooks and behavior.

**Recommendation:** Use one factory for all client instances.

### 16. Frontend/backend tags contract is inconsistent

The backend read serializer omits tags while the frontend `TimeEntry` type requires `tags: string[]`.

This can make tags disappear after loading or editing an entry.

**Recommendation:** Align the API response and frontend type.

### 17. Sentry release API usage is invalid

**File:** `src/routes/+layout.svelte`

The typecheck/build output reports that `setRelease` is not exported by the installed Sentry SvelteKit package.

**Recommendation:** Use the supported Sentry API/version combination and verify release tagging in a production build.

## Recommended remediation order

1. Make `npm run check` pass.
2. Repair auth persistence and cache invalidation.
3. Fix hover preloading and refresh concurrency.
4. Add a real test script and install/configure Vitest.
5. Align frontend/backend API types, especially tags and pagination.
6. Harden Tauri CSP and review telemetry/PII behavior.
7. Add integration tests for offline auth, timer mutations, cache invalidation, and reconnect refreshes.
