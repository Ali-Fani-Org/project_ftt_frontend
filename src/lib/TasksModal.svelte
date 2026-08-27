<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import type { PaginatedTimeEntries } from '$lib/api';
	import { useFilteredTimeEntries, type TimeEntryFilters } from '$lib/queries/timeEntries';

	const dispatch = createEventDispatcher();

	// Pagination state
	let currentCursor = $state<string | null>(null);

	// Server state via TanStack Query — the cursor is part of the query key, so
	// each page is cached and navigating back and forth is instant. Edits made
	// elsewhere invalidate this list automatically via queryKeys.timeEntries.all.
	function getCurrentFilters(): TimeEntryFilters {
		return {
			cursor: currentCursor ?? undefined
		};
	}

	const entriesQuery = useFilteredTimeEntries(getCurrentFilters, () => ({
		keepPreviousData: true
	}));

	let data = $derived<PaginatedTimeEntries | null>(entriesQuery.data ?? null);
	let loading = $derived(entriesQuery.isPending);
	let error = $derived(
		!entriesQuery.data && entriesQuery.isError ? 'Failed to load time entries' : ''
	);
	let hasNext = $derived(!!data?.next);
	let hasPrevious = $derived(!!data?.previous);

	function extractCursor(url: string): string | null {
		const urlObj = new URL(url);
		return urlObj.searchParams.get('cursor');
	}

	function goToNext() {
		if (data?.next) {
			currentCursor = extractCursor(data.next);
		}
	}

	function goToPrevious() {
		if (data?.previous) {
			currentCursor = extractCursor(data.previous);
		}
	}

	function formatDate(dateStr: string): string {
		return new Date(dateStr).toLocaleString();
	}

	function formatDuration(duration: string | null): string {
		if (!duration) return 'Active';
		// Duration is now in seconds as string (e.g., "8.0", "127172.0")
		const totalSeconds = parseInt(duration, 10) || 0;
		const hours = Math.floor(totalSeconds / 3600);
		const minutes = Math.floor((totalSeconds % 3600) / 60);
		if (hours > 0) {
			return `${hours}h ${minutes}m`;
		}
		return `${minutes}m`;
	}

	function close() {
		dispatch('close');
	}
</script>

<div class="modal modal-open">
	<div class="modal-box w-11/12 max-w-7xl max-h-[95vh] overflow-hidden">
		<h3 class="font-bold text-xl mb-6">Time Entries</h3>

		{#if loading}
			<div class="flex justify-center py-8">
				<span class="loading loading-spinner loading-lg"></span>
			</div>
		{:else if error}
			<div class="alert alert-error">
				<span>{error}</span>
			</div>
		{:else if data}
			<div class="overflow-x-auto max-h-[70vh] overflow-y-auto">
				<table class="table table-zebra w-full text-sm">
					<thead class="sticky top-0 bg-base-100">
						<tr>
							<th>Title</th>
							<th>Description</th>
							<th>Project</th>
							<th>Start Time</th>
							<th>End Time</th>
							<th>Duration</th>
							<th>Status</th>
						</tr>
					</thead>
					<tbody>
						{#each data.results as entry (entry.id)}
							<tr>
								<td>{entry.title}</td>
								<td>{entry.description || '-'}</td>
								<td>{entry.project}</td>
								<td>{formatDate(entry.start_time)}</td>
								<td>{entry.end_time ? formatDate(entry.end_time) : '-'}</td>
								<td>{formatDuration(entry.duration)}</td>
								<td>
									<span class="badge {entry.is_active ? 'badge-success' : 'badge-neutral'}">
										{entry.is_active ? 'Active' : 'Completed'}
									</span>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>

			<!-- Pagination -->
			<div class="flex justify-center mt-6 space-x-3">
				<button class="btn btn-outline btn-sm" disabled={!hasPrevious} onclick={goToPrevious}>
					Previous
				</button>
				<button class="btn btn-outline btn-sm" disabled={!hasNext} onclick={goToNext}>
					Next
				</button>
			</div>
		{/if}

		<div class="modal-action">
			<button class="btn" onclick={close}>Close</button>
		</div>
	</div>
</div>
