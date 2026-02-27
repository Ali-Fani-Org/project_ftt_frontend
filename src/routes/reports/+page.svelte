<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { authToken } from '$lib/stores';
	import { timeEntries, type TimeEntry } from '$lib/api';
	import { get } from 'svelte/store';
	import { network } from '$lib/network';
	import { Clock, TrendingUp, Calendar, Zap, FolderKanban, CheckSquare, BarChart3 } from '@lucide/svelte';
	
	// New Chart Components
	import TimeTrendChart from '$lib/reports/TimeTrendChart.svelte';
	import TopTasksChart from '$lib/reports/TopTasksChart.svelte';

	let entries = $state<TimeEntry[]>([]);
	let loading = $state(true);
	let error = $state('');
	let isShowingCachedData = $state(false);

	// Filter state
	let selectedTimeRange = $state<string>('last30days');
	let customStartDate = $state<string>('');
	let customEndDate = $state<string>('');
	let showCustomDate = $state(false);

	// Summary stats
	let totalSeconds = $state(0);
	let totalEntries = $state(0);
	let avgDailySeconds = $state(0);
	let mostActiveProject = $state<string>('');
	let mostProductiveDay = $state<string>('');
	let peakHour = $state<number>(0);

	// Cache constants
	const CACHE_TTL = 24 * 60 * 60 * 1000;

	function getCacheKey(): string {
		return `reports_entries_cache_${selectedTimeRange}`;
	}

	function saveToCache(data: TimeEntry[]): void {
		try {
			const cacheData = {
				data,
				timestamp: Date.now(),
				filters: { timeRange: selectedTimeRange }
			};
			localStorage.setItem(getCacheKey(), JSON.stringify(cacheData));
		} catch (err) {
			console.warn('Failed to save reports to cache:', err);
		}
	}

	function loadFromCache(): TimeEntry[] | null {
		try {
			const cached = localStorage.getItem(getCacheKey());
			if (!cached) return null;

			const parsed = JSON.parse(cached);
			const age = Date.now() - parsed.timestamp;

			if (age > CACHE_TTL) {
				localStorage.removeItem(getCacheKey());
				return null;
			}

			return parsed.data || null;
		} catch (err) {
			console.warn('Failed to load reports from cache:', err);
			return null;
		}
	}

	onMount(async () => {
		const token = get(authToken);
		if (!token) {
			goto('/');
			return;
		}

		await loadData();
	});

	function formatLocalDate(date: Date): string {
		const year = date.getFullYear();
		const month = String(date.getMonth() + 1).padStart(2, '0');
		const day = String(date.getDate()).padStart(2, '0');
		return `${year}-${month}-${day}`;
	}

	function getTimeRangeDates(range: string): { start: string | null; end: string | null } {
		const now = new Date();
		let start: Date | null = null;
		let end: Date | null = null;

		switch (range) {
			case 'thisweek':
				const today = new Date(now);
				const dayOfWeekSat = (today.getDay() + 1) % 7; // Convert Sunday=0 to Saturday=0
				start = new Date(today);
				start.setDate(today.getDate() - dayOfWeekSat);
				end = now;
				break;
			case 'pastweek':
				const nowPast = new Date(now);
				const dayOfWeekPast = (nowPast.getDay() + 1) % 7;
				start = new Date(nowPast);
				start.setDate(nowPast.getDate() - dayOfWeekPast - 7);
				end = new Date(nowPast);
				end.setDate(nowPast.getDate() - dayOfWeekPast - 1);
				break;
			case 'thismonth':
				start = new Date(now.getFullYear(), now.getMonth(), 1);
				end = now;
				break;
			case 'lastmonth':
				start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
				end = new Date(now.getFullYear(), now.getMonth(), 0);
				break;
			case 'last30days':
				start = new Date(now);
				start.setDate(now.getDate() - 30);
				end = now;
				break;
			case 'yearly':
				start = new Date(now.getFullYear(), 0, 1);
				end = now;
				break;
			case 'custom':
				if (customStartDate && customEndDate) {
					start = new Date(customStartDate);
					end = new Date(customEndDate);
				}
				break;
			default:
				start = new Date(now);
				start.setDate(now.getDate() - 30);
				end = now;
		}

		return {
			start: start ? formatLocalDate(start) : null,
			end: end ? formatLocalDate(end) : null
		};
	}

	function getTimeRangeDisplay(range: string): string {
		switch (range) {
			case 'thisweek': return 'This Week';
			case 'pastweek': return 'Past Week';
			case 'thismonth': return 'This Month';
			case 'lastmonth': return 'Last Month';
			case 'last30days': return 'Last 30 Days';
			case 'yearly': return 'Yearly';
			default: return 'Last 30 Days';
		}
	}

	async function loadData() {
		try {
			loading = true;
			error = '';
			isShowingCachedData = false;

			if (!$network.isOnline) {
				const cachedData = loadFromCache();
				if (cachedData && cachedData.length > 0) {
					entries = cachedData;
					calculateStats();
					isShowingCachedData = true;
					loading = false;
					return;
				}
				error = 'No cached data available. Please connect to the internet.';
				loading = false;
				return;
			}

			const timeRange = getTimeRangeDates(selectedTimeRange);

			const result = await timeEntries.listWithFilters({
				start_date_after_tz: timeRange.start || undefined,
				start_date_before_tz: timeRange.end || undefined,
				limit: 500
			}) as any;

			entries = Array.isArray(result) ? result : result?.results || [];
			calculateStats();
			saveToCache(entries);
		} catch (err) {
			console.error('Error loading reports:', err);
			const cachedData = loadFromCache();
			if (cachedData && cachedData.length > 0) {
				entries = cachedData;
				calculateStats();
				isShowingCachedData = true;
				error = '';
				loading = false;
				return;
			}
			error = 'Failed to load report data';
		} finally {
			loading = false;
		}
	}

	// ============ ANALYTICS COMPUTATIONS ============

	// Day of week distribution (0 = Saturday, 1 = Sunday, ..., 6 = Friday)
	const dayOfWeekData = $derived.by(() => {
		const days = ['Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
		const dayTotals = [0, 0, 0, 0, 0, 0, 0];
		const dayCounts = [0, 0, 0, 0, 0, 0, 0];

		for (const entry of entries) {
			const day = (new Date(entry.start_time).getDay() + 1) % 7; // Convert to Saturday=0
			let duration = 0;
			if (entry.duration) {
				duration = parseInt(entry.duration, 10) || 0;
			} else if (entry.is_active) {
				duration = Math.floor((Date.now() - new Date(entry.start_time).getTime()) / 1000);
			}
			dayTotals[day] += duration;
			dayCounts[day]++;
		}

		return days.map((name, i) => ({
			name,
			totalSeconds: dayTotals[i],
			count: dayCounts[i],
			avgSeconds: dayCounts[i] > 0 ? Math.floor(dayTotals[i] / dayCounts[i]) : 0
		}));
	});

	// Hourly distribution (0-23)
	const hourlyData = $derived.by(() => {
		const hours = Array.from({ length: 24 }, (_, i) => ({
			hour: i,
			label: `${i.toString().padStart(2, '0')}:00`,
			totalSeconds: 0,
			count: 0
		}));

		for (const entry of entries) {
			const hour = new Date(entry.start_time).getHours();
			let duration = 0;
			if (entry.duration) {
				duration = parseInt(entry.duration, 10) || 0;
			} else if (entry.is_active) {
				duration = Math.floor((Date.now() - new Date(entry.start_time).getTime()) / 1000);
			}
			hours[hour].totalSeconds += duration;
			hours[hour].count++;
		}

		return hours;
	});

	// Project distribution
	const projectData = $derived.by(() => {
		const projectMap = new Map<string, { totalSeconds: number; count: number }>();

		for (const entry of entries) {
			const projectName = entry.project || 'No Project';
			let duration = 0;
			if (entry.duration) {
				duration = parseInt(entry.duration, 10) || 0;
			} else if (entry.is_active) {
				duration = Math.floor((Date.now() - new Date(entry.start_time).getTime()) / 1000);
			}

			const existing = projectMap.get(projectName) || { totalSeconds: 0, count: 0 };
			projectMap.set(projectName, {
				totalSeconds: existing.totalSeconds + duration,
				count: existing.count + 1
			});
		}

		return Array.from(projectMap.entries())
			.map(([name, data]) => ({ name, ...data }))
			.sort((a, b) => b.totalSeconds - a.totalSeconds);
	});

	// Tags distribution
	const tagsData = $derived.by(() => {
		const tagsMap = new Map<string, { totalSeconds: number; count: number }>();

		for (const entry of entries) {
			for (const tag of entry.tags || []) {
				let duration = 0;
				if (entry.duration) {
					duration = parseInt(entry.duration, 10) || 0;
				} else if (entry.is_active) {
					duration = Math.floor((Date.now() - new Date(entry.start_time).getTime()) / 1000);
				}

				const existing = tagsMap.get(tag) || { totalSeconds: 0, count: 0 };
				tagsMap.set(tag, {
					totalSeconds: existing.totalSeconds + duration,
					count: existing.count + 1
				});
			}
		}

		return Array.from(tagsMap.entries())
			.map(([name, data]) => ({ name, ...data }))
			.sort((a, b) => b.totalSeconds - a.totalSeconds)
			.slice(0, 10);
	});

	// Weekly trend (last few weeks)
	const weeklyTrend = $derived.by(() => {
		const weeks: { label: string; totalSeconds: number }[] = [];
		const now = new Date();

		for (let w = 3; w >= 0; w--) {
			const weekStart = new Date(now);
			weekStart.setDate(now.getDate() - (w * 7 + now.getDay()));
			const weekEnd = new Date(weekStart);
			weekEnd.setDate(weekStart.getDate() + 6);

			let total = 0;
			for (const entry of entries) {
				const entryDate = new Date(entry.start_time);
				if (entryDate >= weekStart && entryDate <= weekEnd) {
					let duration = 0;
					if (entry.duration) {
						duration = parseInt(entry.duration, 10) || 0;
					} else if (entry.is_active) {
						duration = Math.floor((Date.now() - new Date(entry.start_time).getTime()) / 1000);
					}
					total += duration;
				}
			}

			weeks.push({
				label: `Week ${4 - w}`,
				totalSeconds: total
			});
		}

		return weeks;
	});

	function calculateStats() {
		if (!entries || entries.length === 0) {
			totalSeconds = 0;
			totalEntries = 0;
			avgDailySeconds = 0;
			mostActiveProject = 'N/A';
			mostProductiveDay = 'N/A';
			peakHour = 0;
			return;
		}

		totalSeconds = 0;
		for (const entry of entries) {
			let durationSeconds = 0;
			if (entry.duration) {
				durationSeconds = parseInt(entry.duration, 10) || 0;
			} else if (entry.is_active) {
				durationSeconds = Math.floor((Date.now() - new Date(entry.start_time).getTime()) / 1000);
			}
			totalSeconds += durationSeconds;
		}

		totalEntries = entries.length;

		const timeRange = getTimeRangeDates(selectedTimeRange);
		const start = timeRange.start ? new Date(timeRange.start) : new Date();
		const end = timeRange.end ? new Date(timeRange.end) : new Date();
		const daysDiff = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1);
		avgDailySeconds = Math.floor(totalSeconds / daysDiff);

		let maxSeconds = 0;
		for (const p of projectData) {
			if (p.totalSeconds > maxSeconds) {
				maxSeconds = p.totalSeconds;
				mostActiveProject = p.name;
			}
		}

		let maxDaySeconds = 0;
		for (const d of dayOfWeekData) {
			if (d.totalSeconds > maxDaySeconds) {
				maxDaySeconds = d.totalSeconds;
				mostProductiveDay = d.name;
			}
		}

		let maxHourSeconds = 0;
		for (const h of hourlyData) {
			if (h.totalSeconds > maxHourSeconds) {
				maxHourSeconds = h.totalSeconds;
				peakHour = h.hour;
			}
		}
	}

	function formatDuration(seconds: number): string {
		if (isNaN(seconds) || seconds < 0) return '0h';
		const hours = Math.floor(seconds / 3600);
		const minutes = Math.floor((seconds % 3600) / 60);
		if (hours === 0) return `${minutes}m`;
		else if (minutes === 0) return `${hours}h`;
		else return `${hours}h ${minutes}m`;
	}

	function handleFilterChange() {
		if (selectedTimeRange === 'custom') {
			showCustomDate = true;
		} else {
			showCustomDate = false;
			loadData();
		}
	}

	function applyCustomDate() {
		if (customStartDate && customEndDate) loadData();
	}

	// Max values for chart scaling
	const maxDaySeconds = $derived(Math.max(...dayOfWeekData.map(d => d.totalSeconds), 1));
	const maxHourSeconds = $derived(Math.max(...hourlyData.map(h => h.totalSeconds), 1));
	const maxProjectSeconds = $derived(Math.max(...projectData.map(p => p.totalSeconds), 1));
	const maxWeekSeconds = $derived(Math.max(...weeklyTrend.map(w => w.totalSeconds), 1));
	const maxTagSeconds = $derived(Math.max(...tagsData.map(t => t.totalSeconds), 1));

	const chartColors = [
		'bg-primary',
		'bg-secondary',
		'bg-accent',
		'bg-info',
		'bg-success',
		'bg-warning',
		'bg-error'
	];

	function getChartColor(i: number): string {
		return chartColors[i % chartColors.length];
	}
