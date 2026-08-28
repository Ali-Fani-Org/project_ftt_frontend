import {
	createInfiniteQuery,
	createMutation,
	createQuery,
	keepPreviousData,
	useQueryClient
} from '@tanstack/svelte-query';
import {
	projects,
	timeEntries as timeEntriesApi,
	type PaginatedTimeEntries,
	type TimeEntry
} from '$lib/api';
import { queryKeys } from './keys';
import { resolveTagsFromCache } from './tags';

/** Today's date (YYYY-MM-DD) in Asia/Tehran — the server's configured timezone. */
export function getTehranToday(): string {
	const now = new Date();
	const year = now.toLocaleString('en', { year: 'numeric', timeZone: 'Asia/Tehran' });
	const month = now.toLocaleString('en', { month: '2-digit', timeZone: 'Asia/Tehran' });
	const day = now.toLocaleString('en', { day: '2-digit', timeZone: 'Asia/Tehran' });
	return `${year}-${month}-${day}`;
}

export interface RevalidationOptions {
	/** Auto-refetch interval in ms, or `false` to disable (matches the old auto-refresh setting). */
	refetchInterval?: number | false;
}

// --- Projects -----------------------------------------------------------------

export function useProjects() {
	return createQuery(() => ({
		queryKey: queryKeys.projects,
		queryFn: () => projects.listFresh(),
		staleTime: 5 * 60_000
	}));
}

// --- Active timer -------------------------------------------------------------

export function useActiveTimer(options?: () => RevalidationOptions) {
	// The generic is explicit because the result can legitimately be `null`
	// ("no active timer"), which otherwise confuses createQuery's overloads and
	// widens `data` to `unknown`.
	return createQuery<TimeEntry | null>(() => {
		const opts = options?.() ?? {};
		return {
			queryKey: queryKeys.timeEntries.active,
			queryFn: () => timeEntriesApi.getCurrentActive(),
			// Always stale: the active timer must reflect the server, so every
			// mount/focus/reconnect refetches it instead of trusting a cached
			// (possibly synthetic or stale) entry.
			staleTime: 0,
			refetchInterval: opts.refetchInterval ?? false
		};
	});
}

// --- Today's sessions ----------------------------------------------------------

/** Completed (non-active) sessions from today, newest first, capped at 5. */
export function useTodaySessions(options?: () => RevalidationOptions) {
	return createQuery(() => ({
		queryKey: queryKeys.timeEntries.today(getTehranToday()),
		queryFn: async () => {
			const dateStr = getTehranToday();
			const response = await timeEntriesApi.listWithFilters({
				start_date_after_tz: dateStr,
				start_date_before_tz: dateStr,
				ordering: '-start_time'
			});
			const entries = Array.isArray(response) ? response : response?.results || [];
			const completed = entries.filter((entry) => !entry.is_active).slice(0, 5);
			return completed;
		},
		staleTime: 15_000,
		refetchInterval: options ? (options().refetchInterval ?? false) : false
	}));
}

// --- Recent entries (title-based suggestions) ---------------------------------

/**
 * Recent completed entries (newest first) used by the timer page to suggest a
 * project + tags as the user types a task title. Shares the cache prefix with
 * every other time-entry list, so edits invalidate it automatically.
 */
export function useRecentEntriesForSuggestions(limit = 300) {
	return createQuery(() => ({
		queryKey: queryKeys.timeEntries.suggestions(limit),
		queryFn: async () => {
			const response = await timeEntriesApi.listWithFilters({
				ordering: '-start_time',
				limit
			});
			const entries = Array.isArray(response) ? response : response.results;
			return entries.filter((entry) => !entry.is_active);
		},
		staleTime: 5 * 60_000
	}));
}

// --- Full range fetches (charts) ------------------------------------------------

/**
 * Fetch EVERY page of time entries within a `_tz` date range (used by the
 * dashboard charts, which need the complete dataset for a month/7 days).
 * Each page is cached by the api layer (fetchWithCache), and the aggregated
 * result is cached under a `range` query key so chart re-renders and navigation
 * don't re-fetch; edits invalidate it via queryKeys.timeEntries.all.
 */
