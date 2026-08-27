#!/usr/bin/env node
/**
 * Tracks the upstream TanStack Query fix for the `createQueries` +
 * `useIsFetching` `state_unsafe_mutation` crash.
 *
 * Context: TanStack/query PR #9493 ("fix(svelte-query): `state_unsafe_mutation`
 * error with `useIs...`") fixed `createQuery` / `createInfiniteQuery` /
 * `createMutation`, but NOT `createQueries` — it still constructs its
 * `QueriesObserver` inside a `$derived` (verified against `main` as of
 * 2026-08-27). Until upstream lands that fix we keep a vendored copy at
 * `src/lib/queries/createQueries.svelte.ts`.
 *
 * This script inspects the INSTALLED package. While the bug is present it
 * prints an OK line and exits 0. The moment the installed package no longer
 * builds the observer inside `$derived` it prints a migration banner and exits
 * 1, so running `bun run check:createqueries-fix` (e.g. in CI) flags the
 * migration loudly.
 *
 * Migration steps when it fires:
 *   1. Delete src/lib/queries/createQueries.svelte.ts
 *   2. In src/routes/dashboard/+page.svelte import { createQueries } from
 *      '@tanstack/svelte-query' (drop the data casts if types now infer)
 *   3. Remove this script, the package.json script, and the README section
 *   4. Re-run `bun run check && bun run build`
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const distFile = resolve(
	root,
	'node_modules/@tanstack/svelte-query/dist/createQueries.svelte.js'
);

if (!existsSync(distFile)) {
	console.log(
		'[check-createqueries-fix] createQueries.svelte.js not found — the package layout changed; verify manually.'
	);
	process.exit(0);
}

const source = readFileSync(distFile, 'utf8');

// The buggy pattern: QueriesObserver constructed inside a `$derived`.
// The compiled dist puts it on one line: `const observer = $derived(new QueriesObserver(...)`.
const BUGGY = /\$derived\(\s*new QueriesObserver/;

if (BUGGY.test(source)) {
	console.log(
		'[check-createqueries-fix] OK — installed @tanstack/svelte-query still constructs QueriesObserver inside $derived.'
	);
	console.log(
		'[check-createqueries-fix] The vendored src/lib/queries/createQueries.svelte.ts remains necessary.'
	);
	process.exit(0);
}

console.log('==============================================================');
console.log('[check-createqueries-fix] UPSTREAM FIX DETECTED!');
console.log('The installed @tanstack/svelte-query no longer builds QueriesObserver');
console.log('inside `$derived`. The vendored createQueries can be retired.');
console.log('');
console.log('Actions:');
console.log('  1. Delete src/lib/queries/createQueries.svelte.ts');
console.log(
	'  2. In src/routes/dashboard/+page.svelte, import { createQueries } from "@tanstack/svelte-query"'
);
console.log(
	'     (and drop the `as PaginatedTimeEntries` / `as TimeEntry` data casts if types now infer)'
);
console.log('  3. Remove this script + the "check:createqueries-fix" script in package.json');
console.log('     + the README section');
console.log('  4. Re-run: bun run check && bun run build');
console.log('==============================================================');
process.exit(1);
