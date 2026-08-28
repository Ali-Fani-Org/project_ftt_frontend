import { createQuery, keepPreviousData } from '@tanstack/svelte-query';
import { timeEntries, type ReportData, type ReportFilters } from '$lib/api';
import { queryKeys } from './keys';
import type { DateRange } from '$lib/reports/analytics';

export interface ReportQueryOptions {
	/** Auto-refetch interval in ms, or `false` to disable. */
	refetchInterval?: number | false;
	/** Keep the previous payload visible while the next fetch is in flight. */
	keepPreviousData?: boolean;
}

/**
 * Shared filter builder so the reports prefetch (prefetchRoute) warms the
 * exact cache key this hook reads. Undefined prev bounds fall back to the
 * server's same-length-window default.
 */
export function buildReportFilters(current: DateRange, prev: DateRange): ReportFilters {
	return {
		start_date_after_tz: current.start ?? '',
		start_date_before_tz: current.end ?? '',
		prev_start_date_after_tz: prev.start ?? undefined,
		prev_start_date_before_tz: prev.end ?? undefined
	};
}

/**
 * The reports page's single data source: one aggregated payload from
 * api/time_entries/report_data/ covering the current window, the previous
 * window (for deltas), and the recent-activity rows. Null data means offline
 * without a cached payload.
 */
export function useReportData(
	currentRange: () => DateRange,
	prevRange: () => DateRange,
	options?: () => ReportQueryOptions
) {
	return createQuery<ReportData | null>(() => {
		const opts = options?.() ?? {};
		const filters = buildReportFilters(currentRange(), prevRange());
		return {
			queryKey: queryKeys.timeEntries.report(filters),
			queryFn: () => timeEntries.reportData(filters),
			placeholderData: opts.keepPreviousData ? keepPreviousData : undefined,
			refetchInterval: opts.refetchInterval ?? false,
			// Custom range picked but not applied yet: no window, no request
			// (the server would 400 on empty bounds).
			enabled: Boolean(filters.start_date_after_tz && filters.start_date_before_tz)
		};
	});
}
