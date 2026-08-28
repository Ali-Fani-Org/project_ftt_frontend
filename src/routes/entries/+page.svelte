<script lang="ts">
	import { onMount } from 'svelte';
	import { slide } from 'svelte/transition';
	import { goto } from '$app/navigation';
	import type { PaginatedTimeEntries, TimeEntry } from '$lib/api';
	import TimeEntryDetailModal from '$lib/TimeEntryDetailModal.svelte';
	import { network } from '$lib/network';
	import PageHeader from '$lib/PageHeader.svelte';
	import TagChip from '$lib/TagChip.svelte';
	import {
		Search,
		ChevronDown,
		ChevronRight,
		Clock,
		Download,
		ArrowLeft,
		ArrowRight,
		X,
		CalendarDays,
		Briefcase,
		Play,
		ListChecks,
		Tag as TagIcon
	} from '@jis3r/icons';
	import { createHotkey } from '@tanstack/svelte-hotkeys';
	import {
		useInfiniteTimeEntries,
		useAllFilteredTimeEntries,
		useProjects,
		type TimeEntryFilters
	} from '$lib/queries/timeEntries';
	import { useTagsQuery } from '$lib/queries/tags';
	import { onIdle, prefetchNextEntriesPage } from '$lib/queries/prefetch';
	import { resolveEntriesRange } from '$lib/reports/analytics';
	import { queryClient } from '$lib/queryClient';
	import { queryKeys } from '$lib/queries/keys';
	import type { InfiniteData } from '@tanstack/query-core';

	let selectedEntry = $state<TimeEntry | null>(null);

	// ---------------------------------------------------------------------------
	// Filters — every change flows into the query key, so each combination is its
	// own cache entry and navigating back is instant.
	// ---------------------------------------------------------------------------

	let selectedTimeRange = $state<string>('all'); // all | last7days | thisweek | thismonth | thisyear | custom
	let customStart = $state('');
	let customEnd = $state('');
	let showCustomDate = $state(false);

	let searchInput = $state('');
	let searchQuery = $state('');
	let debounceTimer: ReturnType<typeof setTimeout> | undefined;

	let selectedProject = $state<number | null>(null);
	let selectedTags = $state<string[]>([]);

	// Server-side ordering — same state the old table used, now driven by an
	// explicit sort control on every breakpoint (the journal has no column headers).
	let sorting = $state<{ id: string; desc: boolean }[]>([{ id: 'start_time', desc: true }]);

	const SORT_FIELDS: Record<string, { asc: string; desc: string }> = {
		title: { asc: 'title', desc: '-title' },
		project: { asc: 'project_name', desc: '-project_name' },
		start_time: { asc: 'start_time', desc: '-start_time' },
		end_time: { asc: 'end_time', desc: '-end_time' },
		duration: { asc: 'duration', desc: '-duration' },
		status: { asc: 'is_active', desc: '-is_active' }
	};

	function sortingToOrdering(current: { id: string; desc: boolean }[]): string {
		const column = current[0];
		if (!column) return '-start_time';
		const fields = SORT_FIELDS[column.id];
		if (!fields) return '-start_time';
		return column.desc ? fields.desc : fields.asc;
	}

	let mobileSort = $state('-start_time');

	function handleSortChange(value: string) {
		mobileSort = value;
		for (const [id, fields] of Object.entries(SORT_FIELDS)) {
			if (value === fields.asc) sorting = [{ id, desc: false }];
			else if (value === fields.desc) sorting = [{ id, desc: true }];
		}
	}

	const sortOptions = [
		{ value: '-start_time', label: 'Start Time (Newest First)' },
		{ value: 'start_time', label: 'Start Time (Oldest First)' },
		{ value: '-end_time', label: 'End Time (Newest First)' },
		{ value: 'end_time', label: 'End Time (Oldest First)' },
		{ value: '-duration', label: 'Duration (Longest First)' },
		{ value: 'duration', label: 'Duration (Shortest First)' },
		{ value: 'title', label: 'Title (A-Z)' },
		{ value: '-title', label: 'Title (Z-A)' },
		{ value: 'project_name', label: 'Project (A-Z)' },
		{ value: '-project_name', label: 'Project (Z-A)' },
		{ value: '-is_active', label: 'Status (Active First)' },
		{ value: 'is_active', label: 'Status (Completed First)' }
	];
	const sortLabel = $derived(
		sortOptions.find((o) => o.value === mobileSort)?.label ?? sortOptions[0].label
	);

	const TIME_RANGE_OPTIONS = [
		{ value: 'all', label: 'All' },
		{ value: 'last7days', label: '7 days' },
		{ value: 'thisweek', label: 'This week' },
		{ value: 'thismonth', label: 'This month' },
		{ value: 'thisyear', label: 'This year' },
		{ value: 'custom', label: 'Custom' }
	] as const;

	// ---------------------------------------------------------------------------
	// Queries
	// ---------------------------------------------------------------------------

	const projectsQuery = useProjects();
	const tagsQuery = useTagsQuery();

	function getCurrentFilters(): TimeEntryFilters {
		const timeRange = getCurrentRangeDates();
		return {
			start_date_after_tz: timeRange.start ?? undefined,
			start_date_before_tz: timeRange.end ?? undefined,
			project: selectedProject ?? undefined,
			search: searchQuery || undefined,
			tags: selectedTags.length > 0 ? selectedTags.join(',') : undefined,
			ordering: sortingToOrdering(sorting)
		};
	}

	// Cursor-paginated list (the journal). Pages accumulate under one key so
	// prev/next navigation never refetches pages already loaded.
	const entriesQuery = useInfiniteTimeEntries(getCurrentFilters, () => ({
		keepPreviousData: true
	}));

	// Every entry matching the filters, paged through once — drives the exact
	// totals in the stats strip and the CSV export. Cached per filter set.
	const allFilteredQuery = useAllFilteredTimeEntries(getCurrentFilters, () => ({
		keepPreviousData: true
	}));

	let allEntries = $derived(entriesQuery.data?.pages.flatMap((page) => page.results) ?? []);
	let loading = $derived(entriesQuery.isPending);
	let error = $derived(
		!entriesQuery.data && entriesQuery.isError ? 'Failed to load time entries' : ''
	);
	let hasNext = $derived(entriesQuery.hasNextPage);
	let hasPrevious = $derived(entriesQuery.hasPreviousPage);
	let isFetchingPage = $derived(entriesQuery.isFetchingNextPage);
	let isShowingCachedData = $derived(!$network.isOnline && allEntries.length > 0);

	// Warm page 2 in the background as soon as page 1 is the only cached page,
	// so the first "next" click renders instantly. Re-arms whenever the filters
	// change and a fresh single-page result arrives; no-op once the user pages.
	let warmedNextCursor: string | null = null;
	$effect(() => {
		const pages = entriesQuery.data?.pages;
		const nextCursor = pages?.length === 1 ? (pages[0].next ?? null) : null;
		if (nextCursor && nextCursor !== warmedNextCursor) {
			warmedNextCursor = nextCursor;
			onIdle(() => prefetchNextEntriesPage(getCurrentFilters()));
		}
	});

	const hasActiveFilters = $derived(
		searchQuery.trim() !== '' || selectedProject !== null || selectedTags.length > 0
	);

	// ---------------------------------------------------------------------------
	// Stats (from the full filtered dataset — exact, filter-aware)
	// ---------------------------------------------------------------------------

	const statsEntries = $derived(allFilteredQuery.data ?? []);

	const totalSeconds = $derived(
		statsEntries.reduce((sum, e) => sum + (parseFloat(e.duration ?? '') || 0), 0)
	);
	const entryCount = $derived(statsEntries.length);
	const activeCount = $derived(statsEntries.filter((e) => e.is_active).length);
	const distinctDays = $derived(
		new Set(statsEntries.map((e) => dayKey(new Date(e.start_time)))).size
	);
	const avgPerDaySeconds = $derived(distinctDays > 0 ? totalSeconds / distinctDays : 0);
	const statsLoading = $derived(allFilteredQuery.isPending && statsEntries.length === 0);

	// ---------------------------------------------------------------------------
	// Day grouping — the journal
	// ---------------------------------------------------------------------------

	function dayKey(d: Date): string {
		return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
	}

	function dayLabel(d: Date): string {
		const today = new Date();
		const yesterday = new Date(today);
		yesterday.setDate(today.getDate() - 1);
		if (dayKey(d) === dayKey(today)) return 'Today';
		if (dayKey(d) === dayKey(yesterday)) return 'Yesterday';
		return d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
	}

	interface DayGroup {
		key: string;
		label: string;
		date: Date;
		entries: TimeEntry[];
		totalSeconds: number;
	}

	const dayGroups = $derived.by(() => {
		const groups: DayGroup[] = [];
		for (const entry of allEntries) {
			const d = new Date(entry.start_time);
			const key = dayKey(d);
			let group = groups.find((g) => g.key === key);
			if (!group) {
				group = { key, label: dayLabel(d), date: d, entries: [], totalSeconds: 0 };
				groups.push(group);
			}
			group.entries.push(entry);
			group.totalSeconds += parseFloat(entry.duration ?? '') || 0;
		}
		return groups;
	});

	// ---------------------------------------------------------------------------
	// Formatting helpers
	// ---------------------------------------------------------------------------

	function formatDuration(duration: string | null): string {
		if (!duration) return 'Active';
		const totalSeconds = parseFloat(duration) || 0;
		const hours = Math.floor(totalSeconds / 3600);
		const minutes = Math.floor((totalSeconds % 3600) / 60);
		const seconds = Math.floor(totalSeconds % 60);
		if (hours > 0) return `${hours}h ${minutes}m`;
		if (minutes > 0) return `${minutes}m ${seconds}s`;
		return `${seconds}s`;
	}

	function formatDurationShort(seconds: number): string {
		const hours = Math.floor(seconds / 3600);
		const minutes = Math.floor((seconds % 3600) / 60);
		if (hours > 0) return `${hours}h ${minutes}m`;
		if (minutes > 0) return `${minutes}m`;
		return `${Math.floor(seconds)}s`;
	}

	function formatDurationCSV(seconds: number): string {
		const hours = Math.floor(seconds / 3600);
		const minutes = Math.floor((seconds % 3600) / 60);
		const secs = Math.floor(seconds % 60);
		return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(
			secs
		).padStart(2, '0')}`;
	}

	function formatTime(iso: string): string {
		return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
	}

	function formatTimeRange(entry: TimeEntry): string {
		if (!entry.end_time) return `${formatTime(entry.start_time)} – running`;
		return `${formatTime(entry.start_time)} – ${formatTime(entry.end_time)}`;
	}

	function getStatusBadge(entry: TimeEntry) {
		if (entry.is_active) return { text: 'Active', class: 'badge-success' };
		return { text: 'Completed', class: 'badge-neutral' };
	}

	// ---------------------------------------------------------------------------
	// Time range handling
	// ---------------------------------------------------------------------------

	// Resolve the selected pill to concrete dates via the shared Tehran-aware
	// resolver (local dates + Saturday-first week — same semantics as Reports).
	function getCurrentRangeDates(): { start: string | null; end: string | null } {
		return resolveEntriesRange(selectedTimeRange, { customStart, customEnd });
	}

	function getTimeRangeDisplay(range: string): string {
		if (range === 'custom') {
			if (customStart && customEnd) return `${customStart} → ${customEnd}`;
			return 'Custom';
		}
		const label = TIME_RANGE_OPTIONS.find((o) => o.value === range)?.label;
		if (label === 'All') return 'All time';
		return label ?? 'All time';
	}

	function pickRange(value: string) {
		selectedTimeRange = value;
		showCustomDate = value === 'custom';
	}

	function applyCustomDate() {
		showCustomDate = false;
		selectedTimeRange = 'custom';
	}

	// ---------------------------------------------------------------------------
	// Filter interactions
	// ---------------------------------------------------------------------------

	function handleSearchInput() {
		clearTimeout(debounceTimer);
		debounceTimer = setTimeout(() => {
			searchQuery = searchInput.trim();
		}, 300);
	}

	function clearSearch() {
		searchInput = '';
		searchQuery = '';
	}

	function toggleTag(title: string) {
		selectedTags = selectedTags.includes(title)
			? selectedTags.filter((t) => t !== title)
			: [...selectedTags, title];
	}

	// `/` focuses the search box (default ignoreInputs keeps it out of the way
	// while typing in any field).
	let searchInputEl = $state<HTMLInputElement | null>(null);
	createHotkey('/', () => {
		searchInputEl?.focus();
	});

	onMount(() => {
		document.addEventListener('click', handleOutsideClick);
		return () => {
			document.removeEventListener('click', handleOutsideClick);
			clearTimeout(debounceTimer);
		};
	});

	function handleOutsideClick(event: MouseEvent) {
		const target = event.target as HTMLElement | null;
		const isInsideDropdown = target?.closest('.dropdown');
		if (!isInsideDropdown) {
			document.querySelectorAll('.dropdown [tabindex="0"]').forEach((button) => {
				if (button instanceof HTMLElement) button.blur();
			});
		}
	}

	// ---------------------------------------------------------------------------
	// Refresh / pagination / modal / CSV
	// ---------------------------------------------------------------------------

	function goToNext() {
		void entriesQuery.fetchNextPage();
	}

	function goToPrevious() {
		void entriesQuery.fetchPreviousPage();
	}

	function openEntryModal(entry: TimeEntry) {
		selectedEntry = entry;
	}

	function closeEntryModal() {
		selectedEntry = null;
	}

	function handleEntryUpdated(event: CustomEvent<{ entry: TimeEntry }>) {
		const updatedEntry = event.detail.entry;

		// Patch the entry in every loaded page of the list query (no refetch flicker)
		queryClient.setQueryData<InfiniteData<PaginatedTimeEntries>>(
			queryKeys.timeEntries.infinite(getCurrentFilters()),
			(old) => {
				if (!old) return old;
				return {
					...old,
					pages: old.pages.map((page) => ({
						...page,
						results: page.results.map((e) => (e.id === updatedEntry.id ? updatedEntry : e))
					}))
				};
			}
		);

		// Revalidate everything else (stats, other pages, dashboard, active timer)
		void queryClient.invalidateQueries({ queryKey: queryKeys.timeEntries.all });

		selectedEntry = updatedEntry;
	}

	// CSV export of the full filtered dataset (exact, not just loaded pages).
	let exporting = $state(false);

	function exportCSV() {
		const entries = allFilteredQuery.data ?? [];
		if (entries.length === 0) return;
		exporting = true;

		// Flush synchronously — this is small (personal tracker dataset).
		const rows = [
			['Title', 'Project', 'Start', 'End', 'Duration (h:m:s)', 'Tags'].join(','),
			...entries.map((e) =>
				[
					`"${(e.title || '').replace(/"/g, '""')}"`,
					`"${(e.project || '').replace(/"/g, '""')}"`,
					new Date(e.start_time).toISOString(),
					e.end_time ? new Date(e.end_time).toISOString() : '',
					formatDurationCSV(parseFloat(e.duration ?? '') || 0),
					`"${(e.tags || []).map((t) => (typeof t === 'string' ? t : t.title)).join('; ')}"`
				].join(',')
			)
		];

		const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		const slug = getTimeRangeDisplay(selectedTimeRange)
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-');
		a.href = url;
		a.download = `time-entries-${slug || 'all'}.csv`;
		a.click();
		URL.revokeObjectURL(url);
		setTimeout(() => {
			exporting = false;
		}, 600);
	}

	// Keep the sort control label in sync with programmatic sort changes.
	$effect(() => {
		mobileSort = sortingToOrdering(sorting);
	});
