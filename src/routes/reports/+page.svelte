<script lang="ts">
	import type { TimeEntry } from '$lib/api';
	import { network } from '$lib/network';
	import { goto } from '$app/navigation';
	import { slide } from 'svelte/transition';
	import {
		Clock,
		TrendingUp,
		Calendar,
		Zap,
		FolderKanban,
		CheckSquare,
		Hash as HashIcon,
		Flame,
		Timer,
		Play
	} from '@lucide/svelte';
	import { ChartColumn } from '@jis3r/icons';

	import PageHeader from '$lib/PageHeader.svelte';
	import DailyActivityChart from '$lib/reports/DailyActivityChart.svelte';
	import PunchcardHeatmap from '$lib/reports/PunchcardHeatmap.svelte';
	import RankedBars from '$lib/reports/RankedBars.svelte';
	import TagChip from '$lib/TagChip.svelte';
	import { useFilteredTimeEntries, type TimeEntryFilters } from '$lib/queries/timeEntries';
	import {
		avgDailySeconds,
		computeTotalSeconds,
		dayOfWeekData,
		formatDuration,
		getEntryDurationSeconds,
		getPreviousRange,
		getTimeRangeDates,
		getTimeRangeDisplay,
		hourlyData,
		percentDelta,
		projectData,
		spanDays,
		tagsData,
		topTasksData,
		TIME_RANGE_OPTIONS,
		type RankedItem
	} from '$lib/reports/analytics';

	// ============================= Filter state =============================

	let selectedTimeRange = $state('thismonth');
	let showCustomDate = $state(false);
	// Committed custom dates (drive the query); pending inputs only commit on Apply.
	let customStartDate = $state('');
	let customEndDate = $state('');
	let pendingStart = $state('');
	let pendingEnd = $state('');

	const currentRange = $derived(
		getTimeRangeDates(selectedTimeRange, { customStart: customStartDate, customEnd: customEndDate })
	);
	const prevRange = $derived(
		getPreviousRange(selectedTimeRange, { customStart: customStartDate, customEnd: customEndDate })
	);

	function getCurrentFilters(): TimeEntryFilters {
		return {
			start_date_after_tz: currentRange.start ?? undefined,
			start_date_before_tz: currentRange.end ?? undefined,
			limit: 500
		};
	}

	function getPrevFilters(): TimeEntryFilters {
		// An empty window when there is no previous period (e.g. custom picked
		// without dates yet) so the delta query never drags the whole dataset.
		return {
			start_date_after_tz: prevRange.start ?? '1970-01-01',
			start_date_before_tz: prevRange.end ?? '1970-01-02',
			limit: 500
		};
	}

	// Refetch cadence comes from the Data Refresh Settings via queryClient
	// defaults, so the settings page controls how often these reports revalidate.
	const entriesQuery = useFilteredTimeEntries(getCurrentFilters, () => ({
		keepPreviousData: true
	}));
	const prevQuery = useFilteredTimeEntries(getPrevFilters, () => ({
		keepPreviousData: true
	}));

	let entries = $derived<TimeEntry[]>(entriesQuery.data?.results ?? []);
	let prevEntries = $derived<TimeEntry[]>(prevQuery.data?.results ?? []);
	let loading = $derived(entriesQuery.isPending);
	let error = $derived(
		!entriesQuery.data && entriesQuery.isError ? 'Failed to load report data' : ''
	);
	let isShowingCachedData = $derived(!$network.isOnline && entries.length > 0);

	// ============================= Analytics ===============================

	const totalSeconds = $derived(computeTotalSeconds(entries));
	const totalEntries = $derived(entries.length);
	const avgDaily = $derived(avgDailySeconds(entries, currentRange));
	const days = $derived(spanDays(currentRange));
	const projects = $derived(projectData(entries));
	const tasks = $derived(topTasksData(entries, 6));
	const tags = $derived(tagsData(entries, 10));
	const dow = $derived(dayOfWeekData(entries));
	const hours = $derived(hourlyData(entries));

	const bestDay = $derived(
		dow.reduce((best, d) => (d.totalSeconds > best.totalSeconds ? d : best), dow[0])
	);
	const peakHour = $derived(
		hours.reduce((best, h) => (h.totalSeconds > best.totalSeconds ? h : best), hours[0])
	);
	const hasPeak = $derived(hours.some((h) => h.totalSeconds > 0));

	const topProject = $derived(
		projects[0]
			? {
					...projects[0],
					share: totalSeconds > 0 ? Math.round((projects[0].totalSeconds / totalSeconds) * 100) : 0
				}
			: null
	);

	// Period-over-period deltas (null until the previous-period query resolves).
	const hasPrev = $derived(prevQuery.data != null);
	const prevTotal = $derived(computeTotalSeconds(prevEntries));
	const prevAvg = $derived(avgDailySeconds(prevEntries, prevRange));
	const totalDelta = $derived(hasPrev ? percentDelta(totalSeconds, prevTotal) : null);
	const avgDelta = $derived(hasPrev ? percentDelta(avgDaily, prevAvg) : null);

	const hasAnyData = $derived(totalEntries > 0 && totalSeconds > 0);

	// ============================= UI helpers ==============================

	const cardCls = 'card bg-base-100 border border-base-200 shadow-sm';

	const stats = $derived([
		{
			icon: Clock,
			tint: 'bg-primary/10 text-primary',
			label: 'Total time',
			value: formatDuration(totalSeconds),
			sub: `${totalEntries} entr${totalEntries === 1 ? 'y' : 'ies'}`,
			delta: totalDelta,
			deltaSlot: true
		},
		{
			icon: TrendingUp,
			tint: 'bg-secondary/10 text-secondary',
			label: 'Daily avg',
			value: formatDuration(avgDaily),
			sub: `per day · ${days} day${days === 1 ? '' : 's'}`,
			delta: avgDelta,
			deltaSlot: true
		},
		{
			icon: FolderKanban,
			tint: 'bg-accent/10 text-accent',
			label: 'Top project',
			value: topProject?.name ?? '—',
			sub: topProject
				? `${formatDuration(topProject.totalSeconds)} · ${topProject.share}%`
				: 'no projects yet',
			delta: null,
			deltaSlot: false
		},
		{
			icon: Calendar,
			tint: 'bg-info/10 text-info',
			label: 'Best day',
			value: bestDay && bestDay.totalSeconds > 0 ? bestDay.name : '—',
			sub:
				bestDay && bestDay.totalSeconds > 0 ? formatDuration(bestDay.totalSeconds) : 'no data yet',
			delta: null,
			deltaSlot: false
		},
		{
			icon: Zap,
			tint: 'bg-warning/10 text-warning',
			label: 'Peak hour',
			value: hasPeak ? `${String(peakHour.hour).padStart(2, '0')}:00` : '—',
			sub: hasPeak ? formatDuration(peakHour.totalSeconds) : 'most productive',
			delta: null,
			deltaSlot: false
		}
	]);

	const projectItems = $derived<RankedItem[]>(
		projects
			.slice(0, 8)
			.map((p) => ({ name: p.name, totalSeconds: p.totalSeconds, count: p.count }))
	);
	const taskItems = $derived<RankedItem[]>(
		tasks.map((t) => ({ name: t.name, totalSeconds: t.totalSeconds, count: t.count }))
	);
	const tagItems = $derived<RankedItem[]>(
		tags.map((t) => ({ name: t.name, totalSeconds: t.totalSeconds, color: t.color ?? null }))
	);
	const tagHalves = $derived([
		tagItems.slice(0, Math.ceil(tagItems.length / 2)),
		tagItems.slice(Math.ceil(tagItems.length / 2))
	]);

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

	function pickRange(value: string) {
		selectedTimeRange = value;
		if (value === 'custom') {
			pendingStart = customStartDate;
			pendingEnd = customEndDate;
			showCustomDate = true;
		} else {
			showCustomDate = false;
		}
	}

	function applyCustomDate() {
		customStartDate = pendingStart;
		customEndDate = pendingEnd;
		showCustomDate = false;
	}

	async function retry() {
		await Promise.all([entriesQuery.refetch(), prevQuery.refetch()]);
	}
