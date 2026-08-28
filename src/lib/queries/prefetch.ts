import { queryClient } from '$lib/queryClient';
import { queryKeys } from './keys';
import { projects, tags, timeEntries } from '$lib/api';
import { getTehranToday } from './timeEntries';
import { getTimeRangeDates, getPreviousRange } from '$lib/reports/analytics';

/** YYYY-MM-DD in the browser's local timezone (mirrors the pages' date helpers). */
function formatLocalDate(date: Date): string {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, '0');
	const day = String(date.getDate()).padStart(2, '0');
	return `${year}-${month}-${day}`;
}

/** Monday of the current week (local time), mirroring dashboard's getWeekStart(). */
function getWeekStartLocal(): string {
	const now = new Date();
	const daysSinceMonday = (now.getDay() + 6) % 7;
	const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysSinceMonday);
	return formatLocalDate(monday);
}

/** Today in UTC (YYYY-MM-DD), mirroring dashboard's getTodayRange() which uses toISOString(). */
function getUtcToday(): string {
	return new Date().toISOString().split('T')[0];
}

/**
 * Run a callback when the browser is idle (never competing with real
 * interaction work). Falls back to a short timeout where the API is missing.
 */
export function onIdle(fn: () => void, timeout = 2000): void {
	if (typeof window === 'undefined') return;
	if ('requestIdleCallback' in window) {
		requestIdleCallback(() => fn(), { timeout });
	} else {
		setTimeout(fn, 50);
	}
}

/**
 * Warm routes one per idle slot — each prefetch only starts once the browser is
 * idle again, so a long list of warmups naturally yields to user activity.
 */
export function idlePrefetchRoutes(paths: string[]): void {
	const warmNext = (remaining: string[]): void => {
		const [next, ...rest] = remaining;
		if (!next) return;
		onIdle(() => {
			prefetchRoute(next);
			warmNext(rest);
		});
	};
	warmNext(paths);
}

/**
 * Prefetch the queries a route will need, keyed exactly like the page's hooks
 * (see useProjects / useActiveTimer / useTodaySessions / useFilteredTimeEntries),
 * so the moment the user lands on that page the data is already in the cache.
 *
 * Keys MUST stay in sync with the pages — a mismatched key warms a cache entry
 * nothing reads, which is pure wasted bandwidth.
 *
 * Fire-and-forget: failures are logged by TanStack's query cache and simply mean
 * the page fetches on mount as usual.
 */
