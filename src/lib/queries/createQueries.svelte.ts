/**
 * Vendored `createQueries` with an upstream bug fixed.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * `@tanstack/svelte-query@6.1.46` (latest as of 2026-08-27) constructs its
 * `QueriesObserver` inside a `$derived`:
 *
 *     const observer = $derived(new QueriesObserver(client, resolvedQueryOptions, combine))
 *
 * The constructor synchronously notifies the query cache. Any cache subscriber
 * backed by a Svelte `createSubscriber` — e.g. the `useIsFetching` inside our
 * `SyncIndicator` — then writes to a Svelte `source` while the `$derived` is
 * being evaluated, which throws:
 *
 *     Svelte error: state_unsafe_mutation
 *     Updating state inside `$derived(...)` is forbidden.
 *
 * Only the dashboard crashed because it was the only page using `createQueries`.
 * Upstream PR TanStack/query#9493 fixed the same `state_unsafe_mutation` for
 * `createQuery` / `createInfiniteQuery` / `createMutation` (their observers now
 * live in `$state` + effects via `watchChanges`) but NOT for `createQueries` —
 * it still has the `$derived` observer on `main` at the time of writing.
 *
 * THE FIX
 * -------
 * This module is the upstream implementation with the observer moved out of the
 * `$derived` into `$state` + `watchChanges` effects, exactly mirroring how the
 * package's own fixed `createBaseQuery` works. Everything else (keys, cache
 * semantics, `_optimisticResults`, subscribe/update flow) is identical.
 *
 * WHEN TO DELETE THIS FILE
 * ------------------------
 * Run `bun run check:createqueries-fix`. It inspects the installed package and
 * prints a loud banner (and exits non-zero) the moment upstream lands the fix.
 * Then:
 *   1. Delete this file.
 *   2. In `src/routes/dashboard/+page.svelte`, import `createQueries` from
 *      `'@tanstack/svelte-query'` again.
 *   3. Remove the script + README note.
 *
 * Full background + the retirement checklist: docs/createqueries-upstream-bug.md
 */
import { QueriesObserver } from '@tanstack/svelte-query';
import type {
	QueryClient,
	QueryObserverOptions,
	QueryObserverResult
} from '@tanstack/svelte-query';
import { useIsRestoring, useQueryClient } from '@tanstack/svelte-query';
import { untrack } from 'svelte';
import { SvelteSet } from 'svelte/reactivity';

// --- watchChanges (copied verbatim from the package's utils.svelte.ts) --------

type Getter<T> = () => T;

function runEffect(flush: 'post' | 'pre', effect: () => void | VoidFunction): void {
	switch (flush) {
		case 'post':
			$effect(effect);
			break;
		case 'pre':
			$effect.pre(effect);
			break;
	}
}

/**
 * Runs `effect` on every change of the tracked `sources` after the first run,
 * mirroring the semantics the fixed `createBaseQuery` relies on.
 */
export const watchChanges = <T>(
	sources: Getter<T> | Array<Getter<T>>,
	flush: 'post' | 'pre',
	effect: (values: T | Array<T>, previousValues: T | undefined | Array<T | undefined>) => void
): void => {
	let active = false;
	let previousValues: T | undefined | Array<T | undefined> = Array.isArray(sources)
		? []
		: undefined;
	runEffect(flush, () => {
		const values = Array.isArray(sources) ? sources.map((source) => source()) : sources();
		if (!active) {
			active = true;
			previousValues = values;
			return;
		}
		const cleanup = untrack(() => effect(values, previousValues));
		previousValues = values;
		return cleanup;
	});
};

// --- createRawRef (copied verbatim from the package's containers.svelte.js) ----

const lazyBrand = Symbol('LazyValue');

function brand(fn: () => unknown): () => unknown {
	// @ts-expect-error - marker symbol for lazily-evaluated values
	fn[lazyBrand] = true;
	return fn;
}

function isBranded(fn: unknown): boolean {
	return (
		typeof fn === 'function' &&
		Boolean((fn as unknown as Record<PropertyKey, unknown>)[lazyBrand])
	);
}

type RawRefObject = Record<PropertyKey, unknown>;

/**
 * Makes all of the top-level keys of an object into `$state.raw` fields whose
 * initial values are the same as in the original object. Does not mutate the
 * original object. Provides an `update` function that can replace all of the
 * object's top-level keys while maintaining the original root object's reference
 * (required so destructured results stay reactive).
 */
