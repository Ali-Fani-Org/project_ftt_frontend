<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { authToken } from '$lib/stores';
	import { timeEntries, type PaginatedTimeEntries, type TimeEntry } from '$lib/api';
	import { get } from 'svelte/store';
	import TimeEntryDetailModal from '$lib/TimeEntryDetailModal.svelte';
	import { network } from '$lib/network';
	import DataFreshnessIndicator from '$lib/DataFreshnessIndicator.svelte';

	let data = $state<PaginatedTimeEntries | null>(null);
	let loading = $state(true);
	let error = $state('');
	let selectedEntry = $state<TimeEntry | null>(null);
	let isShowingCachedData = $state(false);

	// Pagination state
	let currentCursor = $state<string | null>(null);
	let hasNext = $state(false);
	let hasPrevious = $state(false);

	// Filter and sort state
	let selectedTimeRange = $state<string>('all'); // 'all', 'last7days', 'lastweek', 'thisweek', 'lastmonth', 'thismonth', 'thisyear', 'lastyear'
	let selectedSort = $state<string>('-start_time'); // default sort by start_time descending

	// Cache constants
	const CACHE_KEY = 'entries_list_cache';
	const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

	/**
	 * Save entries data to localStorage
	 */
	function saveToCache(entriesData: PaginatedTimeEntries | null): void {
		if (!entriesData) return;
		try {
			const cacheData = {
				data: entriesData,
				timestamp: Date.now()
			};
			localStorage.setItem(CACHE_KEY, JSON.stringify(cacheData));
		} catch (err) {
			console.warn('Failed to save entries to cache:', err);
		}
	}

	/**
	 * Load entries data from localStorage
	 */
	function loadFromCache(): PaginatedTimeEntries | null {
		try {
			const cached = localStorage.getItem(CACHE_KEY);
			if (!cached) return null;

			const parsed = JSON.parse(cached);
			const age = Date.now() - parsed.timestamp;

			// Check if cache is still valid
			if (age > CACHE_TTL) {
				localStorage.removeItem(CACHE_KEY);
				return null;
			}

			return parsed.data || null;
		} catch (err) {
			console.warn('Failed to load entries from cache:', err);
			return null;
		}
	}

	onMount(async () => {
		const token = get(authToken);
		if (!token) {
			goto('/');
			return;
		}

		// Add event listener to close dropdowns when clicking outside
		document.addEventListener('click', handleOutsideClick);

		// Load initial data
		await loadData();

		// Cleanup event listener on unmount
		return () => {
			document.removeEventListener('click', handleOutsideClick);
		};
	});

	function handleOutsideClick(event) {
		// Check if the click is inside a dropdown
		const isInsideDropdown = event.target.closest('.dropdown');

		if (!isInsideDropdown) {
			// Close all dropdowns by removing focus from dropdown buttons
			const dropdownButtons = document.querySelectorAll('.dropdown [tabindex="0"]');
			dropdownButtons.forEach((button) => {
				if (button instanceof HTMLElement) {
					button.blur();
				}
			});
		}
	}

	function getTimeRangeDates(range: string): { start: string | null; end: string | null } {
		const now = new Date();
		let start: Date | null = null;
		let end: Date | null = null;

		switch (range) {
			case 'last7days':
				start = new Date(now);
				start.setDate(now.getDate() - 7);
				end = now;
				break;
			case 'lastweek':
				// Calculate the start of last week (Monday of last week)
				const today = new Date(now);
				const dayOfWeek = today.getDay(); // 0 (Sunday) to 6 (Saturday)
				const daysSinceMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Adjust to get Monday
				start = new Date(today);
				start.setDate(today.getDate() - daysSinceMonday - 7); // Go back to Monday of last week
				end = new Date(start);
				end.setDate(end.getDate() + 6); // End of last week (Sunday)
				break;
			case 'thisweek':
				// Calculate the start of this week (Monday of this week)
				const thisToday = new Date(now);
				const thisDayOfWeek = thisToday.getDay(); // 0 (Sunday) to 6 (Saturday)
				const thisDaysSinceMonday = thisDayOfWeek === 0 ? 6 : thisDayOfWeek - 1; // Adjust to get Monday
				start = new Date(thisToday);
				start.setDate(thisToday.getDate() - thisDaysSinceMonday); // Go back to Monday of this week
				end = now;
				break;
			case 'lastmonth':
				start = new Date(now.getFullYear(), now.getMonth() - 1, 1); // First day of last month
				end = new Date(now.getFullYear(), now.getMonth(), 0); // Last day of last month
				break;
			case 'thismonth':
				start = new Date(now.getFullYear(), now.getMonth(), 1); // First day of this month
				end = now;
				break;
			case 'thisyear':
				start = new Date(now.getFullYear(), 0, 1); // First day of this year
				end = now;
				break;
			case 'lastyear':
				start = new Date(now.getFullYear() - 1, 0, 1); // First day of last year
				end = new Date(now.getFullYear() - 1, 11, 31); // Last day of last year
				break;
			default:
				return { start: null, end: null };
		}

		return {
			start: start ? start.toISOString().split('T')[0] : null,
			end: end ? end.toISOString().split('T')[0] : null
		};
	}

	function getTimeRangeDisplay(range: string): string {
		switch (range) {
			case 'last7days':
				return 'Last 7 Days';
			case 'lastweek':
				return 'Last Week';
			case 'thisweek':
				return 'This Week';
			case 'lastmonth':
				return 'Last Month';
			case 'thismonth':
				return 'This Month';
			case 'thisyear':
				return 'This Year';
			case 'lastyear':
				return 'Last Year';
			default:
				return 'All Time';
		}
	}

	function getSortDisplay(sort: string): string {
		switch (sort) {
			case '-start_time':
				return 'Start Time (Newest First)';
			case 'start_time':
				return 'Start Time (Oldest First)';
			case '-end_time':
				return 'End Time (Newest First)';
			case 'end_time':
				return 'End Time (Oldest First)';
			case '-duration':
				return 'Duration (Longest First)';
			case 'duration':
				return 'Duration (Shortest First)';
			case 'title':
				return 'Title (A-Z)';
			case '-title':
				return 'Title (Z-A)';
			case 'project_name':
				return 'Project (A-Z)';
			case '-project_name':
				return 'Project (Z-A)';
			case '-is_active':
				return 'Status (Active First)';
			case 'is_active':
				return 'Status (Completed First)';
			default:
				return 'Start Time (Newest First)';
		}
	}

	async function loadData(cursor?: string | null) {
		try {
			loading = true;
			error = '';
			isShowingCachedData = false;

			// Check if offline
			if (!$network.isOnline) {
				const cachedData = loadFromCache();
				if (cachedData) {
					data = cachedData;
					currentCursor = cursor || null;
					hasNext = !!cachedData.next;
					hasPrevious = !!cachedData.previous;
					isShowingCachedData = true;
					loading = false;
					return;
				}
				// If no cache available while offline, show error
				error = 'No cached data available. Please connect to the internet.';
				loading = false;
				return;
			}

			// Get time range filter parameters
			const timeRange = getTimeRangeDates(selectedTimeRange);

			// Use the timeEntries.listWithFilters function with all parameters
			const result = await timeEntries.listWithFilters({
				start_date_after: timeRange.start,
				start_date_before: timeRange.end,
				cursor: cursor || undefined,
				ordering: selectedSort
			});

			data = result;
			currentCursor = cursor || null;
			hasNext = !!result.next;
			hasPrevious = !!result.previous;

			// Save to cache for offline use
			saveToCache(result);
		} catch (err) {
			console.error('Error loading entries:', err);
			// Try to load from cache as fallback
			const cachedData = loadFromCache();
			if (cachedData) {
				data = cachedData;
				currentCursor = cursor || null;
				hasNext = !!cachedData.next;
				hasPrevious = !!cachedData.previous;
				isShowingCachedData = true;
				error = '';
				loading = false;
				return;
			}
			error = 'Failed to load time entries';
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

	function handleFilterChange() {
		// Reset to first page when filters change
		loadData();
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

	function getStatusBadge(entry: TimeEntry) {
		if (entry.is_active) {
			return { text: 'Active', class: 'badge-success' };
		} else {
			return { text: 'Completed', class: 'badge-neutral' };
		}
	}

	function openEntryModal(entry: TimeEntry) {
		selectedEntry = entry;
	}

	function closeEntryModal() {
		selectedEntry = null;
	}
</script>

<div class="container mx-auto p-4 lg:p-8">
	<div class="mb-8">
		<div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
			<div>
				<h1 class="text-3xl font-bold text-primary">Time Entries</h1>
				<p class="text-base-content/70">View and manage all your tracked time</p>
			</div>
			<DataFreshnessIndicator onRefresh={loadData} />
		</div>
	</div>

	<!-- Offline Warning -->
	{#if !$network.isOnline}
		<div class="alert alert-warning mb-6 shadow-lg">
			<div class="flex items-center gap-3">
				<svg class="w-6 h-6 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
				</svg>
				<div>
					<p class="font-medium">You are offline</p>
					<p class="text-sm opacity-80">Showing cached data. Some features may be limited.</p>
				</div>
			</div>
		</div>
	{/if}

	<!-- Cached Data Indicator -->
	{#if isShowingCachedData}
		<div class="alert alert-info mb-6 shadow-lg">
			<div class="flex items-center gap-3">
				<svg class="w-6 h-6 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
				</svg>
				<div>
					<p class="font-medium">Showing cached data</p>
					<p class="text-sm opacity-80">This data may not be up to date. Reconnect to refresh.</p>
				</div>
			</div>
		</div>
	{/if}

	<!-- Filter Controls -->
	<div class="mb-6 flex flex-col sm:flex-row gap-4 items-start sm:items-center">
		<!-- Time Range Filter -->
		<div class="flex-1 min-w-0">
			<label class="label">
				<span class="label-text">Time Range</span>
			</label>
			<div class="dropdown">
				<div tabindex="0" role="button" class="btn btn-outline w-full max-w-xs">
					{getTimeRangeDisplay(selectedTimeRange)}
					<svg class="w-4 h-4 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"
						></path>
					</svg>
				</div>
				<ul
					tabindex="-1"
					class="dropdown-content z-[1] menu p-2 shadow bg-base-100 rounded-box w-52"
				>
					<li>
						<a
							class="dropdown-close"
							onclick={() => {
								selectedTimeRange = 'all';
								handleFilterChange();
							}}>All Time</a
						>
					</li>
					<li>
						<a
							class="dropdown-close"
							onclick={() => {
								selectedTimeRange = 'last7days';
								handleFilterChange();
							}}>Last 7 Days</a
						>
					</li>
					<li>
						<a
							class="dropdown-close"
							onclick={() => {
								selectedTimeRange = 'lastweek';
								handleFilterChange();
							}}>Last Week</a
						>
					</li>
					<li>
						<a
							class="dropdown-close"
							onclick={() => {
								selectedTimeRange = 'thisweek';
								handleFilterChange();
							}}>This Week</a
						>
					</li>
					<li>
						<a
							class="dropdown-close"
							onclick={() => {
								selectedTimeRange = 'lastmonth';
								handleFilterChange();
							}}>Last Month</a
						>
					</li>
					<li>
						<a
							class="dropdown-close"
							onclick={() => {
								selectedTimeRange = 'thismonth';
								handleFilterChange();
							}}>This Month</a
						>
					</li>
					<li>
						<a
							class="dropdown-close"
							onclick={() => {
								selectedTimeRange = 'thisyear';
								handleFilterChange();
							}}>This Year</a
						>
					</li>
					<li>
						<a
							class="dropdown-close"
							onclick={() => {
								selectedTimeRange = 'lastyear';
								handleFilterChange();
							}}>Last Year</a
						>
					</li>
				</ul>
			</div>
		</div>

		<!-- Sort Filter -->
		<div class="flex-1 min-w-0">
			<label class="label">
				<span class="label-text">Sort By</span>
			</label>
			<div class="dropdown">
				<div tabindex="0" role="button" class="btn btn-outline w-full max-w-xs">
					{getSortDisplay(selectedSort)}
					<svg class="w-4 h-4 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"
						></path>
					</svg>
				</div>
				<ul
					tabindex="-1"
					class="dropdown-content z-[1] menu p-2 shadow bg-base-100 rounded-box w-64"
				>
					<li>
						<a
							class="dropdown-close"
							onclick={() => {
								selectedSort = '-start_time';
								handleFilterChange();
							}}>Start Time (Newest First)</a
						>
					</li>
					<li>
						<a
							class="dropdown-close"
							onclick={() => {
								selectedSort = 'start_time';
								handleFilterChange();
							}}>Start Time (Oldest First)</a
						>
					</li>
					<li>
						<a
							class="dropdown-close"
							onclick={() => {
								selectedSort = '-end_time';
								handleFilterChange();
							}}>End Time (Newest First)</a
						>
					</li>
					<li>
						<a
							class="dropdown-close"
							onclick={() => {
								selectedSort = 'end_time';
								handleFilterChange();
							}}>End Time (Oldest First)</a
						>
					</li>
					<li>
						<a
							class="dropdown-close"
							onclick={() => {
								selectedSort = '-duration';
								handleFilterChange();
							}}>Duration (Longest First)</a
						>
					</li>
					<li>
						<a
							class="dropdown-close"
							onclick={() => {
								selectedSort = 'duration';
								handleFilterChange();
							}}>Duration (Shortest First)</a
						>
					</li>
					<li>
						<a
							class="dropdown-close"
							onclick={() => {
								selectedSort = 'title';
								handleFilterChange();
							}}>Title (A-Z)</a
						>
					</li>
					<li>
						<a
							class="dropdown-close"
							onclick={() => {
								selectedSort = '-title';
								handleFilterChange();
							}}>Title (Z-A)</a
						>
					</li>
					<li>
						<a
							class="dropdown-close"
							onclick={() => {
								selectedSort = 'project_name';
								handleFilterChange();
							}}>Project (A-Z)</a
						>
					</li>
					<li>
						<a
							class="dropdown-close"
							onclick={() => {
								selectedSort = '-project_name';
								handleFilterChange();
							}}>Project (Z-A)</a
						>
					</li>
					<li>
						<a
							class="dropdown-close"
							onclick={() => {
								selectedSort = '-is_active';
								handleFilterChange();
							}}>Status (Active First)</a
						>
					</li>
					<li>
						<a
							class="dropdown-close"
							onclick={() => {
								selectedSort = 'is_active';
								handleFilterChange();
							}}>Status (Completed First)</a
						>
					</li>
				</ul>
			</div>
		</div>
	</div>

	{#if loading}
		<div class="flex justify-center items-center min-h-[50vh]">
			<span class="loading loading-spinner loading-lg"></span>
		</div>
	{:else if error}
		<div class="alert alert-error mb-6">
			<svg class="w-6 h-6 stroke-current shrink-0 stroke-2" fill="none" viewBox="0 0 24 24">
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
				></path>
			</svg>
			<span>{error}</span>
		</div>
	{:else if data}
		<!-- Desktop Table View -->
		<div class="hidden lg:block">
			<div class="card bg-base-100 shadow-lg">
				<div class="card-body p-0">
					<div class="overflow-x-auto">
						<table class="table table-zebra w-full">
							<thead>
								<tr class="bg-base-200">
									<th>Title</th>
									<th class="w-1/3">Project</th>
									<th>Start Time</th>
									<th>End Time</th>
									<th>Duration</th>
									<th>Status</th>
								</tr>
							</thead>
							<tbody>
								{#each data.results as entry (entry.id)}
									{@const status = getStatusBadge(entry)}
									<tr
										class="hover:bg-base-200/50 cursor-pointer transition-colors duration-200"
										onclick={() => openEntryModal(entry)}
									>
										<td>
											<div class="font-medium">{entry.title}</div>
										</td>
										<td>
											<div class="font-medium text-primary">{entry.project}</div>
										</td>
										<td class="text-sm">{formatDate(entry.start_time)}</td>
										<td class="text-sm">
											{entry.end_time ? formatDate(entry.end_time) : '-'}
										</td>
										<td class="font-mono text-sm">
											{formatDuration(entry.duration)}
										</td>
										<td>
											<span class="badge {status.class}">
												{status.text}
											</span>
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				</div>
			</div>
		</div>

		<!-- Mobile Card View -->
		<div class="lg:hidden space-y-4">
			{#each data.results as entry (entry.id)}
				{@const status = getStatusBadge(entry)}
				<div
					class="card bg-base-100 shadow-lg cursor-pointer transition-all duration-200 hover:shadow-xl"
					onclick={() => openEntryModal(entry)}
				>
					<div class="card-body">
						<div class="flex items-start justify-between mb-3">
							<h3 class="font-semibold text-lg">{entry.title}</h3>
							<span class="badge {status.class} text-xs">
								{status.text}
							</span>
						</div>

						<div class="space-y-2 text-sm">
							<div class="flex items-center justify-between">
								<span class="text-base-content/60">Project:</span>
								<span class="font-medium text-primary">{entry.project}</span>
							</div>
							<div class="flex items-center justify-between">
								<span class="text-base-content/60">Duration:</span>
								<span class="font-mono">{formatDuration(entry.duration)}</span>
							</div>
							<div class="flex items-center justify-between">
								<span class="text-base-content/60">Started:</span>
								<span>{formatDate(entry.start_time)}</span>
							</div>
							{#if entry.end_time}
								<div class="flex items-center justify-between">
									<span class="text-base-content/60">Ended:</span>
									<span>{formatDate(entry.end_time)}</span>
								</div>
							{/if}
						</div>
					</div>
				</div>
			{/each}
		</div>

		<!-- Pagination -->
		<div class="flex flex-col sm:flex-row justify-between items-center mt-8 space-y-4 sm:space-y-0">
			<div class="text-sm text-base-content/60">
				{#if data.results.length > 0}
					Showing {data.results.length} entries
					{#if currentCursor}
						{#if hasPrevious}
							• Earlier entries available
						{:else}
							• Oldest entries shown
						{/if}
					{:else if hasNext}
						• Newer entries available
					{:else}
						• All entries shown
					{/if}
				{:else}
					No entries found
				{/if}
			</div>

			<div class="flex space-x-2">
				<button class="btn btn-outline btn-sm" disabled={!hasPrevious} onclick={goToPrevious}>
					<svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M15 19l-7-7 7-7"
						></path>
					</svg>
					Previous
				</button>
				<button class="btn btn-outline btn-sm" disabled={!hasNext} onclick={goToNext}>
					Next
					<svg class="w-4 h-4 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"
						></path>
					</svg>
				</button>
			</div>
		</div>
	{/if}
</div>

<!-- Time Entry Detail Modal -->
{#if selectedEntry}
	<TimeEntryDetailModal entry={selectedEntry} on:close={closeEntryModal} />
{/if}