export function useAllTimeEntriesInRange(
	startTz: () => string,
	endTz: () => string,
	options?: () => { refetchInterval?: number | false }
) {
	return createQuery(() => ({
		queryKey: queryKeys.timeEntries.range(startTz(), endTz()),
		queryFn: async () => {
			const all: TimeEntry[] = [];
			let cursor: string | undefined;
			let hasMore = true;
			while (hasMore) {
				const page = await timeEntriesApi.listWithFilters({
					start_date_after_tz: startTz(),
					start_date_before_tz: endTz(),
					limit: 200,
					cursor
				});
				all.push(...page.results);
				if (page.next) {
					cursor = new URL(page.next).searchParams.get('cursor') ?? undefined;
					hasMore = !!cursor;
				} else {
					hasMore = false;
				}
			}
			return all;
		},
		staleTime: 5 * 60_000,
		refetchInterval: options ? (options().refetchInterval ?? false) : false
	}));
}

// --- Filtered lists (entries / reports / dashboard) ----------------------------

export interface TimeEntryFilters {
	start_date_after?: string;
	start_date_before?: string;
	start_date_after_tz?: string;
	start_date_before_tz?: string;
	end_date_after?: string;
	end_date_before?: string;
	end_date_after_tz?: string;
	end_date_before_tz?: string;
	duration_min?: string;
	duration_max?: string;
	project?: number;
	cursor?: string;
	limit?: number;
	ordering?: string;
	[key: string]: string | number | undefined;
}

export interface FilteredTimeEntriesOptions {
	/** Auto-refetch interval in ms, or `false` to disable. */
	refetchInterval?: number | false;
	/** Keep the previous page/data visible while the next fetch is in flight (pagination & filter changes). */
	keepPreviousData?: boolean;
}

export function useFilteredTimeEntries(
	filters: () => TimeEntryFilters,
	options?: () => FilteredTimeEntriesOptions
) {
	return createQuery(() => {
		const opts = options?.() ?? {};
		return {
			queryKey: queryKeys.timeEntries.filtered(filters()),
			queryFn: async () => {
				const result = await timeEntriesApi.listWithFilters(filters());
				const data: PaginatedTimeEntries = Array.isArray(result)
					? { results: result, next: null, previous: null }
					: result;
				return data;
			},
			placeholderData: opts.keepPreviousData ? keepPreviousData : undefined,
			staleTime: 30_000,
			refetchInterval: opts.refetchInterval ?? false
		};
	});
}

/**
 * Cursor-paginated list (entries page). Each filter/sort combination is its own
 * infinite query; pages accumulate under one key so prev/next navigation is
 * instant and never refetches pages already loaded. The backend signals the
 * cursor via `next`/`previous` URLs, which getNext/getPreviousPageParam turn
 * into the `pageParam` passed to the queryFn.
 */
export function useInfiniteTimeEntries(
	filters: () => Omit<TimeEntryFilters, 'cursor'>,
	options?: () => FilteredTimeEntriesOptions
) {
	return createInfiniteQuery<PaginatedTimeEntries>(() => {
		const opts = options?.() ?? {};
		const base = filters();
		return {
			queryKey: queryKeys.timeEntries.infinite(base),
			queryFn: async ({ pageParam }) => {
				const result = await timeEntriesApi.listWithFilters({
					...base,
					cursor: pageParam as string | undefined
				});
				return Array.isArray(result) ? { results: result, next: null, previous: null } : result;
			},
			initialPageParam: undefined as string | undefined,
			getNextPageParam: (lastPage) => (lastPage.next ? extractCursor(lastPage.next) : undefined),
			getPreviousPageParam: (firstPage) =>
				firstPage.previous ? extractCursor(firstPage.previous) : undefined,
			placeholderData: opts.keepPreviousData ? keepPreviousData : undefined,
			staleTime: 30_000,
			refetchInterval: opts.refetchInterval ?? false
		};
	});
}

/**
 * Fetch EVERY page of time entries matching the given filters (used by the
 * entries page for exact range totals and CSV export). Cached per filter set;
 * invalidated by queryKeys.timeEntries.all like every other time-entry query.
 */
