/**
 * Central query-key factory. Every consumer shares these keys so that
 * invalidating `queryKeys.timeEntries.all` (a prefix match) refetches every
 * time-entry query: active timer, today's sessions, filtered lists, etc.
 */
export const queryKeys = {
	projects: ['projects'] as const,
	tags: {
		all: ['tags'] as const,
		list: () => [...queryKeys.tags.all, 'list'] as const
	},
	timeEntries: {
		all: ['time-entries'] as const,
		active: ['time-entries', 'active'] as const,
		today: (date: string) => ['time-entries', 'today', date] as const,
		filtered: (filters: Record<string, unknown>) => ['time-entries', 'filtered', filters] as const,
		filteredAll: (filters: Record<string, unknown>) =>
			['time-entries', 'filtered-all', filters] as const,
		infinite: (filters: Record<string, unknown>) => ['time-entries', 'infinite', filters] as const,
		range: (start: string, end: string) => ['time-entries', 'range', start, end] as const,
		report: (filters: object) => ['time-entries', 'report', filters] as const,
		stats: (filters: object) => ['time-entries', 'stats', filters] as const,
		suggestions: (limit: number) => ['time-entries', 'suggestions', limit] as const
	}
} as const;
