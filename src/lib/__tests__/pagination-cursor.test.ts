import { describe, it, expect, vi, beforeEach } from 'vitest';

// Regression tests for the entries page-2 warmer sending the backend's FULL
// `next` URL back as the `cursor` value (backend 404s on that, console showed
// `?cursor=http%3A%2F%2Fhr.alpharency.com%2F...`). Only the opaque `cursor`
// query param may ever be sent back.
const mocks = vi.hoisted(() => ({
	listWithFilters: vi.fn(),
	getQueryData: vi.fn(),
	setQueryData: vi.fn()
}));

vi.mock('@tanstack/svelte-query', () => ({
	createQuery: (fn: any) => fn(),
	createInfiniteQuery: (fn: any) => fn(),
	createMutation: (fn: any) => fn(),
	keepPreviousData: Symbol('keepPreviousData'),
	useQueryClient: () => ({})
}));

vi.mock('$lib/api', () => ({
	projects: {},
	tags: {},
	timeEntries: { listWithFilters: mocks.listWithFilters }
}));

vi.mock('$lib/queryClient', () => ({
	queryClient: {
		getQueryData: mocks.getQueryData,
		setQueryData: mocks.setQueryData
	}
}));

vi.mock('$lib/reports/analytics', () => ({
	getTimeRangeDates: vi.fn(),
	getPreviousRange: vi.fn()
}));

vi.mock('../queries/report', () => ({
	buildReportFilters: vi.fn()
}));

const BACKEND_NEXT_URL =
	'http://hr.alpharency.com/api/time_entries/?cursor=cD0yMDI2LTA4LTI0KzA3JTNBNTQlM0E1MSUyQjAwJTNBMDA%3D&ordering=-start_time';

describe('extractCursor', () => {
	it('returns the cursor param from an absolute next URL', async () => {
		const { extractCursor } = await import('../queries/timeEntries');
		expect(
			extractCursor('https://hr.alpharency.com/api/time_entries/?cursor=abc123&ordering=-start_time')
		).toBe('abc123');
	});

	it('decodes the opaque cursor from the backend http next URL (reported 404 shape)', async () => {
		const { extractCursor } = await import('../queries/timeEntries');
		const cursor = extractCursor(BACKEND_NEXT_URL);
		expect(cursor).toContain('cD0yMDI2');
		expect(cursor).not.toContain('http');
	});

	it('returns undefined when there is no cursor param or the URL is garbage', async () => {
		const { extractCursor } = await import('../queries/timeEntries');
		expect(extractCursor('https://hr.alpharency.com/api/time_entries/?ordering=-start_time')).toBeUndefined();
		expect(extractCursor('not a url')).toBeUndefined();
	});
});

describe('prefetchNextEntriesPage', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('sends the extracted cursor — never the full next URL', async () => {
		const { prefetchNextEntriesPage } = await import('../queries/prefetch');
		const filters = { ordering: '-start_time' };
		mocks.getQueryData.mockReturnValue({
			pages: [{ results: [], next: BACKEND_NEXT_URL, previous: null }],
			pageParams: [undefined]
		});
		mocks.listWithFilters.mockResolvedValue({ results: [], next: null, previous: null });

		prefetchNextEntriesPage(filters);

		await vi.waitFor(() => expect(mocks.listWithFilters).toHaveBeenCalledTimes(1));
		const sent = mocks.listWithFilters.mock.calls[0][0];
		expect(sent.cursor).toContain('cD0yMDI2');
		expect(sent.cursor).not.toContain('http');

		// Merged pageParams must hold the cursor too, so a later refetch of the
		// warmed page cannot replay the full URL as a cursor (second 404 source).
		expect(mocks.setQueryData).toHaveBeenCalledTimes(1);
		const updater = mocks.setQueryData.mock.calls[0][1];
		const merged = updater({
			pages: [{ results: [], next: BACKEND_NEXT_URL, previous: null }],
			pageParams: [undefined]
		});
		expect(merged.pageParams[1]).toBe(sent.cursor);
	});

	it('does nothing when there is no next page or the cursor is unparseable', async () => {
		const { prefetchNextEntriesPage } = await import('../queries/prefetch');
		mocks.getQueryData.mockReturnValue({ pages: [{ next: null }], pageParams: [undefined] });
		prefetchNextEntriesPage({ ordering: '-start_time' });
		expect(mocks.listWithFilters).not.toHaveBeenCalled();

		mocks.getQueryData.mockReturnValue({
			pages: [{ next: 'http://[::1' }],
			pageParams: [undefined]
		});
		prefetchNextEntriesPage({ ordering: '-start_time' });
		expect(mocks.listWithFilters).not.toHaveBeenCalled();
	});
});
