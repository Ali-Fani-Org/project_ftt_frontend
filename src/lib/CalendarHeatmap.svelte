<script lang="ts">
	import { onMount } from 'svelte';
	import { timeEntries, type TimeEntry, type PaginatedTimeEntries } from '$lib/api';
	import ky from 'ky';
	import { authToken, baseUrl } from '$lib/stores';
	import { get } from 'svelte/store';
	import confetti from 'canvas-confetti';
    var scalar = 2;

    var clock = confetti.shapeFromText({ text: '🕰️', scalar });
    var money = confetti.shapeFromText({ text: '💸', scalar });
    var money2 = confetti.shapeFromText({ text: '💰', scalar });
    var gold = confetti.shapeFromText({ text: '🪙', scalar });
    var star = confetti.shapeFromText({ text: '🌟', scalar });
    var fire = confetti.shapeFromText({ text: '🔥', scalar });

	// Per-day data structure
	interface HeatmapData {
		date: string; // YYYY-MM-DD
		value: number; // total seconds
		entries: TimeEntry[];
	}

	let days = $state<HeatmapData[]>([]);
	let weeks = $state<(HeatmapData | null)[][]>([]);
	let loading = $state(true);
	let error = $state('');
	let debugInfo = $state<{ start: string; end: string; total: number; inMonth: number } | null>(null);

	function formatLocalDate(date: Date): string {
		const year = date.getFullYear();
		const month = String(date.getMonth() + 1).padStart(2, '0');
		const day = String(date.getDate()).padStart(2, '0');
		return `${year}-${month}-${day}`;
	}

	const weekdayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
	let monthLabel = $state('');
	let currentMonth = $state(new Date());

	onMount(async () => {
		await loadMonthData(currentMonth);
	});

	async function loadMonthData(baseDate: Date) {
		try {
			loading = true;
			error = '';

			const anchor = new Date(baseDate.getFullYear(), baseDate.getMonth(), 1);
			const firstDayOfMonth = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
			const lastDayOfMonth = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
			monthLabel = firstDayOfMonth.toLocaleString(undefined, { month: 'short', year: 'numeric' });

			const startDate = formatLocalDate(firstDayOfMonth);
			const endDate = formatLocalDate(lastDayOfMonth);

			// Collect all entries across all pages using direct API calls
			let allEntries: TimeEntry[] = [];
			let currentPageUrl: string | null = `api/time_entries/?start_date_after_tz=${startDate}&start_date_before_tz=${endDate}&limit=200`;
			let hasMorePages = true;

			// Fetch all pages using pagination
			while (hasMorePages && currentPageUrl) {
				// Create the API request with proper authentication
				const token = get(authToken);
				const baseUrlValue = get(baseUrl);
				// Construct full URL - if currentPageUrl is a relative path, add baseUrl with trailing slash
				let fullUrl;
				if (currentPageUrl.startsWith('http')) {
					// If currentPageUrl is already a full URL (from next/previous), use as-is
					fullUrl = currentPageUrl;
				} else {
					// If currentPageUrl is a relative path, prepend the base URL with trailing slash
					fullUrl = `${baseUrlValue}${baseUrlValue.endsWith('/') ? '' : '/'}${currentPageUrl}`;
				}

				const response = await ky.get(fullUrl, {
					headers: {
						'Authorization': token ? `Token ${token}` : '',
					}
				}).json<PaginatedTimeEntries>();

				allEntries = allEntries.concat(response.results);
				currentPageUrl = response.next; // This will be null when no more pages are available
				hasMorePages = !!currentPageUrl; // Continue if there's a next page
			}

			const dayMap = new Map<string, HeatmapData>();
			const daysInMonth = lastDayOfMonth.getDate();

			for (let day = 1; day <= daysInMonth; day++) {
				const d = new Date(anchor.getFullYear(), anchor.getMonth(), day);
				const ds = formatLocalDate(d);
				dayMap.set(ds, { date: ds, value: 0, entries: [] });
			}

			// Helper function to get start of day in Tehran timezone
			function getStartOfDay(dateStr: string): Date {
				const isoString = `${dateStr}T00:00:00+03:30`;
				return new Date(isoString);
			}

			// Helper function to get end of day in Tehran timezone
			function getEndOfDay(dateStr: string): Date {
				const isoString = `${dateStr}T23:59:59.999+03:30`;
				return new Date(isoString);
			}

			for (const entry of allEntries) {
				// Calculate total duration
				let totalSeconds = 0;
				if (entry.duration) {
					totalSeconds = parseInt(entry.duration, 10) || 0;
				} else if (entry.is_active) {
					const startTime = new Date(entry.start_time).getTime();
					totalSeconds = Math.floor((Date.now() - startTime) / 1000);
				}

				if (totalSeconds <= 0) continue;

				// Extract date strings from API timestamps (already in Tehran timezone)
				const startDateStr = entry.start_time.split('T')[0];
				const endDateStr = entry.end_time ? entry.end_time.split('T')[0] : startDateStr;

				// Parse full datetime objects
				const startTime = new Date(entry.start_time);
				const endTime = entry.end_time ? new Date(entry.end_time) : new Date();

				// Create a set of all days this entry spans
				const daysSet = new Set<string>();
				let currentDay = new Date(startDateStr);
				const endDayObj = new Date(endDateStr);

				while (currentDay <= endDayObj) {
					const dayStr = currentDay.toISOString().split('T')[0];
					daysSet.add(dayStr);
					currentDay.setDate(currentDay.getDate() + 1);
				}

				if (daysSet.size === 0) {
					daysSet.add(startDateStr);
				}

				// Distribute time across all days the entry spans
				for (const dayStr of daysSet) {
					const dayData = dayMap.get(dayStr);
					if (!dayData) continue;

					// Determine time boundaries for this specific day
					let dayStartTime: Date;
					let dayEndTime: Date;

					if (dayStr === startDateStr && dayStr === endDateStr) {
						// Single day entry
						dayStartTime = startTime;
						dayEndTime = endTime;
					} else if (dayStr === startDateStr) {
						// First day of multi-day entry
						dayStartTime = startTime;
						dayEndTime = getEndOfDay(dayStr);
					} else if (dayStr === endDateStr) {
						// Last day of multi-day entry
						dayStartTime = getStartOfDay(dayStr);
						dayEndTime = endTime;
					} else {
						// Middle day - full 24 hours
						dayStartTime = getStartOfDay(dayStr);
						dayEndTime = getEndOfDay(dayStr);
					}

					// Calculate duration for this specific day
					const dayDurationMs = dayEndTime.getTime() - dayStartTime.getTime();
					const dayDurationSeconds = Math.floor(dayDurationMs / 1000);

					// Add entry to this day (only once, on the start day)
					if (dayStr === startDateStr) {
						dayData.entries.push(entry);
					}

					// Add the day's portion of time
					dayData.value += dayDurationSeconds;
				}
			}

			days = Array.from(dayMap.values()).sort(
				(a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
			);

			const inMonthEntries = days.reduce((sum, d) => sum + d.entries.length, 0);
			debugInfo = {
				start: startDate,
				end: endDate,
				total: allEntries.length,
				inMonth: inMonthEntries
			};

			buildWeeks(firstDayOfMonth, lastDayOfMonth, dayMap);
			loading = false;
		} catch (err) {
			console.error('Failed to load current month data:', err);
			error = 'Failed to load activity data';
			loading = false;
		}
	}

	function goToPreviousMonth() {
		const next = new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1);
		currentMonth = next;
		loadMonthData(next);
	}

	function goToNextMonth() {
		const next = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1);
		currentMonth = next;
		loadMonthData(next);
	}

	function buildWeeks(firstDay: Date, lastDay: Date, dayMap: Map<string, HeatmapData>) {
		// Build a Sunday-Saturday grid, but only days within [firstDay, lastDay]
		// get data; days outside the month are null placeholders.
		const start = new Date(firstDay);
		start.setDate(firstDay.getDate() - firstDay.getDay()); // back to Sunday

		const end = new Date(lastDay);
		end.setDate(lastDay.getDate() + (6 - lastDay.getDay())); // forward to Saturday

		const result: (HeatmapData | null)[][] = [];
		let currentWeek: (HeatmapData | null)[] = [];

		for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
			let day: HeatmapData | null = null;
			if (d >= firstDay && d <= lastDay) {
				const ds = formatLocalDate(d);
				day = dayMap.get(ds) ?? null;
			}
			currentWeek.push(day);
			if (d.getDay() === 6) {
				result.push(currentWeek);
				currentWeek = [];
			}
		}

		if (currentWeek.length > 0) {
			result.push(currentWeek);
		}

		// Ensure we always render 6 weeks to keep widget height stable
		while (result.length < 6) {
			result.push(new Array<HeatmapData | null>(7).fill(null));
		}

		weeks = result;
	}

	function secondsToHours(seconds: number): number {
		if (!seconds || isNaN(seconds)) return 0;
		return Math.round((seconds / 3600) * 10) / 10;
	}

	function secondsToHHMMSS(seconds: number): string {
		if (!seconds || isNaN(seconds)) {
			return '00:00:00';
		}
		const hours = Math.floor(seconds / 3600);
		const minutes = Math.floor((seconds % 3600) / 60);
		const secs = seconds % 60;
		return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
	}

	// 10-step brightness gradient anchored on the theme primary color - REVERSED for correct intensity mapping
	const activityPalette = [
		'bg-base-300/40', // no activity
		'bg-primary/55',  // lowest activity
		'bg-primary/60',
		'bg-primary/65',
		'bg-primary/70',
		'bg-primary/75',
		'bg-primary/80',
		'bg-primary/85',
		'bg-primary/90',
		'bg-primary/95',  // highest activity
	];

	const maxDaySeconds = $derived(
		Math.max(0, ...days.map((d) => d.value).filter(v => !isNaN(v) && v !== null))
	);

	function activityClass(seconds: number): string {
		if (seconds === 0 || maxDaySeconds === 0 || isNaN(maxDaySeconds)) return activityPalette[0];
		const level = seconds / maxDaySeconds; // 0..1
		const idx = Math.min(
			activityPalette.length - 1,
			Math.max(1, Math.ceil(level * (activityPalette.length - 1)))
		);
		return activityPalette[idx];
	}

	function cellClasses(day: HeatmapData | null): string {
		if (!day) {
			// Outside current month: keep the grid structure but show an empty cell
			return 'aspect-square rounded-md bg-transparent';
		}
		return `aspect-square rounded-md border border-base-300 ${activityClass(day.value)}`;
	}

	const totalHours = $derived(
		Math.round((days.reduce((sum, d) => (d.value || 0) + sum, 0) / 3600) * 10) / 10
	);

	// Easter egg: confetti for days with ≥8 hours
	let confettiFiredFor = $state<Set<string>>(new Set());

	async function handleDayHover(event: MouseEvent, day: HeatmapData | null) {
		if (!day || confettiFiredFor.has(day.date) || isNaN(day.value)) return;
		const seconds = day.value;
		if (seconds >= 8 * 3600) {
			const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
			const x = rect.left + rect.width / 2;
			const y = rect.top + rect.height / 2;
			await confetti({
				particleCount: 30,
				spread: 60,
				startVelocity: 40,
				origin: { x: x / window.innerWidth, y: y / window.innerHeight },
				// colors: ['#ff0', '#0f0', '#0ff', '#f0f', '#00f', '#f00'],
				ticks: 30,
				gravity: 0.9,
				scalar: 2,
				shapes: [clock,money,money2,gold,star,fire],
				disableForReducedMotion: true,
			});
			confettiFiredFor.add(day.date);
		}
	}

	function resetConfettiForDay(date: string) {
		confettiFiredFor.delete(date);
	}
