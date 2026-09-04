<script lang="ts">
	import { get } from 'svelte/store';
	import { gotoApp } from '$lib/navigation';
	import PageHeader from '$lib/PageHeader.svelte';
	import { Square } from '@lucide/svelte';
	import { Play, Pencil, ChartColumn, ListChecks } from '@jis3r/icons';
	import { LayoutDashboard } from '@jis3r/icons';
	import {
		user,
		timeEntriesDisplayMode,
		autoRefreshEnabled,
		timerRefreshInterval
	} from '$lib/stores';
	import type { TimeEntry, PaginatedTimeEntries } from '$lib/api';
	import TasksModal from '$lib/TasksModal.svelte';
	import Last7DaysChart from '$lib/Last7DaysChart.svelte';
	import CalendarHeatmap from '$lib/CalendarHeatmap.svelte';
	import ProjectsBarChart from '$lib/ProjectsBarChart.svelte';
	import { prefetchRoute } from '$lib/queries/prefetch';
	import { queryClient } from '$lib/queryClient';
	import { queryKeys } from '$lib/queries/keys';
	import { createQueries } from '$lib/queries/createQueries.svelte';
	import { timeEntries as timeEntriesApi } from '$lib/api';
	import TagChip from '$lib/TagChip.svelte';
	import { useStopTimerMutation } from '$lib/queries/timeEntries';
	import {
		computeTotalSeconds,
		formatDuration,
		getEntryDurationSeconds
	} from '$lib/reports/analytics';

	let showTasksModal = $state(false);

	// Helper functions to get date ranges
	/**
	 * Gets today's date in YYYY-MM-DD format.
	 * @returns Today's date string
	 */
	function getTodayRange(): { start: string; end: string } {
		const now = new Date();
		const today = now.toISOString().split('T')[0];
		return {
			start: today,
			end: today
		};
	}

	/**
	 * Gets the date of Monday of the current week (local time) as YYYY-MM-DD,
	 * used to scope the "this week" summary strip.
	 * @returns Monday's date string
	 */
	function getWeekStart(): string {
		const now = new Date();
		const daysSinceMonday = (now.getDay() + 6) % 7;
		const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysSinceMonday);
		const month = String(monday.getMonth() + 1).padStart(2, '0');
		const day = String(monday.getDate()).padStart(2, '0');
		return `${monday.getFullYear()}-${month}-${day}`;
	}

	// Server state via TanStack Query — shared cache + automatic revalidation.
	// Today's entries, recent activity, and the active timer all share the app
	// query cache, so starting/stopping a timer on the timer page invalidates
	// these queries too (via queryKeys.timeEntries.all).
	const refreshInterval = () => ($autoRefreshEnabled ? $timerRefreshInterval || 30000 : false);

	// Single observer via the vendored createQueries (see
	// src/lib/queries/createQueries.svelte.ts for why we can't use the
	// @tanstack/svelte-query version: it builds its QueriesObserver inside a
	// `$derived`, which crashes with state_unsafe_mutation once SyncIndicator's
	// useIsFetching subscribes to the query cache). Same keys/shapes, so
	// prefetch + invalidation still hit the same cache entries.
	const [todayQuery, recentQuery, weekQuery, activeQuery] = createQueries(() => {
		const todayRange = getTodayRange();
		const weekStart = getWeekStart();
		return {
			queries: [
				{
					queryKey: queryKeys.timeEntries.filtered({
						start_date_after_tz: todayRange.start,
						start_date_before_tz: todayRange.end,
						limit: 100
					}),
					queryFn: () =>
						timeEntriesApi.listWithFilters({
							start_date_after_tz: todayRange.start,
							start_date_before_tz: todayRange.end,
							limit: 100
						}),
					refetchInterval: refreshInterval()
				},
				{
					queryKey: queryKeys.timeEntries.filtered({ limit: 10 }),
					queryFn: () => timeEntriesApi.listWithFilters({ limit: 10 }),
					refetchInterval: refreshInterval()
				},
				{
					queryKey: queryKeys.timeEntries.filtered({
						start_date_after_tz: weekStart,
						limit: 500
					}),
					queryFn: () =>
						timeEntriesApi.listWithFilters({
							start_date_after_tz: weekStart,
							limit: 500
						}),
					refetchInterval: refreshInterval()
				},
				{
					queryKey: queryKeys.timeEntries.active,
					queryFn: () => timeEntriesApi.getCurrentActive(),
					// Always stale: the active timer must reflect the server, so every
					// mount/focus/reconnect refetches it instead of trusting a cached
					// (possibly synthetic or stale) entry.
					staleTime: 0,
					refetchInterval: refreshInterval()
				}
			]
		};
	});

	let todayEntries = $derived<TimeEntry[]>(
		(todayQuery.data as PaginatedTimeEntries | undefined)?.results ?? []
	);
	let recentEntries = $derived<TimeEntry[]>(
		(recentQuery.data as PaginatedTimeEntries | undefined)?.results.slice(0, 5) ?? []
	);
	let weekEntries = $derived<TimeEntry[]>(
		(weekQuery.data as PaginatedTimeEntries | undefined)?.results ?? []
	);
	let weekTotalSeconds = $derived(computeTotalSeconds(weekEntries));
	let weekTopProject = $derived<string>(
		(() => {
			const totals = new Map<string, number>();
			for (const entry of weekEntries) {
				const name = entry.project || 'No project';
				totals.set(name, (totals.get(name) ?? 0) + getEntryDurationSeconds(entry));
			}
			let top = '';
			let topSecs = 0;
			for (const [name, secs] of totals) {
				if (secs > topSecs) {
					top = name;
					topSecs = secs;
				}
			}
			return top;
		})()
	);
	let weekDayTotals = $derived<number[]>(
		(() => {
			const buckets = [0, 0, 0, 0, 0, 0, 0];
			for (const entry of weekEntries) {
				const dow = (new Date(entry.start_time).getDay() + 6) % 7; // Mon=0
				buckets[dow] += getEntryDurationSeconds(entry);
			}
			return buckets;
		})()
	);
	let weekMaxDay = $derived(Math.max(0, ...weekDayTotals));
	const weekdayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
	let activeEntry = $derived<TimeEntry | null>((activeQuery.data as TimeEntry | undefined) ?? null);
	let loading = $derived(
		todayQuery.isPending && recentQuery.isPending && weekQuery.isPending && activeQuery.isPending
	);
	let error = $derived(
		!todayEntries.length &&
			!recentEntries.length &&
			!activeEntry &&
			(todayQuery.isError || recentQuery.isError || activeQuery.isError)
			? 'Failed to load dashboard data'
			: ''
	);

	// Stats for today
	let todayTotalSeconds = $derived(computeTodaySeconds(todayEntries, activeEntry));
	let todayCompletedTasks = $derived(todayEntries.filter((entry) => !entry.is_active).length);

	function computeTodaySeconds(entries: TimeEntry[], active: TimeEntry | null): number {
		let total = 0;
		for (const entry of entries) {
			if (entry.duration) {
				const duration = parseInt(entry.duration, 10) || 0; // Duration is now in seconds as string
				total += duration;
			} else if (entry.is_active && active?.id === entry.id) {
				// For active entry, calculate from start time to now
				const startTime = new Date(entry.start_time).getTime();
				total += Math.floor((Date.now() - startTime) / 1000);
			}
		}
		return total;
	}

	/**
	 * Formats seconds into HH:MM:SS format.
	 * @param totalSeconds - Total seconds to format
	 * @returns String in HH:MM:SS format with zero-padded values
	 */
	function formatTimeHHMMSS(totalSeconds: number): string {
		const hours = Math.floor(totalSeconds / 3600);
		const minutes = Math.floor((totalSeconds % 3600) / 60);
		const seconds = totalSeconds % 60;
		return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
	}

	function formatDate(dateStr: string): string {
		const date = new Date(dateStr);
		const now = new Date();
		const diffTime = now.getTime() - date.getTime();
		const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

		if (diffDays === 0) {
			return 'Today';
		} else if (diffDays === 1) {
			return 'Yesterday';
		} else if (diffDays < 7) {
			return `${diffDays} days ago`;
		} else {
			return date.toLocaleDateString();
		}
	}

	const stopTimerMutation = useStopTimerMutation();

	function projectDotClass(name: string): string {
		const palette = [
			'bg-primary',
			'bg-secondary',
			'bg-accent',
			'bg-info',
			'bg-success',
			'bg-warning'
		];
		let sum = 0;
		for (let i = 0; i < name.length; i++) sum = (sum + name.charCodeAt(i)) % palette.length;
		return palette[sum];
	}

	const openTimeEntries = async () => {
		const mode = get(timeEntriesDisplayMode);
		if (mode === 'modal') {
			showTasksModal = true;
			return;
		}
		gotoApp('/entries');
	};

	function getGreeting(): string {
		const hour = new Date().getHours();
		if (hour < 12) return 'Good morning';
		if (hour < 17) return 'Good afternoon';
		return 'Good evening';
	}

	// Enable debug mode in development