</script>

<div class="min-h-screen p-4 md:p-6 lg:p-8">
	<div class="max-w-7xl mx-auto">
		<div class="mb-6">
			<h1 class="text-2xl font-bold">Reports</h1>
			<p class="text-base-content/60">Analyze your time tracking patterns</p>
		</div>

		<div class="card bg-base-100 shadow-lg mb-6">
			<div class="card-body p-4">
				<div class="flex flex-wrap gap-4 items-start">
					<div class="form-control flex-1 min-w-[200px] max-w-xs">
						<label class="label py-1" for="time-range">
							<span class="label-text text-xs font-medium">Time Range</span>
						</label>
						<select id="time-range" class="select select-bordered w-full" bind:value={selectedTimeRange} onchange={handleFilterChange}>
							<option value="thisweek">This Week</option>
							<option value="pastweek">Past Week</option>
							<option value="thismonth">This Month</option>
							<option value="lastmonth">Last Month</option>
							<option value="last30days">Last 30 Days</option>
							<option value="yearly">Yearly</option>
							<option value="custom">Custom Range</option>
						</select>
					</div>

					{#if showCustomDate}
						<div class="form-control flex-1 min-w-[160px] max-w-xs">
							<label class="label py-1" for="start-date"><span class="label-text text-xs font-medium">Start Date</span></label>
							<input id="start-date" type="date" class="input input-bordered w-full" bind:value={customStartDate} />
						</div>
						<div class="form-control flex-1 min-w-[160px] max-w-xs">
							<label class="label py-1" for="end-date"><span class="label-text text-xs font-medium">End Date</span></label>
							<input id="end-date" type="date" class="input input-bordered w-full" bind:value={customEndDate} />
						</div>
						<div class="form-control">
							<label class="label py-1"><span class="label-text text-xs opacity-0">Apply</span></label>
							<button class="btn btn-primary" onclick={applyCustomDate}>Apply</button>
						</div>
					{/if}

					{#if isShowingCachedData}
						<div class="form-control">
							<label class="label py-1"><span class="label-text text-xs opacity-0">Status</span></label>
							<div class="badge badge-warning">Offline - Showing Cached Data</div>
						</div>
					{/if}
				</div>
			</div>
		</div>

		{#if loading}
			<div class="flex justify-center py-12">
				<span class="loading loading-spinner loading-lg"></span>
			</div>
		{:else if error}
			<div class="alert alert-error"><span>{error}</span></div>
		{:else}
			<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
				<div class="card bg-base-200 shadow-lg">
					<div class="card-body p-4">
						<div class="flex items-center gap-2 mb-2">
							<Clock class="w-4 h-4 text-primary" />
							<h3 class="text-xs text-base-content/60 uppercase tracking-wide">Total Time</h3>
						</div>
						<p class="text-2xl font-bold">{formatDuration(totalSeconds)}</p>
						<p class="text-xs text-base-content/50">{totalEntries} entries</p>
					</div>
				</div>

				<div class="card bg-base-200 shadow-lg">
					<div class="card-body p-4">
						<div class="flex items-center gap-2 mb-2">
							<TrendingUp class="w-4 h-4 text-secondary" />
							<h3 class="text-xs text-base-content/60 uppercase tracking-wide">Daily Average</h3>
						</div>
						<p class="text-2xl font-bold">{formatDuration(avgDailySeconds)}</p>
						<p class="text-xs text-base-content/50">per day</p>
					</div>
				</div>

				<div class="card bg-base-200 shadow-lg">
					<div class="card-body p-4">
						<div class="flex items-center gap-2 mb-2">
							<FolderKanban class="w-4 h-4 text-accent" />
							<h3 class="text-xs text-base-content/60 uppercase tracking-wide">Top Project</h3>
						</div>
						<p class="text-xl font-bold truncate" title={mostActiveProject}>{mostActiveProject}</p>
						<p class="text-xs text-base-content/50">most time spent</p>
					</div>
				</div>

				<div class="card bg-base-200 shadow-lg">
					<div class="card-body p-4">
						<div class="flex items-center gap-2 mb-2">
							<Calendar class="w-4 h-4 text-info" />
							<h3 class="text-xs text-base-content/60 uppercase tracking-wide">Best Day</h3>
						</div>
						<p class="text-2xl font-bold">{mostProductiveDay}</p>
						<p class="text-xs text-base-content/50">most productive</p>
					</div>
				</div>

				<div class="card bg-base-200 shadow-lg">
					<div class="card-body p-4">
						<div class="flex items-center gap-2 mb-2">
							<Zap class="w-4 h-4 text-warning" />
							<h3 class="text-xs text-base-content/60 uppercase tracking-wide">Peak Hour</h3>
						</div>
						<p class="text-2xl font-bold">{peakHour.toString().padStart(2, '0')}:00</p>
						<p class="text-xs text-base-content/50">most productive</p>
					</div>
				</div>
			</div>

			<div class="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
				<!-- Time Trend Chart -->
				<div class="card bg-base-100 shadow-lg lg:col-span-2">
					<div class="card-body p-4">
						<h3 class="card-title text-sm mb-4 flex items-center gap-2">
							<TrendingUp class="w-4 h-4 text-primary" />
							Time Tracked
							<span class="text-xs text-base-content/50 font-normal">({getTimeRangeDates(selectedTimeRange).start} - {getTimeRangeDates(selectedTimeRange).end})</span>
						</h3>
						<TimeTrendChart {entries} dateRange={getTimeRangeDates(selectedTimeRange)} />
					</div>
				</div>

				<!-- Day of Week Distribution -->
				<div class="card bg-base-100 shadow-lg">
					<div class="card-body p-4">
						<h3 class="card-title text-sm mb-4 flex items-center gap-2">
							<Calendar class="w-4 h-4 text-secondary" />
							Time by Day
						</h3>
						{#if dayOfWeekData.every(d => d.totalSeconds === 0)}
							<div class="flex items-center justify-center h-48 text-base-content/50">No data</div>
						{:else}
							<div class="flex items-end justify-between h-48 gap-1">
								{#each dayOfWeekData as day, i}
									<div class="flex-1 flex flex-col items-center">
										<div 
											class="w-full {getChartColor(i)} rounded-t transition-all duration-300 hover:opacity-80"
											style="height: {Math.max(4, (day.totalSeconds / maxDaySeconds) * 100)}%"
											title="{day.name}: {formatDuration(day.totalSeconds)}"
										></div>
										<span class="text-xs text-base-content/60 mt-2">{day.name}</span>
									</div>
								{/each}
							</div>
						{/if}
					</div>
				</div>
			</div>

			<div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
				<!-- Top Tasks Chart -->
				<div class="card bg-base-100 shadow-lg">
					<div class="card-body p-4">
						<h3 class="card-title text-sm mb-4 flex items-center gap-2">
							<CheckSquare class="w-4 h-4 text-accent" />
							Top Tasks
						</h3>
						<TopTasksChart {entries} />
					</div>
				</div>

				<!-- Time by Project (Existing custom chart kept for variety) -->
				<div class="card bg-base-100 shadow-lg">
					<div class="card-body p-4">
						<h3 class="card-title text-sm mb-4 flex items-center gap-2">
							<FolderKanban class="w-4 h-4 text-info" />
							Time by Project
						</h3>
						{#if projectData.length === 0}
							<div class="flex items-center justify-center h-64 text-base-content/50">No data</div>
						{:else}
							<div class="space-y-4 max-h-64 overflow-y-auto pr-2">
								{#each projectData.slice(0, 8) as project, i}
									<div class="flex flex-col gap-1">
										<div class="flex justify-between items-center text-xs">
											<span class="font-medium truncate" title={project.name}>{project.name}</span>
											<span class="font-mono text-base-content/70">{formatDuration(project.totalSeconds)}</span>
										</div>
										<div class="bg-base-200 rounded-full h-2 overflow-hidden">
											<div class="{getChartColor(i)} h-full rounded-full transition-all duration-500" style="width: {(project.totalSeconds / maxProjectSeconds) * 100}%"></div>
										</div>
									</div>
								{/each}
							</div>
						{/if}
					</div>
				</div>
			</div>

			{#if entries.length > 0}
				<div class="card bg-base-100 shadow-lg">
					<div class="card-body p-4">
						<h3 class="card-title text-sm mb-4">Recent Entries ({entries.length} total)</h3>
						<div class="overflow-x-auto">
							<table class="table table-xs">
								<thead>
									<tr>
										<th>Date</th>
										<th>Title</th>
										<th>Project</th>
										<th>Tags</th>
										<th class="text-right">Duration</th>
									</tr>
								</thead>
								<tbody>
									{#each entries.slice(0, 15) as entry}
										<tr class="hover">
											<td class="text-xs">{new Date(entry.start_time).toLocaleDateString()}</td>
											<td class="text-xs truncate max-w-[200px]">{entry.title}</td>
											<td class="text-xs">{entry.project || '-'}</td>
											<td class="text-xs">
												{#if entry.tags?.length}
													<div class="flex gap-1 flex-wrap">
														{#each entry.tags.slice(0, 2) as tag}
															<span class="badge badge-xs badge-outline">{tag}</span>
														{/each}
													</div>
												{:else}
													-
												{/if}
											</td>
											<td class="text-xs text-right font-mono">{formatDuration(parseInt(entry.duration || '0', 10) || 0)}</td>
										</tr>
									{/each}
								</tbody>
							</table>
						</div>
						{#if entries.length > 15}
							<p class="text-xs text-base-content/50 mt-2 text-center">Showing 15 of {entries.length} entries</p>
						{/if}
					</div>
				</div>
			{/if}
		{/if}
	</div>
</div>