</script>

<div class="min-h-screen p-4 md:p-6 lg:p-8">
	<div class="mx-auto flex max-w-7xl flex-col gap-6">
		<!-- ============================= Header ============================= -->
		<PageHeader
			icon={ListChecks}
			title="Time Entries"
			subtitle={`Your time log — ${getTimeRangeDisplay(selectedTimeRange).toLowerCase()}`}
		/>

		<!-- Offline warning -->
		{#if !$network.isOnline}
			<div class="alert alert-warning border border-warning/20 shadow-sm">
				<div class="flex items-center gap-3">
					<Clock size={20} class="shrink-0 text-warning" />
					<div>
						<p class="font-medium">You are offline</p>
						<p class="text-sm opacity-80">Showing cached data. Some features may be limited.</p>
					</div>
				</div>
			</div>
		{/if}

		{#if isShowingCachedData}
			<div class="alert alert-info border border-info/20 shadow-sm">
				<div class="flex items-center gap-3">
					<Clock size={20} class="shrink-0 text-info" />
					<div>
						<p class="font-medium">Showing cached data</p>
						<p class="text-sm opacity-80">This data may not be up to date. Reconnect to refresh.</p>
					</div>
				</div>
			</div>
		{/if}

		<!-- ============================= Stats strip ============================= -->
		<div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
			<div class="card border border-base-200 bg-base-100 shadow-sm">
				<div class="card-body flex-row items-center gap-3 p-4">
					<span
						class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"
						aria-hidden="true"
					>
						<Clock size={18} />
					</span>
					<div class="min-w-0">
						<div class="text-xs text-base-content/60">Total time</div>
						<div class="truncate font-mono text-lg font-bold leading-tight">
							{#if statsLoading}
								<span class="loading loading-spinner loading-xs text-primary"></span>
							{:else}
								{formatDurationShort(totalSeconds)}
							{/if}
						</div>
					</div>
				</div>
			</div>

			<div class="card border border-base-200 bg-base-100 shadow-sm">
				<div class="card-body flex-row items-center gap-3 p-4">
					<span
						class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-secondary/10 text-secondary"
						aria-hidden="true"
					>
						<ListChecks size={18} />
					</span>
					<div class="min-w-0">
						<div class="text-xs text-base-content/60">Entries</div>
						<div class="text-lg font-bold leading-tight">{entryCount}</div>
					</div>
				</div>
			</div>

			<div class="card border border-base-200 bg-base-100 shadow-sm">
				<div class="card-body flex-row items-center gap-3 p-4">
					<span
						class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-success/10 text-success"
						aria-hidden="true"
					>
						<Play size={18} />
					</span>
					<div class="min-w-0">
						<div class="text-xs text-base-content/60">Active now</div>
						<div class="text-lg font-bold leading-tight">
							{#if activeCount > 0}
								<span class="inline-flex items-center gap-1.5 text-success">
									<span class="h-2 w-2 animate-pulse rounded-full bg-success"></span>
									{activeCount}
								</span>
							{:else}
								0
							{/if}
						</div>
					</div>
				</div>
			</div>

			<div class="card border border-base-200 bg-base-100 shadow-sm">
				<div class="card-body flex-row items-center gap-3 p-4">
					<span
						class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-info/10 text-info"
						aria-hidden="true"
					>
						<CalendarDays size={18} />
					</span>
					<div class="min-w-0">
						<div class="text-xs text-base-content/60">Avg / active day</div>
						<div class="truncate font-mono text-lg font-bold leading-tight">
							{#if statsLoading}
								<span class="loading loading-spinner loading-xs text-primary"></span>
							{:else}
								{formatDurationShort(avgPerDaySeconds)}
							{/if}
						</div>
					</div>
				</div>
			</div>
		</div>

		<!-- ============================= Filter bar ============================= -->
		<div class="flex flex-col gap-3">
			<div class="flex flex-wrap items-center gap-3">
				<!-- Pill time-range control (matches Reports) -->
				<div
					class="flex flex-wrap gap-1 rounded-full border border-base-200 bg-base-100 p-1 shadow-sm"
					role="tablist"
					aria-label="Time range"
				>
					{#each TIME_RANGE_OPTIONS as opt}
						<button
							type="button"
							role="tab"
							aria-selected={selectedTimeRange === opt.value}
							class="btn btn-xs rounded-full border-0 {selectedTimeRange === opt.value
								? 'bg-primary text-primary-content shadow-sm'
								: 'btn-ghost text-base-content/70 hover:bg-base-200'}"
							onclick={() => pickRange(opt.value)}
						>
							{opt.label}
						</button>
					{/each}
				</div>

				<div class="ml-auto flex flex-wrap items-center gap-2">
					<!-- Project filter -->
					<div class="dropdown">
						<div tabindex="0" role="button" class="btn btn-outline btn-sm gap-1.5">
							<span aria-hidden="true"><Briefcase size={15} class="text-base-content/60" /></span>
							{#if selectedProject === null}
								All projects
							{:else}
								{projectsQuery.data?.find((p) => p.id === selectedProject)?.title ?? 'Project'}
							{/if}
							<span aria-hidden="true"><ChevronDown size={14} class="text-base-content/50" /></span>
						</div>
						<ul
							tabindex="-1"
							class="dropdown-content z-[1] menu max-h-72 w-56 overflow-y-auto rounded-box bg-base-100 p-2 shadow-lg"
						>
							<li>
								<button
									type="button"
									class="dropdown-close text-left"
									onclick={() => (selectedProject = null)}
								>
									All projects
								</button>
							</li>
							{#each projectsQuery.data ?? [] as project (project.id)}
								<li>
									<button
										type="button"
										class="dropdown-close text-left"
										onclick={() => (selectedProject = project.id)}
									>
										{project.title}
									</button>
								</li>
							{/each}
						</ul>
					</div>

					<!-- Search -->
					<div class="relative">
						<span
							class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2"
							aria-hidden="true"
						>
							<Search size={15} class="text-base-content/40" />
						</span>
						<input
							bind:this={searchInputEl}
							type="text"
							placeholder="Search entries…"
							bind:value={searchInput}
							oninput={handleSearchInput}
							class="input input-bordered input-sm w-48 pl-9 pr-16 transition-all focus:w-56"
						/>
						{#if searchInput}
							<button
								type="button"
								class="absolute right-2 top-1/2 -translate-y-1/2 btn btn-ghost btn-xs p-1"
								onclick={clearSearch}
								aria-label="Clear search"
							>
								<span aria-hidden="true"><X size={14} /></span>
							</button>
						{:else}
							<kbd
								class="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md border border-base-300 bg-base-200 px-1.5 py-0.5 font-mono text-[10px] text-base-content/50"
								>/</kbd
							>
						{/if}
					</div>

					<!-- Sort -->
					<div class="dropdown">
						<div tabindex="0" role="button" class="btn btn-outline btn-sm gap-1.5">
							Sort
							<span class="max-w-[10rem] truncate text-xs font-normal text-base-content/60">
								{sortLabel}
							</span>
							<span aria-hidden="true"><ChevronDown size={14} class="text-base-content/50" /></span>
						</div>
						<ul
							tabindex="-1"
							class="dropdown-content z-[1] menu max-h-72 w-64 overflow-y-auto rounded-box bg-base-100 p-2 shadow-lg"
						>
							{#each sortOptions as opt}
								<li>
									<button
										type="button"
										class="dropdown-close text-left"
										onclick={() => handleSortChange(opt.value)}
									>
										{opt.label}
									</button>
								</li>
							{/each}
						</ul>
					</div>

					<!-- CSV export -->
					<button
						type="button"
						class="btn btn-ghost btn-sm gap-1.5 text-base-content/70 hover:bg-base-200"
						onclick={exportCSV}
						disabled={exporting || allFilteredQuery.data?.length === 0}
						title="Export the current view as CSV"
					>
						{#if exporting}
							<span class="loading loading-spinner loading-xs"></span>
						{:else}
							<span aria-hidden="true"><Download size={15} /></span>
						{/if}
						Export
					</button>
				</div>
			</div>

			<!-- Tag chips -->
			{#if (tagsQuery.data ?? []).length > 0}
				<div class="flex flex-wrap items-center gap-1.5">
					<span class="mr-1" aria-hidden="true"
						><TagIcon size={13} class="text-base-content/40" /></span
					>
					{#each tagsQuery.data ?? [] as tag (tag.id)}
						<button
							type="button"
							class="badge gap-1 border py-2.5 transition-all {selectedTags.includes(tag.title)
								? 'border-primary bg-primary/10 text-primary shadow-sm'
								: 'border-base-300 bg-base-100 text-base-content/60 hover:border-primary/40 hover:text-base-content'}"
							onclick={() => toggleTag(tag.title)}
							aria-pressed={selectedTags.includes(tag.title)}
						>
							{tag.title}
						</button>
					{/each}
					{#if selectedTags.length > 0}
						<button
							type="button"
							class="btn btn-ghost btn-xs text-base-content/50"
							onclick={() => (selectedTags = [])}
						>
							Clear
						</button>
					{/if}
				</div>
			{/if}
		</div>

		<!-- ============================= Custom range panel ============================= -->
		{#if showCustomDate}
			<div
				class="card border border-base-200 bg-base-100 shadow-sm"
				transition:slide={{ duration: 150 }}
			>
				<div class="card-body flex flex-wrap items-end gap-3 p-4">
					<div class="form-control">
						<label class="label py-1" for="custom-start-date">
							<span class="label-text text-xs">From</span>
						</label>
						<input
							id="custom-start-date"
							type="date"
							bind:value={customStart}
							class="input input-bordered input-sm"
						/>
					</div>
					<div class="form-control">
						<label class="label py-1" for="custom-end-date">
							<span class="label-text text-xs">To</span>
						</label>
						<input
							id="custom-end-date"
							type="date"
							bind:value={customEnd}
							class="input input-bordered input-sm"
						/>
					</div>
					<button
						class="btn btn-primary btn-sm"
						onclick={applyCustomDate}
						disabled={!customStart && !customEnd}
					>
						Apply range
					</button>
					<button
						class="btn btn-ghost btn-sm"
						onclick={() => {
							showCustomDate = false;
							selectedTimeRange = 'all';
						}}
					>
						Cancel
					</button>
				</div>
			</div>
		{/if}

		<!-- ============================= Content ============================= -->
		{#if loading}
			<div class="flex min-h-[50vh] items-center justify-center">
				<span class="loading loading-spinner loading-lg text-primary"></span>
			</div>
		{:else if error}
			<div class="alert alert-error shadow-sm">
				<span>{error}</span>
			</div>
		{:else if allEntries.length === 0}
			<!-- Empty state -->
			<div class="card border border-base-200 bg-base-100 shadow-sm">
				<div class="card-body items-center py-16 text-center">
					<span
						class="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary"
						aria-hidden="true"
					>
						<ListChecks size={28} />
					</span>
					<h2 class="text-xl font-bold">
						{hasActiveFilters ? 'No entries match your filters' : 'No tracked time yet'}
					</h2>
					<p class="mt-1 max-w-sm text-sm text-base-content/60">
						{#if hasActiveFilters}
							Try broadening the time range, or clearing the search / project / tag filters.
						{:else}
							Start a timer and your sessions will appear here, grouped by day.
						{/if}
					</p>
					{#if !hasActiveFilters}
						<button
							type="button"
							class="btn btn-primary btn-sm mt-4 gap-2"
							onclick={() => goto('/timer')}
						>
							<span aria-hidden="true"><Play size={15} /></span>
							Start a timer
						</button>
					{/if}
				</div>
			</div>
		{:else}
			<!-- Day-grouped journal -->
			<div class="card overflow-hidden border border-base-200 bg-base-100 shadow-sm">
				{#each dayGroups as group (group.key)}
					<div class="border-b border-base-200/70 last:border-b-0">
						<!-- Group header -->
						<div class="flex items-center gap-3 bg-base-200/40 px-4 py-2.5">
							<span class="text-xs font-semibold uppercase tracking-wider text-base-content/70">
								{group.label}
							</span>
							<span class="text-xs text-base-content/40">
								{group.entries.length}
								{group.entries.length === 1 ? 'entry' : 'entries'}
							</span>
							<div class="h-px flex-1 bg-base-200"></div>
							<span class="font-mono text-xs font-medium text-base-content/60">
								{formatDurationShort(group.totalSeconds)}
							</span>
						</div>

						<!-- Rows -->
						<div class="divide-y divide-base-200/60">
							{#each group.entries as entry (entry.id)}
								{@const status = getStatusBadge(entry)}
								<div
									role="button"
									tabindex="0"
									class="group flex cursor-pointer items-center gap-4 px-4 py-3 transition-colors hover:bg-base-200/50 focus-visible:bg-base-200/50 focus-visible:outline-none"
									onclick={() => openEntryModal(entry)}
									onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && openEntryModal(entry)}
								>
									<!-- Accent bar -->
									<span
										class="w-1 shrink-0 self-stretch rounded-full {entry.is_active
											? 'animate-pulse bg-success'
											: 'bg-base-300 transition-colors group-hover:bg-primary/50'}"
										aria-hidden="true"
									></span>

									<!-- Duration -->
									<div
										class="w-20 shrink-0 text-right font-mono text-sm font-semibold {entry.is_active
											? 'text-success'
											: 'text-base-content'}"
									>
										{formatDuration(entry.duration)}
									</div>

									<!-- Title + meta -->
									<div class="min-w-0 flex-1">
										<div class="truncate font-medium">{entry.title || '(untitled)'}</div>
										<div
											class="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-base-content/60"
										>
											{#if entry.project}
												<span class="inline-flex items-center gap-1">
													<span aria-hidden="true"
														><Briefcase size={11} class="text-base-content/40" /></span
													>
													{entry.project}
												</span>
											{/if}
											<span class="inline-flex items-center gap-1">
												<span aria-hidden="true"
													><Clock size={11} class="text-base-content/40" /></span
												>
												{formatTimeRange(entry)}
											</span>
											<span class="badge badge-ghost badge-xs gap-1 border-0 {status.class}">
												{status.text}
											</span>
										</div>
									</div>

									<!-- Tags -->
									{#if entry.tags && entry.tags.length > 0}
										<div class="hidden shrink-0 flex-wrap justify-end gap-1 sm:flex">
											{#each entry.tags.slice(0, 3) as tag (typeof tag === 'string' ? tag : tag.id)}
												{#if typeof tag === 'string'}
													<span class="badge badge-outline badge-xs">{tag}</span>
												{:else}
													<TagChip {tag} size="xs" />
												{/if}
											{/each}
											{#if entry.tags.length > 3}
												<span class="badge badge-ghost badge-xs">+{entry.tags.length - 3}</span>
											{/if}
										</div>
									{/if}

									<span
										class="shrink-0 transition-transform group-hover:translate-x-0.5"
										aria-hidden="true"
									>
										<ChevronRight size={15} class="text-base-content/30" />
									</span>
								</div>
							{/each}
						</div>
					</div>
				{/each}
			</div>

			<!-- Pagination -->
			<div class="flex flex-col items-center justify-between gap-3 sm:flex-row">
				<div class="text-sm text-base-content/60">
					{allEntries.length} shown
					{#if hasPrevious}
						• earlier pages available
					{:else if hasNext}
						• more entries available
					{:else}
						• all matching entries shown
					{/if}
				</div>

				<div class="flex gap-2">
					<button
						class="btn btn-outline btn-sm gap-1.5"
						disabled={!hasPrevious || isFetchingPage}
						onclick={goToPrevious}
					>
						<span aria-hidden="true"><ArrowLeft size={15} /></span>
						Previous
					</button>
					<button
						class="btn btn-outline btn-sm gap-1.5"
						disabled={!hasNext || isFetchingPage}
						onclick={goToNext}
					>
						Next
						<span aria-hidden="true"><ArrowRight size={15} /></span>
					</button>
				</div>
			</div>
		{/if}
	</div>
</div>

<!-- Time Entry Detail Modal -->
{#if selectedEntry}
	<TimeEntryDetailModal
		entry={selectedEntry}
		on:close={closeEntryModal}
		on:updated={handleEntryUpdated}
	/>
{/if}
