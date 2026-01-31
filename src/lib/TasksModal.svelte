<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { authToken } from '$lib/stores';
	import { timeEntries, type PaginatedTimeEntries, type TimeEntry } from '$lib/api';
	import { get } from 'svelte/store';
	import { createEventDispatcher } from 'svelte';

	const dispatch = createEventDispatcher();

	let data = $state<PaginatedTimeEntries | null>(null);
	let loading = $state(true);
	let error = $state('');

	// Pagination state
	let currentCursor = $state<string | null>(null);
	let hasNext = $state(false);
	let hasPrevious = $state(false);

	onMount(async () => {
		const token = get(authToken);
		if (!token) {
			goto('/');
			return;
		}

		await loadData();
	});

	async function loadData(cursor?: string | null) {
		try {
			loading = true;
			error = '';
			const result = await timeEntries.list(cursor || undefined);
			data = result;
			currentCursor = cursor || null;
			hasNext = !!result.next;
			hasPrevious = !!result.previous;
		} catch (err) {
			error = 'Failed to load time entries';
			console.error(err);
		} finally {
			loading = false;
		}
	}

	function extractCursor(url: string): string | null {
		const urlObj = new URL(url);
		return urlObj.searchParams.get('cursor');
	}

	async function goToNext() {
		if (data?.next) {
			const cursor = extractCursor(data.next);
			await loadData(cursor);
		}
	}

	async function goToPrevious() {
		if (data?.previous) {
			const cursor = extractCursor(data.previous);
			await loadData(cursor);
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
