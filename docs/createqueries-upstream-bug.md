# createQueries `state_unsafe_mutation` — vendored fix & upstream tracking

> **Status check (run anytime):** `bun run check:createqueries-fix`
>
> Last verified: **2026-08-27** — upstream **still broken**, vendored copy **required**.
> Installed `@tanstack/svelte-query`: **6.1.46** (latest published; no fix release exists).

This document is the go-to reference for this bug: what it is, why the local
workaround exists, and exactly how to check — later down the road — whether
upstream has finally fixed it and the workaround can be retired.

---

## 1. The bug

### Symptom

The dashboard crashed on load with:

```
Uncaught Svelte error: state_unsafe_mutation
Updating state inside `$derived(...)`, `$inspect(...)` or a template expression is forbidden.
```

Only the **dashboard** crashed — it was the only page using `createQueries`.
The component stack pointed inside the provider chain, and the JS stack showed
the write happening during `createQueries`' observer construction:

```
at increment (sources.js)              ← Svelte source write
at create-subscriber.js                ← useIsFetching's subscriber
at queryCache.notify                   ← query cache listener
at queryObserver setOptions → notify   ← triggered synchronously by observer construction
at createQueries.svelte.js: $derived(new QueriesObserver(...))   ← THE BUG
```

### Root cause

`@tanstack/svelte-query@6.x` `createQueries` builds its observer **inside a
`$derived`**:

```js
const observer = $derived(new QueriesObserver(client, resolvedQueryOptions, combine))
```

The `QueriesObserver` constructor synchronously notifies the query cache. Any
cache subscriber backed by a Svelte `createSubscriber` — e.g. the
`useIsFetching` call inside our `SyncIndicator` — then writes to a Svelte
`source` **while the `$derived` is being evaluated**, which Svelte forbids
(`state_unsafe_mutation`).

`createQuery` / `createInfiniteQuery` / `createMutation` don't crash because
they create their observers in plain `$state` + effects (`watchChanges`)
instead of a `$derived`.

## 2. Upstream status (tracked 2026-08-27)

| Item | Status |
|---|---|
| TanStack PR that fixed the same error family | [TanStack/query#9493](https://github.com/TanStack/query/pull/9493) "fix(svelte-query): `state_unsafe_mutation` error with `useIs...`", merged 2025-09-27 |
| What #9493 fixed | `createQuery`, `createInfiniteQuery`, `createMutation` (observers moved to `$state` + `watchChanges`) |
| What #9493 **did not** fix | **`createQueries`** — its hunk only removed `untrack()` wrappers; the `$derived(new QueriesObserver(...))` remains |
| Installed version | `6.1.46` (latest on npm as of 2026-08-27) |
| Unreleased `main` branch | Still buggy — `packages/svelte-query/src/createQueries.svelte.ts:219` is `const observer = $derived(` |
| Open issue specifically for this | None found as of 2026-08-27 |

**Secondary upstream bug discovered while investigating:** upstream passes the
bare `combine` function to the `QueriesObserver` constructor, which expects an
options object `{ combine }`. The constructor reads `options?.combine`, so
**upstream's `createQueries` `combine` option silently never runs**. Even after
they fix the crash, test `combine` before migrating back (see §5).

### Where to watch for the fix

- This PR/issue trail: <https://github.com/TanStack/query/pull/9493> and the
  [svelte-query releases](https://github.com/TanStack/query/releases)
- Our tracker script (see §3) — the canonical signal
- The source file to eyeball on `main`:
  `packages/svelte-query/src/createQueries.svelte.ts` — fixed when the
  `$derived(new QueriesObserver` pattern is gone

## 3. How to check, later down the road

### Automated (recommended)

```bash
bun run check:createqueries-fix
```

- **Exit 0** → upstream still buggy; the vendored copy stays. Output says so.
- **Exit 1 + banner** → upstream fixed; the script prints the retirement steps.

The script (`scripts/check-createqueries-fix.mjs`) reads the **installed**
package at `node_modules/@tanstack/svelte-query/dist/createQueries.svelte.js`
and greps for the buggy pattern `$derived(new QueriesObserver`. It's safe to
run in CI — it only fails the build the day the migration becomes due.

### Manual

```bash
# 1. Is there a newer release?
npm view @tanstack/svelte-query version          # anything > 6.1.46 is worth checking

# 2. Does the installed package still construct the observer in a derived?
grep -n 'new QueriesObserver' node_modules/@tanstack/svelte-query/dist/createQueries.svelte.js

# 3. Does unreleased main still have it?
curl -s https://raw.githubusercontent.com/TanStack/query/main/packages/svelte-query/src/createQueries.svelte.ts | grep -n 'observer = \$derived'
```

Any output containing `$derived(new QueriesObserver` means **not fixed yet**.
When `grep` finds nothing (or the observer moved to `$state`/`watchChanges`),
proceed to §5.

## 4. The local workaround (current state)

| Piece | Location |
|---|---|
| Vendored `createQueries` (the fix) | `src/lib/queries/createQueries.svelte.ts` |
| Consumed by | `src/routes/dashboard/+page.svelte` (single observer, destructured into `[todayQuery, recentQuery, activeQuery]`) |
| README note | `README.md` → "Vendored `createQueries` (upstream bug)" |

**What changed vs upstream:** the observer is created in `$state` and re-created
in `watchChanges` pre-effects (the exact pattern the package's own fixed
`createBaseQuery` uses) instead of inside a `$derived`. `watchChanges` and
`createRawRef` are copied verbatim from the installed package so reactivity
semantics are identical. We also pass `{ combine }` to the constructor
(upstream passes the bare function, silently breaking `combine`).

**Type note:** single-observer `createQueries` can't infer per-query data
types, so the dashboard's three `data` reads cast
(`as PaginatedTimeEntries | undefined`, `as TimeEntry | undefined`). These
casts can be dropped if/when we migrate back and types infer.

## 5. Retirement checklist (when the tracker fires)

1. **Delete** `src/lib/queries/createQueries.svelte.ts` (contains the copied
   `watchChanges` / `createRawRef` — nothing else imports them).
2. **Update** `src/routes/dashboard/+page.svelte`:
   - `import { createQueries } from '$lib/queries/createQueries.svelte'` →
     `import { createQueries } from '@tanstack/svelte-query'`
   - Drop the `as PaginatedTimeEntries` / `as TimeEntry` casts if types infer.
3. **Remove** `scripts/check-createqueries-fix.mjs`, the
   `check:createqueries-fix` entry in `package.json`, and the README section.
4. **Before trusting `combine`** (if anyone uses it): verify it actually runs —
   upstream currently passes the bare function and its `combine` silently never
   executes (see §2). If still broken, keep the vendored `{ combine }` behavior.
5. **Verify**: `bun run check && bun run build`, then load the dashboard and
   confirm the `SyncIndicator` works alongside `createQueries` without
   `state_unsafe_mutation`.

## 6. Repro (for confidence)

The crash is deterministic on mount when **all** of these are true:

1. `createQueries` from `@tanstack/svelte-query` is used;
2. a `createSubscriber`-backed query-cache subscriber exists — our
   `SyncIndicator` (`useIsFetching`) is the one in this app; and
3. the queries already have cache state (restored persistence or a prior
   fetch) so the construction-time notify actually fires.

Removing any one of the three prevents the crash, which is why single
`createQuery` hooks and/or removing the `SyncIndicator` both "fix" it — but the
vendored fix (observer outside `$derived`) is the only complete one.
