import { queryClient } from '$lib/queryClient';
import { queryKeys } from './keys';
import { projects, tags, timeEntries } from '$lib/api';
import { getTehranToday } from './timeEntries';

/** YYYY-MM-DD in the browser's local timezone (mirrors the pages' date helpers). */
function formatLocalDate(date: Date): string {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, '0');
	const day = String(date.getDate()).padStart(2, '0');
	return `${year}-${month}-${day}`;
}

/**
 * Prefetch the queries a route will need, keyed exactly like the page's hooks
 * (see useProjects / useActiveTimer / useTodaySessions / useFilteredTimeEntries),
 * so the moment the user lands on that page the data is already in the cache.
 *
 * Fire-and-forget: failures are logged by TanStack's query cache and simply mean
 * the page fetches on mount as usual.
 */
export function prefetchRoute(path: string): void {
	switch (path) {
		case '/timer':
			void queryClient.prefetchQuery({
				queryKey: queryKeys.projects,
				queryFn: () => projects.listFresh()
			});
			void queryClient.prefetchQuery({
				queryKey: queryKeys.timeEntries.active,
				queryFn: () => timeEntries.getCurrentActive()
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
			break;

		case '/settings':
			void queryClient.prefetchQuery({
				queryKey: queryKeys.tags.list(),
				queryFn: () => tags.list()
			});
			void queryClient.prefetchQuery({
				queryKey: queryKeys.projects,
				queryFn: () => projects.listFresh()
			});
			break;

		case '/dashboard': {
			const today = getTehranToday();
			void queryClient.prefetchQuery({
				queryKey: queryKeys.tags.list(),
				queryFn: () => tags.list()
			});
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
				queryKey: queryKeys.timeEntries.filtered({}),
				queryFn: () => timeEntries.listWithFilters({})
			});
			void queryClient.prefetchQuery({
				queryKey: queryKeys.timeEntries.active,
				queryFn: () => timeEntries.getCurrentActive()
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
			// Reports defaults to the last 30 days (local dates, like the page).
			const now = new Date();
			const start = new Date(now);
			start.setDate(now.getDate() - 30);
			const startStr = formatLocalDate(start);
			const endStr = formatLocalDate(now);
			void queryClient.prefetchQuery({
				queryKey: queryKeys.timeEntries.filtered({
					start_date_after_tz: startStr,
					start_date_before_tz: endStr,
					limit: 500
				}),
				queryFn: () =>
					timeEntries.listWithFilters({
						start_date_after_tz: startStr,
						start_date_before_tz: endStr,
						limit: 500
					})
			});
			break;
		}
	}
}