export function useAllFilteredTimeEntries(
	filters: () => Omit<TimeEntryFilters, 'cursor'>,
	options?: () => FilteredTimeEntriesOptions
) {
	return createQuery(() => {
		const opts = options?.() ?? {};
		return {
			queryKey: queryKeys.timeEntries.filteredAll(filters()),
			queryFn: async () => {
				const all: TimeEntry[] = [];
				let cursor: string | undefined;
				let hasMore = true;
				while (hasMore) {
					const page = await timeEntriesApi.listWithFilters({
						...filters(),
						limit: 200,
						cursor
					});
					all.push(...page.results);
					if (page.next) {
						cursor = new URL(page.next).searchParams.get('cursor') ?? undefined;
						hasMore = !!cursor;
					} else {
						hasMore = false;
					}
				}
				return all;
			},
			placeholderData: opts.keepPreviousData ? keepPreviousData : undefined,
			staleTime: 60_000,
			refetchInterval: opts.refetchInterval ?? false
		};
	});
}

/** Extract the `cursor` query param from a pagination URL like the backend's next/previous links. */
function extractCursor(url: string): string | undefined {
	try {
		return new URL(url).searchParams.get('cursor') ?? undefined;
	} catch {
		return undefined;
	}
}

// --- Mutations (writes auto-invalidate every time-entry query) ------------------

export function useStartTimerMutation() {
	const queryClient = useQueryClient();
	return createMutation(() => ({
		mutationFn: (data: Parameters<typeof timeEntriesApi.start>[0]) => timeEntriesApi.start(data),
		// NO optimistic write on purpose: a synthetic "running" entry would show
		// a timer the server never created if the request fails or the app
		// closes mid-flight (and it could be persisted across restarts). The
		// page's `isStartingTimer` state covers the pending window, and the real
		// server entry replaces it on success.
		onSettled: () => {
			void queryClient.invalidateQueries({ queryKey: queryKeys.timeEntries.all });
		},
		onSuccess: (entry) => {
			queryClient.setQueryData(queryKeys.timeEntries.active, entry);
		}
	}));
}

export function useStopTimerMutation() {
	const queryClient = useQueryClient();
	return createMutation(() => ({
		mutationFn: (id: number) => timeEntriesApi.stop(id),
		// Optimistic: clear the active timer instantly (the ticking UI stops), and
		// restore it if the stop fails.
		onMutate: async (id) => {
			await queryClient.cancelQueries({ queryKey: queryKeys.timeEntries.active });
			const previous = queryClient.getQueryData<TimeEntry | null>(queryKeys.timeEntries.active);
			queryClient.setQueryData(queryKeys.timeEntries.active, null);
			return { previous };
		},
		onError: (_err, _id, context) => {
			queryClient.setQueryData(queryKeys.timeEntries.active, context?.previous ?? null);
		},
		onSettled: () => {
			void queryClient.invalidateQueries({ queryKey: queryKeys.timeEntries.all });
		}
	}));
}

export function useUpdateTimeEntryMutation() {
	const queryClient = useQueryClient();
	return createMutation(() => ({
		mutationFn: ({ id, data }: { id: number; data: Parameters<typeof timeEntriesApi.update>[1] }) =>
			timeEntriesApi.update(id, data),
		// Optimistic: apply the edited title/description to every cached list entry
		// (and the active entry) immediately, roll back on failure. The global
		// mutationCache onError surfaces failures as a toast.
		onMutate: async ({ id, data }) => {
			await queryClient.cancelQueries({ queryKey: queryKeys.timeEntries.all });

			const patch = (entry: TimeEntry): TimeEntry => ({
				...entry,
				title: data.title ?? entry.title,
				description: data.description !== undefined ? (data.description ?? '') : entry.description,
				tags: data.tags !== undefined ? resolveTagsFromCache(data.tags) : entry.tags
			});

			const activeEntry = queryClient.getQueryData<TimeEntry | null>(queryKeys.timeEntries.active);
			const previousActive = activeEntry;

			queryClient.setQueriesData<TimeEntry>(
				{ queryKey: queryKeys.timeEntries.all, type: 'active' },
				(old) => (old ? patch(old) : old)
			);

			if (activeEntry) {
				queryClient.setQueryData(queryKeys.timeEntries.active, patch(activeEntry));
			}

			return { previousActive };
		},
		onError: (_err, _vars, context) => {
			if (context?.previousActive !== undefined) {
				queryClient.setQueryData(queryKeys.timeEntries.active, context.previousActive);
			}
		},
		onSettled: () => {
			void queryClient.invalidateQueries({ queryKey: queryKeys.timeEntries.all });
		},
		onSuccess: (entry) => {
			if (entry.is_active) {
				queryClient.setQueryData(queryKeys.timeEntries.active, entry);
			}
		}
	}));
}