</script>

<div class="p-4 card bg-base-100 shadow-lg border border-base-200 glass-card h-full flex flex-col">
	<h2 class="card-title text-sm mb-4 flex items-center">
		<svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
			<path
				stroke-linecap="round"
				stroke-linejoin="round"
				stroke-width="2"
				d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
			></path>
		</svg>
		Current Month Activity
	</h2>

	{#if error}
		<div class="alert alert-error">
			<span>{error}</span>
		</div>
	{:else}
		<div class="w-full flex flex-col items-center gap-4">
			<!-- Month navigation -->
			<div class="flex items-center justify-center gap-2 text-xs font-semibold text-base-content/80">
				<button
					class="btn btn-ghost btn-xs"
					onclick={goToPreviousMonth}
					aria-label="Previous month"
					disabled={loading}
				>
					‹
				</button>
				<div class="flex items-center gap-2">
					<div>{monthLabel}</div>
					{#if loading}
						<span class="loading loading-xs loading-spinner"></span>
					{/if}
				</div>
				<button
					class="btn btn-ghost btn-xs"
					onclick={goToNextMonth}
					aria-label="Next month"
					disabled={loading}
				>
					›
				</button>
			</div>

			<!-- Weekday labels -->
			<div class="grid grid-cols-7 gap-1 w-full max-w-xs text-[10px] text-base-content/60">
				{#each weekdayLabels as label}
					<div class="h-4 flex items-center justify-center">{label}</div>
				{/each}
			</div>

			<!-- Calendar grid / skeleton -->
			<div class="w-full max-w-xs">
				{#if loading}
					<!-- Single skeleton block approximating 7x6 grid ratio -->
					<div class="w-full aspect-[7/6] rounded-md skeleton"></div>
				{:else}
					<div class="grid grid-cols-7 gap-1 fade-in-grid">
						{#each weeks as week}
							{#each week as day}
								<div
									class="tooltip tooltip-top"
									data-tip={day
										? `${day.date} • ${secondsToHHMMSS(day.value)} • ${day.entries.length} entries`
										: ''}
								>
									<div
										class={cellClasses(day)}
										onmouseenter={(e) => handleDayHover(e, day)}
										onmouseleave={() => day && resetConfettiForDay(day.date)}
									></div>
								</div>
							{/each}
						{/each}
					</div>
				{/if}
			</div>
			<div class="mt-2 text-center">
				<p class="text-xs text-base-content/60">Total hours tracked: {totalHours}h</p>
			</div>
		</div>
	{/if}
</div>

<style>
	.fade-in-grid {
		animation: fadeInUp 220ms ease-out;
		animation-fill-mode: both;
	}

	@keyframes fadeInUp {
		from {
			opacity: 0;
			transform: translateY(4px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}
	.glass-card {
		background-color: color-mix(in oklch, oklch(var(--b1)) 85%, transparent);
		border-color: oklch(var(--b2));
		backdrop-filter: blur(10px);
	}
</style>