function createRawRef<T>(init: T): [T, (newValue: T) => void] {
	const refObj = (Array.isArray(init) ? [] : {}) as RawRefObject;
	const hiddenKeys = new SvelteSet();
	// Absent keys have no `$state.raw` field to subscribe to, and `length` is a
	// plain array property, so reads of either are tracked through this instead.
	let keyVersion = $state.raw(0);
	const trackKeys = () => keyVersion;

	const out = new Proxy(refObj, {
		get(target, prop, receiver) {
			if (
				hiddenKeys.has(prop) ||
				!(prop in target) ||
				(Array.isArray(target) && prop === 'length')
			) {
				trackKeys();
			}
			return Reflect.get(target, prop, receiver);
		},
		set(target, prop, value, receiver) {
			hiddenKeys.delete(prop);
			if (prop in target) {
				return Reflect.set(target, prop, value, receiver);
			}
			let state = $state.raw(value);
			Object.defineProperty(target, prop, {
				configurable: true,
				enumerable: true,
				get: () => {
					// Lazy values (TanStack result objects use getters to track access)
					// are wrapped in a branded function and only invoked on read.
					return state && isBranded(state) ? state() : state;
				},
				set: (v) => {
					state = v;
				}
			});
			return true;
		},
		has(target, prop) {
			if (hiddenKeys.has(prop)) {
				return false;
			}
			return prop in target;
		},
		ownKeys(target) {
			return Reflect.ownKeys(target).filter((key) => !hiddenKeys.has(key));
		},
		getOwnPropertyDescriptor(target, prop) {
			if (hiddenKeys.has(prop)) {
				return undefined;
			}
			return Reflect.getOwnPropertyDescriptor(target, prop);
		},
		deleteProperty(target, prop) {
			if (prop in target) {
				// Setting the value to undefined signals listeners the value changed;
				// a bare delete would leave reactivity unaware the key is gone.
				target[prop] = undefined;
				hiddenKeys.add(prop);
				if (Array.isArray(target)) {
					target.length--;
				}
				return true;
			}
			return false;
		}
	}) as T;

	function update(newValue: T) {
		const existingKeys = Object.keys(out as unknown as RawRefObject);
		const newKeys = Object.keys(newValue as unknown as RawRefObject);
		const keysToRemove = existingKeys.filter((key) => !newKeys.includes(key));
		// Arrays: delete in descending index order so each `deleteProperty` trap
		// sees the slot it is removing as the current tail (length-- stays valid).
		if (Array.isArray(newValue)) {
			keysToRemove.sort((a, b) => Number(b) - Number(a));
		}
		const keysAdded = newKeys.some((key) => !existingKeys.includes(key));
		for (const key of keysToRemove) {
			delete (out as unknown as RawRefObject)[key];
		}
		for (const key of newKeys) {
			// The result objects define getters for all keys that track property
			// access; accessing them eagerly here would track everything, so the
			// access is deferred through the lazy brand wrapper.
			(out as unknown as RawRefObject)[key] = brand(
				() => (newValue as unknown as RawRefObject)[key]
			);
		}
		if (keysAdded || keysToRemove.length > 0) {
			keyVersion++;
		}
	}

	update(init);
	return [out, update];
}

// --- createQueries (upstream implementation, observer fix applied) ------------

export interface CreateQueriesOptions<TCombinedResult> {
	queries: Array<QueryObserverOptions>;
	// Must match query-core's `CombineFn` exactly (defaulted generics) or the
	// QueriesObserver constructor / setQueries reject it.
	combine?: (results: Array<QueryObserverResult>) => TCombinedResult;
}

/**
 * Runs multiple queries in a single `QueriesObserver` — same API and semantics
 * as `createQueries` from `@tanstack/svelte-query`, minus the `state_unsafe_mutation`
 * crash. See the module header for why this vendored copy exists.
 */
export function createQueries<TCombinedResult = Array<QueryObserverResult<unknown, unknown>>>(
	createQueriesOptions: () => CreateQueriesOptions<TCombinedResult>,
	queryClient?: () => QueryClient
): TCombinedResult {
	const client = $derived(useQueryClient(queryClient?.()));
	const isRestoring = useIsRestoring();
	const { queries, combine } = $derived.by(createQueriesOptions);
	const resolvedQueryOptions = $derived(
		queries.map((opts) => {
			const resolvedOptions = client.defaultQueryOptions(opts);
			// Make sure the results are already in fetching state before
			// subscribing or updating options.
			resolvedOptions._optimisticResults = isRestoring.current
				? 'isRestoring'
				: 'optimistic';
			return resolvedOptions;
		})
	);

	// FIXED vs upstream: the observer is created in `$state` and re-created in a
	// pre-effect, NOT inside a `$derived`. Constructing a QueriesObserver
	// synchronously notifies the query cache; doing that during derived
	// evaluation writes Svelte state from inside a `$derived` and throws
	// `state_unsafe_mutation` whenever a `createSubscriber`-backed cache
	// subscriber exists (e.g. `useIsFetching` in SyncIndicator).
	//
	// The constructor takes an options OBJECT ({ combine }), not the bare
	// combine function — upstream casts the function (so its combine silently
	// never applies); passing the object is correct at both type and runtime.
	// svelte-ignore state_referenced_locally - intentional, initial value
	let observer = $state(
		new QueriesObserver<TCombinedResult>(client, resolvedQueryOptions, { combine })
	);
	watchChanges(() => client, 'pre', () => {
		observer = new QueriesObserver<TCombinedResult>(client, resolvedQueryOptions, {
			combine
		});
	});

	function createResult(): TCombinedResult {
		const [_, getCombinedResult, trackResult] = observer.getOptimisticResult(
			resolvedQueryOptions,
			combine
		);
		return getCombinedResult(trackResult());
	}

	// svelte-ignore state_referenced_locally - intentional, initial value
	const [results, update] = createRawRef<TCombinedResult>(createResult());

	$effect(() => {
		const unsubscribe = isRestoring.current
			? () => undefined
			: observer.subscribe(() => update(createResult()));
		return unsubscribe;
	});

	watchChanges(
		() => resolvedQueryOptions,
		'pre',
		() => {
			observer.setQueries(resolvedQueryOptions, {
				combine
			});
			update(createResult());
		}
	);

	watchChanges(
		() => [resolvedQueryOptions, observer],
		'pre',
		() => {
			// Re-sync when `isRestoring` flips (same rationale as createBaseQuery):
			// without subscribing while restoring, the restored-but-not-fetched
			// state could be missed.
			update(createResult());
		}
	);

	return results;
}
