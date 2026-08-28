import { describe, it, expect, vi, beforeEach } from 'vitest';

// Shared mutable state for the module mocks below (vi.mock factories are
// hoisted above the imports, so they can only reference vi.hoisted values).
const mocks = vi.hoisted(() => ({
	mutationOptions: [] as any[],
	queryClientMock: {
		getQueryData: vi.fn(),
		setQueryData: vi.fn(),
		invalidateQueries: vi.fn(),
		cancelQueries: vi.fn()
	}
}));

vi.mock('@tanstack/svelte-query', () => ({
	createQuery: (fn: any) => fn(),
	createInfiniteQuery: (fn: any) => fn(),
	createMutation: (fn: any) => {
		const options = fn();
		mocks.mutationOptions.push(options);
		return options;
	},
	keepPreviousData: Symbol('keepPreviousData'),
	useQueryClient: () => mocks.queryClientMock
}));

vi.mock('$lib/api', () => ({
	projects: {},
	timeEntries: {}
}));

vi.mock('$lib/queryClient', () => ({
	queryClient: mocks.queryClientMock
}));

describe('useStartTimerMutation', () => {
	beforeEach(() => {
		mocks.mutationOptions.length = 0;
		vi.clearAllMocks();
	});

	it('performs no optimistic cache write (no onMutate / onError)', async () => {
		const { useStartTimerMutation } = await import('../queries/timeEntries');
		// The mocked createMutation returns the raw options object, while the real
		// hook is typed as a mutation result — cast to inspect the options.
		const options: any = useStartTimerMutation();

		// The phantom-timer bug: a synthetic "running" entry used to be written
		// into the active-timer cache before the POST completed, so a failed or
		// in-flight start could show a timer the server never created. There must
		// be no optimistic write anymore — the real entry appears only on success.
		expect(options.onMutate).toBeUndefined();
		expect(options.onError).toBeUndefined();
		expect(options.onSuccess).toBeTypeOf('function');
		expect(options.mutationFn).toBeTypeOf('function');
	});

	it('keeps the invalidation that re-syncs every time-entry query after settle', async () => {
		const { useStartTimerMutation } = await import('../queries/timeEntries');
		const options: any = useStartTimerMutation();

		options.onSettled?.();
		expect(mocks.queryClientMock.invalidateQueries).toHaveBeenCalledWith({
			queryKey: ['time-entries']
		});
	});
});