</script>

<div class="min-h-screen p-4 md:p-6 lg:p-8">
	<div class="max-w-7xl mx-auto flex flex-col gap-6">
		<!-- ============================= Header ============================= -->
		<PageHeader
			icon={ChartColumn}
			title="Reports"
			subtitle={`Where your hours go — ${getTimeRangeDisplay(selectedTimeRange).toLowerCase()}`}
		>
			<div class="flex flex-col items-end gap-2">
				{#if isShowingCachedData}
					<div class="badge badge-warning badge-outline gap-1.5 py-3 px-3">
						<span class="loading loading-dots loading-xs"></span>
						Offline — showing cached data
					</div>
				{/if}
				<div
					class="flex flex-wrap justify-end gap-1 bg-base-100 border border-base-200 rounded-full p-1 shadow-sm"
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
			</div>
		</PageHeader>

		<!-- ======================= Custom range panel ======================= -->
		{#if showCustomDate}
			<div
				class="card bg-base-100 border border-base-200 shadow-sm"
				transition:slide={{ duration: 150 }}
			>
				<div class="card-body p-3.5">
					<div class="flex flex-wrap items-end gap-3">
						<label class="form-control">
							<span
								class="label-text text-[11px] font-semibold uppercase tracking-wider text-base-content/60 pb-1"
								>From</span
							>
							<input type="date" class="input input-bordered input-sm" bind:value={pendingStart} />
						</label>
						<label class="form-control">
							<span
								class="label-text text-[11px] font-semibold uppercase tracking-wider text-base-content/60 pb-1"
								>To</span
							>
							<input type="date" class="input input-bordered input-sm" bind:value={pendingEnd} />
						</label>
						<button
							class="btn btn-primary btn-sm"
							onclick={applyCustomDate}
							disabled={!pendingStart || !pendingEnd}
						>
							Apply range
						</button>
						<button class="btn btn-ghost btn-sm" onclick={() => (showCustomDate = false)}
							>Cancel</button
						>
						<p class="text-[11px] text-base-content/40 w-full">
							Deltas compare against the same-length window right before this range.
						</p>
					</div>
				</div>
			</div>
		{/if}

		<!-- =========================== Error state =========================== -->
		{#if error}
			<div class="alert alert-error shadow-sm justify-between">
				<span>{error}</span>
				<button class="btn btn-sm btn-outline btn-error" onclick={retry}>Retry</button>
			</div>
		{:else if loading && !entriesQuery.data}
			<!-- ======================== Skeleton states ======================== -->
			<div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
				{#each Array.from({ length: 5 }) as _}
					<div class="card bg-base-100 border border-base-200 shadow-sm">
						<div class="card-body p-3.5 gap-3">
							<div class="skeleton h-7 w-7 rounded-lg"></div>
							<div class="skeleton h-5 w-24"></div>
							<div class="skeleton h-3 w-16"></div>
						</div>
					</div>
				{/each}
			</div>
			<div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
				<div class="card bg-base-100 border border-base-200 shadow-sm lg:col-span-2">
					<div class="card-body">
						<div class="skeleton h-72 w-full rounded-xl"></div>
					</div>
				</div>
				<div class="card bg-base-100 border border-base-200 shadow-sm">
					<div class="card-body space-y-4">
						{#each Array.from({ length: 5 }) as _}
							<div class="skeleton h-3 w-full"></div>
						{/each}
					</div>
				</div>
			</div>
			<div class="skeleton h-48 w-full rounded-2xl"></div>
		{:else}
			<!-- ============================ Stat strip =========================== -->
			<div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
				{#each stats as stat}
					{@const TileIcon = stat.icon}
					<div class="{cardCls} hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
						<div class="card-body p-3.5 gap-1.5">
							<div class="flex items-center justify-between gap-2">
								<div class="flex items-center gap-2 min-w-0">
									<div
										class="w-7 h-7 rounded-lg {stat.tint} flex items-center justify-center shrink-0"
									>
										<TileIcon class="w-3.5 h-3.5" />
									</div>
									<span
										class="text-[10px] font-semibold uppercase tracking-wider text-base-content/50 truncate"
									>
										{stat.label}
									</span>
								</div>
								{#if stat.deltaSlot}
									{#if stat.delta !== null}
										<span
											class="badge badge-sm border-0 gap-0.5 px-1.5 {stat.delta >= 0
												? 'bg-success/15 text-success'
												: 'bg-error/15 text-error'}"
											title="vs previous period"
										>
											{stat.delta >= 0 ? '▲' : '▼'}
											{Math.abs(stat.delta)}%
										</span>
									{:else}
										<span
											class="text-[10px] text-base-content/40"
											title="No previous period to compare">vs prior</span
										>
									{/if}
								{/if}
							</div>
							<p class="text-xl font-bold tabular-nums leading-none truncate" title={stat.value}>
								{stat.value}
							</p>
							<p class="text-[11px] text-base-content/50 truncate">{stat.sub}</p>
						</div>
					</div>
				{/each}
			</div>

			<!-- ====================== Whole-page empty state ====================== -->
			{#if !hasAnyData}
				<div class="card bg-base-100 border border-base-200 shadow-sm">
					<div class="card-body items-center text-center py-14 gap-3">
						<div
							class="w-14 h-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center"
						>
							<Timer class="w-7 h-7" />
						</div>
						<h2 class="text-lg font-bold">No tracked time in this range</h2>
						<p class="text-sm text-base-content/50 max-w-sm">
							Start a timer and this page lights up with trends, your weekly rhythm, and where the
							hours went.
						</p>
						<button class="btn btn-primary mt-2" onclick={() => goto('/timer')}>
							<Play class="w-4 h-4" />
							Start tracking
						</button>
					</div>
				</div>
			{:else}
				<!-- ===================== Bento row 1: hero + projects ===================== -->
				<div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
					<div class="{cardCls} lg:col-span-2">
						<div class="card-body p-5">
							<div class="flex items-center justify-between gap-3 mb-1">
								<div class="flex items-center gap-2.5 min-w-0">
									<div
										class="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0"
									>
										<TrendingUp class="w-4 h-4" />
									</div>
									<h3 class="card-title text-sm">Daily activity</h3>
								</div>
								<span
									class="badge badge-ghost badge-sm text-base-content/60 font-normal shrink-0 tabular-nums"
								>
									{currentRange.start ?? '—'} – {currentRange.end ?? '—'}
								</span>
							</div>
							<DailyActivityChart {entries} range={currentRange} />
						</div>
					</div>

					<div class={cardCls}>
						<div class="card-body p-5">
							<div class="flex items-center gap-2.5 mb-4">
								<div
									class="w-8 h-8 rounded-lg bg-accent/10 text-accent flex items-center justify-center shrink-0"
								>
									<FolderKanban class="w-4 h-4" />
								</div>
								<h3 class="card-title text-sm">By project</h3>
							</div>
							{#if projectItems.length}
								<RankedBars items={projectItems} ariaLabel="Time by project" />
							{:else}
								<p class="text-sm text-base-content/50">No project data in this range.</p>
							{/if}
						</div>
					</div>
				</div>

				<!-- ===================== Bento row 2: rhythm + tasks ===================== -->
				<div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
					<div class="{cardCls} lg:col-span-2">
						<div class="card-body p-5">
							<div class="flex items-center gap-2.5 mb-4">
								<div
									class="w-8 h-8 rounded-lg bg-secondary/10 text-secondary flex items-center justify-center shrink-0"
								>
									<Flame class="w-4 h-4" />
								</div>
								<div class="min-w-0">
									<h3 class="card-title text-sm">Work rhythm</h3>
									<p class="text-xs text-base-content/50">
										when your hours land — Sat to Fri, 00:00 to 23:00
									</p>
								</div>
							</div>
							<PunchcardHeatmap {entries} />
						</div>
					</div>

					<div class={cardCls}>
						<div class="card-body p-5">
							<div class="flex items-center gap-2.5 mb-4">
								<div
									class="w-8 h-8 rounded-lg bg-info/10 text-info flex items-center justify-center shrink-0"
								>
									<CheckSquare class="w-4 h-4" />
								</div>
								<h3 class="card-title text-sm">Top tasks</h3>
							</div>
							{#if taskItems.length}
								<RankedBars items={taskItems} ariaLabel="Top tasks by time" />
							{:else}
								<p class="text-sm text-base-content/50">No task titles in this range.</p>
							{/if}
						</div>
					</div>
				</div>

				<!-- =========================== Top tags =========================== -->
				<div class={cardCls}>
					<div class="card-body p-5">
						<div class="flex items-center gap-2.5 mb-4">
							<div
								class="w-8 h-8 rounded-lg bg-warning/10 text-warning flex items-center justify-center shrink-0"
							>
								<HashIcon class="w-4 h-4" />
							</div>
							<div class="min-w-0">
								<h3 class="card-title text-sm">Top tags</h3>
								<p class="text-xs text-base-content/50">
									time by tag — colored with each tag's color
								</p>
							</div>
						</div>
						{#if tagItems.length}
							<div class="grid md:grid-cols-2 gap-x-10 gap-y-5">
								{#each tagHalves as half, halfIndex}
									{#if half.length}
										<RankedBars items={half} ariaLabel={`Top tags (part ${halfIndex + 1})`} />
									{/if}
								{/each}
							</div>
						{:else}
							<p class="text-sm text-base-content/50">No tags used in this range.</p>
						{/if}
					</div>
				</div>

				<!-- ======================== Recent activity ======================== -->
				<div class={cardCls}>
					<div class="card-body p-5">
						<div class="flex items-center gap-2.5 mb-4">
							<div
								class="w-8 h-8 rounded-lg bg-base-200 text-base-content/70 flex items-center justify-center shrink-0"
							>
								<Clock class="w-4 h-4" />
							</div>
							<h3 class="card-title text-sm">Recent activity</h3>
							<span class="badge badge-ghost badge-sm text-base-content/60 font-normal">
								Showing {Math.min(12, entries.length)} of {entries.length}
							</span>
						</div>
						<div class="overflow-x-auto -mx-5 px-5">
							<table class="table table-xs">
								<thead>
									<tr class="text-[11px] uppercase tracking-wider text-base-content/50">
										<th>Date</th>
										<th>Title</th>
										<th>Project</th>
										<th>Tags</th>
										<th class="text-right">Duration</th>
									</tr>
								</thead>
								<tbody>
									{#each entries.slice(0, 12) as entry}
										<tr class="hover">
											<td class="text-xs whitespace-nowrap tabular-nums">
												{new Date(entry.start_time).toLocaleDateString(undefined, {
													month: 'short',
													day: 'numeric'
												})}
											</td>
											<td class="text-xs truncate max-w-[220px] font-medium" title={entry.title}
												>{entry.title}</td
											>
											<td class="text-xs whitespace-nowrap">
												{#if entry.project}
													<span class="flex items-center gap-1.5">
														<span
															class="w-2 h-2 rounded-full {projectDotClass(
																entry.project
															)} inline-block shrink-0"
														></span>
														{entry.project}
													</span>
												{:else}
													<span class="text-base-content/40">—</span>
												{/if}
											</td>
											<td class="text-xs">
												{#if entry.tags?.length}
													<div class="flex gap-1 flex-wrap items-center">
														{#each entry.tags.slice(0, 3) as tag}
															<TagChip {tag} size="xs" />
														{/each}
														{#if entry.tags.length > 3}
															<span class="badge badge-xs badge-ghost font-normal"
																>+{entry.tags.length - 3}</span
															>
														{/if}
													</div>
												{:else}
													<span class="text-base-content/40">—</span>
												{/if}
											</td>
											<td class="text-xs text-right font-mono tabular-nums">
												{formatDuration(getEntryDurationSeconds(entry))}
											</td>
										</tr>
									{/each}
								</tbody>
							</table>
						</div>
					</div>
				</div>
			{/if}
		{/if}
	</div>
</div>