export function prefetchRoute(path: string): void {
	switch (path) {
		case '/timer': {
			void queryClient.prefetchQuery({
				queryKey: queryKeys.projects,
				queryFn: () => projects.listFresh(),
				meta: { prefetch: true }
			});
			void queryClient.prefetchQuery({
				queryKey: queryKeys.timeEntries.active,
				queryFn: () => timeEntries.getCurrentActive(),
				meta: { prefetch: true }
			});
			void queryClient.prefetchQuery({
				queryKey: queryKeys.timeEntries.today(getTehranToday()),
				queryFn: async () => {
					// Mirror useTodaySessions: completed sessions only, newest first, capped at 5.
					const dateStr = getTehranToday();
					const response = await timeEntries.listWithFilters({
						start_date_after_tz: dateStr,
						start_date_before_tz: dateStr,
						ordering: '-start_time'
					});
					const entries = Array.isArray(response) ? response : response?.results || [];
					return entries.filter((entry) => !entry.is_active).slice(0, 5);
				}
			});
			// Autocomplete suggestions for the timer title input
			// (mirrors useRecentEntriesForSuggestions).
			void queryClient.prefetchQuery({
				queryKey: queryKeys.timeEntries.suggestions(300),
				queryFn: async () => {
					const response = await timeEntries.listWithFilters({
						ordering: '-start_time',
						limit: 300
					});
					const entries = Array.isArray(response) ? response : response.results;
					return entries.filter((entry) => !entry.is_active);
				}
			});
			break;
		}

		case '/settings':
			void queryClient.prefetchQuery({
				queryKey: queryKeys.tags.list(),
				queryFn: () => tags.list(),
				meta: { prefetch: true }
			});
			void queryClient.prefetchQuery({
				queryKey: queryKeys.projects,
				queryFn: () => projects.listFresh(),
				meta: { prefetch: true }
			});
			break;

		case '/dashboard': {
			// Mirrors dashboard/+page.svelte's createQueries exactly:
			// today strip (UTC dates), recent activity, week summary, active timer.
			const today = getUtcToday();
			const weekStart = getWeekStartLocal();
			void queryClient.prefetchQuery({
				queryKey: queryKeys.timeEntries.filtered({
					start_date_after_tz: today,
					start_date_before_tz: today,
					limit: 100
				}),
				queryFn: () =>
					timeEntries.listWithFilters({
						start_date_after_tz: today,
						start_date_before_tz: today,
						limit: 100
					})
			});
			void queryClient.prefetchQuery({
				queryKey: queryKeys.timeEntries.filtered({ limit: 10 }),
				queryFn: () => timeEntries.listWithFilters({ limit: 10 }),
				meta: { prefetch: true }
			});
			void queryClient.prefetchQuery({
				queryKey: queryKeys.timeEntries.filtered({
					start_date_after_tz: weekStart,
					limit: 500
				}),
				queryFn: () =>
					timeEntries.listWithFilters({
						start_date_after_tz: weekStart,
						limit: 500
					})
			});
			void queryClient.prefetchQuery({
				queryKey: queryKeys.tags.list(),
				queryFn: () => tags.list(),
				meta: { prefetch: true }
			});
			void queryClient.prefetchQuery({
				queryKey: queryKeys.timeEntries.active,
				queryFn: () => timeEntries.getCurrentActive(),
				meta: { prefetch: true }
			});
			break;
		}

		case '/entries': {
			// Mirror useInfiniteTimeEntries: first page only (getNextPageParam keeps
			// the infinite query shape), keyed so the page's hook gets a cache hit.
			const filters = { ordering: '-start_time' } as const;
			void queryClient.prefetchInfiniteQuery({
				queryKey: queryKeys.timeEntries.infinite(filters),
				queryFn: ({ pageParam }) =>
					timeEntries.listWithFilters({
						...filters,
						cursor: pageParam as string | undefined
					}),
				initialPageParam: undefined as string | undefined,
				getNextPageParam: (lastPage: { next: string | null }) => {
					if (!lastPage.next) return undefined;
					try {
						return new URL(lastPage.next).searchParams.get('cursor') ?? undefined;
					} catch {
						return undefined;
					}
				}
			});
			break;
		}

		case '/reports': {
			// Reports defaults to "this month" and renders current-vs-previous
			// deltas, so warm both ranges with the exact keys/filters the page uses.
			const range = getTimeRangeDates('thismonth');
			const prev = getPreviousRange('thismonth');
			const currentFilters = {
				start_date_after_tz: range.start ?? undefined,
				start_date_before_tz: range.end ?? undefined,
				limit: 500
			};
			void queryClient.prefetchQuery({
				queryKey: queryKeys.timeEntries.filtered(currentFilters),
				queryFn: () => timeEntries.listWithFilters(currentFilters)
			});
			const prevFilters = {
				start_date_after_tz: prev.start ?? '1970-01-01',
				start_date_before_tz: prev.end ?? '1970-01-02',
				limit: 500
			};
			void queryClient.prefetchQuery({
				queryKey: queryKeys.timeEntries.filtered(prevFilters),
				queryFn: () => timeEntries.listWithFilters(prevFilters)
			});
			break;
		}
	}
}

type InfiniteEntriesData = {
	pages: { next: string | null }[];
	pageParams: unknown[];
};

/**
 * Warm page 2 of the entries infinite list in the background once exactly one
 * page is cached. Fetches the `next` cursor manually and appends it to the
 * query cache — deterministic, no refetch of page 1 (which is still fresh),
 * and safely dropped if the user pages or changes filters in the meantime.
 */
export function prefetchNextEntriesPage(filters: Record<string, unknown>): void {
	const queryKey = queryKeys.timeEntries.infinite(filters);
	const data = queryClient.getQueryData<InfiniteEntriesData>(queryKey);
	if (!data || data.pages.length !== 1 || !data.pages[0].next) return;

	const nextCursor = data.pages[0].next;
	void timeEntries
		.listWithFilters({
			...filters,
			cursor: nextCursor
		} as Parameters<typeof timeEntries.listWithFilters>[0])
		.then((page) => {
			queryClient.setQueryData<InfiniteEntriesData>(queryKey, (old) => {
				// Only merge if page 1 is still alone and still ends at the same cursor.
				if (!old || old.pages.length !== 1 || old.pages[0].next !== nextCursor) return old;
				return { pages: [...old.pages, page], pageParams: [...old.pageParams, nextCursor] };
			});
		})
		.catch(() => {
			// Background warm failed — the page fetches on demand as before.
		});
}