</script>

<div class="container mx-auto p-4 lg:p-8">
	<!-- Header -->
	<div class="mb-6">
		<PageHeader
			icon={LayoutDashboard}
			title="Dashboard"
			subtitle={`${getGreeting()}, ${$user?.first_name || 'User'}!`}
		/>
	</div>

	{#if loading}
		<!-- Skeleton Loading State -->
		<div class="space-y-8">
			<!-- Quick Stats Skeletons -->
			<div class="grid grid-cols-1 md:grid-cols-3 gap-6">
				{#each Array(3) as _}
					<div class="card bg-base-100 shadow-lg">
						<div class="card-body">
							<div class="flex items-center justify-between">
								<div class="flex-1">
									<div class="skeleton h-4 w-24 mb-2"></div>
									<div class="skeleton h-8 w-16"></div>
								</div>
								<div class="skeleton h-12 w-12 rounded-full"></div>
							</div>
						</div>
					</div>
				{/each}
			</div>

			<!-- Charts Skeletons -->
			<div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
				<div class="card shadow-lg">
					<div class="card-body">
						<div class="skeleton h-6 w-32 mb-4"></div>
						<div class="skeleton h-48 w-full"></div>
					</div>
				</div>
				<div class="card shadow-lg">
					<div class="card-body">
						<div class="skeleton h-6 w-32 mb-4"></div>
						<div class="skeleton h-48 w-full"></div>
					</div>
				</div>
			</div>

			<!-- Recent Activity & Quick Actions Skeletons -->
			<div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
				<!-- Recent Entries Skeleton -->
				<div class="card bg-base-100 shadow-lg">
					<div class="card-body">
						<div class="skeleton h-6 w-32 mb-4"></div>
						<div class="space-y-3">
							{#each Array(5) as _}
								<div class="flex items-center justify-between p-3 bg-base-200 rounded-lg">
									<div class="flex-1">
										<div class="skeleton h-4 w-32 mb-1"></div>
										<div class="skeleton h-3 w-24"></div>
									</div>
									<div class="skeleton h-6 w-12 rounded"></div>
								</div>
							{/each}
						</div>
						<div class="card-actions mt-4">
							<div class="skeleton h-8 w-32"></div>
						</div>
					</div>
				</div>

				<!-- Quick Actions Skeleton -->
				<div class="card bg-base-100 shadow-lg">
					<div class="card-body">
						<div class="skeleton h-6 w-32 mb-4"></div>
						<div class="space-y-3">
							{#each Array(4) as _}
								<div class="skeleton h-12 w-full"></div>
							{/each}
						</div>
					</div>
				</div>
			</div>
		</div>
	{:else if error}
		<div class="alert alert-error">
			<span>{error}</span>
		</div>
	{:else}
		<!-- Quick Stats -->
		<div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-4 items-stretch">
			<!-- Hours Today -->
			<div class="card bg-base-100 shadow-lg h-full">
				<div class="card-body flex flex-col justify-center">
					<div class="flex items-center justify-between">
						<div>
							<h3 class="card-title text-sm font-normal text-base-content/70">Hours Today</h3>
							<p class="text-3xl font-bold text-secondary font-mono">
								{formatTimeHHMMSS(todayTotalSeconds)}
							</p>
						</div>
						<div class="avatar placeholder bg-secondary/10 rounded-full p-4">
							<svg
								class="w-8 h-8 text-secondary"
								fill="none"
								stroke="currentColor"
								viewBox="0 0 24 24"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
								></path>
							</svg>
						</div>
					</div>
				</div>
			</div>

			<!-- Tasks Completed Today -->
			<div class="card bg-base-100 shadow-lg h-full">
				<div class="card-body flex flex-col justify-center">
					<div class="flex items-center justify-between">
						<div>
							<h3 class="card-title text-sm font-normal text-base-content/70">
								Tasks Completed Today
							</h3>
							<p class="text-3xl font-bold text-accent">{todayCompletedTasks}</p>
						</div>
						<div class="avatar placeholder bg-accent/10 rounded-full p-4">
							<svg
								class="w-8 h-8 text-accent"
								fill="none"
								stroke="currentColor"
								viewBox="0 0 24 24"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
								></path>
							</svg>
						</div>
					</div>
				</div>
			</div>

			<!-- Projects Today Bar Chart -->
			<ProjectsBarChart entries={todayEntries} />
		</div>

		<!-- Charts Section -->
		<div
			class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-3 mb-4 items-stretch auto-rows-fr"
		>
			<!-- Last 7 Days Chart -->
			<div class="h-full min-h-[420px]"><Last7DaysChart /></div>

			<!-- Calendar Heatmap -->
			<div class="h-full min-h-[420px]"><CalendarHeatmap /></div>
		</div>

		<!-- Recent Activity & Quick Actions -->
		<div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
			<!-- Recent Entries -->
			<div class="card bg-base-100 shadow-lg">
				<div class="card-body">
					<h2 class="card-title mb-4">Recent Activity</h2>

					<!-- This week summary strip -->
					<div class="grid grid-cols-3 gap-3 mb-4 p-3 bg-base-200 rounded-lg">
						<div class="min-w-0">
							<p class="text-[11px] uppercase tracking-wider text-base-content/50">This week</p>
							<p class="text-lg font-bold font-mono tabular-nums">
								{formatDuration(weekTotalSeconds)}
							</p>
						</div>
						<div class="min-w-0">
							<p class="text-[11px] uppercase tracking-wider text-base-content/50">Entries</p>
							<p class="text-lg font-bold">{weekEntries.length}</p>
						</div>
						<div class="min-w-0">
							<p class="text-[11px] uppercase tracking-wider text-base-content/50">Top project</p>
							<p class="text-sm font-medium truncate" title={weekTopProject}>
								{weekTopProject || '—'}
							</p>
						</div>
					</div>

					<!-- Mon→Sun mini bars -->
					<div class="flex items-end gap-1 h-8 mb-5" aria-label="Hours by weekday">
						{#each weekDayTotals as secs, i}
							<div
								class="flex-1 rounded-sm bg-primary/40"
								style="height:{weekMaxDay > 0
									? Math.max(10, Math.round((secs / weekMaxDay) * 100))
									: 4}%"
								title="{weekdayLabels[i]} · {formatDuration(secs)}"
							></div>
						{/each}
					</div>

					{#if recentEntries.length > 0}
						<div class="space-y-2">
							{#each recentEntries as entry}
								<button
									class="flex w-full items-center gap-3 p-3 bg-base-200 rounded-lg text-left border-0 cursor-pointer transition-colors hover:bg-base-300 focus-visible:ring-2 focus-visible:ring-primary/40"
									onclick={() => gotoApp('/entries')}
								>
									<span class="w-2 h-2 rounded-full shrink-0 {projectDotClass(entry.project)}"
									></span>
									<span class="flex-1 min-w-0">
										<span class="flex items-center justify-between gap-3">
											<span class="font-medium text-sm truncate" title={entry.title}>
												{entry.title}
											</span>
											<span
												class="text-xs font-mono tabular-nums shrink-0 {entry.is_active
													? 'text-success'
													: 'text-base-content/70'}"
											>
												{formatDuration(getEntryDurationSeconds(entry))}
											</span>
										</span>
										<span class="flex items-center gap-2 mt-1 min-w-0">
											{#if entry.is_active}
												<span
													class="flex items-center gap-1.5 text-xs font-medium text-success shrink-0"
												>
													<span class="relative flex h-2 w-2">
														<span
															class="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75"
														></span>
														<span class="relative inline-flex rounded-full h-2 w-2 bg-success"
														></span>
													</span>
													Active
												</span>
											{/if}
											{#if entry.project}
												<span class="text-xs text-base-content/50 truncate">{entry.project}</span>
											{/if}
											{#if entry.tags?.length}
												<span class="flex items-center gap-1 flex-wrap min-w-0">
													{#each entry.tags.slice(0, 2) as tag}
														<TagChip {tag} size="xs" />
													{/each}
													{#if entry.tags.length > 2}
														<span
															class="badge badge-xs badge-ghost font-normal text-base-content/60"
															>+{entry.tags.length - 2}</span
														>
													{/if}
												</span>
											{/if}
											<span class="text-xs text-base-content/40 ml-auto shrink-0">
												{formatDate(entry.start_time)}
											</span>
										</span>
									</span>
								</button>
							{/each}
						</div>
						<div class="card-actions mt-4">
							<button
								class="btn btn-outline btn-sm"
								onmouseenter={() => prefetchRoute('/entries')}
								onclick={openTimeEntries}
							>
								View All Entries
							</button>
						</div>
					{:else}
						<div class="text-center py-8 text-base-content/50">
							<svg
								class="w-16 h-16 mx-auto mb-4"
								fill="none"
								stroke="currentColor"
								viewBox="0 0 24 24"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
								></path>
							</svg>
							<p>No recent entries</p>
						</div>
					{/if}
				</div>
			</div>

			<!-- Quick Actions -->
			<div class="card bg-base-100 shadow-lg">
				<div class="card-body">
					<h2 class="card-title mb-4">Quick Actions</h2>
					<div class="space-y-3">
						{#if activeEntry}
							<button
								class="btn btn-error btn-block justify-start"
								disabled={stopTimerMutation.isPending}
								onclick={() => void stopTimerMutation.mutateAsync(activeEntry.id)}
							>
								{#if stopTimerMutation.isPending}
									<span class="loading loading-spinner loading-sm mr-2"></span>
								{:else}
									<Square class="w-5 h-5 mr-2 shrink-0" />
								{/if}
								<span class="min-w-0 truncate">Stop Timer: {activeEntry.title}</span>
							</button>
						{:else}
							<button
								class="btn btn-primary btn-block justify-start"
								onmouseenter={() => prefetchRoute('/timer')}
								onclick={() => gotoApp('/timer')}
							>
								<span class="mr-2 shrink-0" aria-hidden="true">
									<Play size={20} />
								</span>

								Start New Timer
							</button>
						{/if}

						<button
							class="btn btn-outline btn-block justify-start"
							onclick={() => (showTasksModal = true)}
						>
							<span class="mr-2 shrink-0" aria-hidden="true">
								<Pencil size={20} />
							</span>
							Log Time Entry
						</button>

						<button
							class="btn btn-outline btn-block justify-start"
							onmouseenter={() => prefetchRoute('/reports')}
							onclick={() => gotoApp('/reports')}
						>
							<span class="mr-2 shrink-0" aria-hidden="true">
								<ChartColumn size={20} />
							</span>
							View Reports
						</button>

						<button
							class="btn btn-outline btn-block justify-start"
							onmouseenter={() => prefetchRoute('/entries')}
							onclick={openTimeEntries}
						>
							<span class="mr-2 shrink-0" aria-hidden="true">
								<ListChecks size={20} />
							</span>
							View All Entries
						</button>
					</div>
				</div>
			</div>
		</div>

		<!-- Active Timer Card -->
		{#if activeEntry}
			<div class="card bg-primary text-primary-content mt-8">
				<div class="card-body">
					<h2 class="card-title">Currently Tracking</h2>
					<p class="text-lg">{activeEntry.title}</p>
					<p class="text-sm opacity-70">{activeEntry.project}</p>
					<div class="card-actions justify-end">
						<button
							class="btn btn-secondary"
							onmouseenter={() => prefetchRoute('/timer')}
							onclick={() => gotoApp('/timer')}
						>
							View in Timer
						</button>
					</div>
				</div>
			</div>
		{/if}
	{/if}

	{#if showTasksModal}
		<TasksModal on:close={() => (showTasksModal = false)} />
	{/if}
</div>
