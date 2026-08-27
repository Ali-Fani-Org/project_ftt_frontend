<script lang="ts">
	import type { TimeEntry } from '$lib/api';
	import { defineChart } from '@tanstack/charts';
	import { tooltip } from '@tanstack/charts/tooltip';
	import { scaleBand } from '@tanstack/charts/scales/band';
	import { scalePoint } from '@tanstack/charts/scales/point';
	import { scaleLinear } from '@tanstack/charts/scales/linear';
	import { barY } from '@tanstack/charts/bar';
	import { areaY } from '@tanstack/charts/area';
	import { BarChart3, Activity } from '@lucide/svelte';
	import TanStackChart from './TanStackChart.svelte';
	import { formatDuration, resolvePrimaryColor, trendSeries, type DateRange } from './analytics';

	let {
		entries,
		range,
		height = 260
	}: {
		entries: TimeEntry[];
		range: DateRange;
		height?: number;
	} = $props();

	let mode = $state<'bars' | 'area'>('bars');

	// Zero-filled series across the whole selected range; the unit (day/week/
	// month) adapts to the span so yearly ranges stay readable.
	const series = $derived(trendSeries(entries, range));

	/** Short axis labels; the tooltip's default x value carries them as-is. */
	const chartData = $derived(
		series.buckets.map((b) => ({
			label: b.label,
			fullLabel: b.fullLabel,
			hours: b.totalSeconds > 0 ? +(b.totalSeconds / 3600).toFixed(2) : 0,
			human: formatDuration(b.totalSeconds)
		}))
	);

	const hasData = $derived(chartData.some((d) => d.hours > 0));

	// Resolve the theme primary for SVG fills. Reading data-theme inside the
	// derivation keeps this in sync with how the page previously re-evaluated
	// colors around theme switches.
	const primaryColor = $derived.by(() => {
		if (typeof document !== 'undefined') document.documentElement.getAttribute('data-theme');
		return resolvePrimaryColor();
	});

	const unitAxisLabel = $derived(
		series.unit === 'day' ? 'Day' : series.unit === 'week' ? 'Week' : 'Month'
	);

	const chartDefinition = $derived.by(() => {
		if (!hasData) return null;

		if (mode === 'bars') {
			return defineChart({
				marks: [
					barY(chartData, {
						id: 'activity-bars',
						x: 'label',
						y: 'hours',
						fill: primaryColor,
						fillOpacity: 0.85,
						radius: 3
					})
				],
				scales: {
					x: {
						scale: () => scaleBand<string>().padding(0.12),
						axis: { label: unitAxisLabel }
					},
					y: { scale: scaleLinear, nice: true, grid: true, axis: { label: 'Hours' } }
				},
				tooltip
			});
		}

		return defineChart({
			marks: [
				areaY(chartData, {
					id: 'activity-area',
					x: 'label',
					y: 'hours',
					fill: primaryColor,
					fillOpacity: 0.22,
					stroke: primaryColor,
					strokeWidth: 2
				})
			],
			scales: {
				x: {
					scale: () => scalePoint<string>(),
					axis: { label: unitAxisLabel }
				},
				y: { scale: scaleLinear, nice: true, grid: true, axis: { label: 'Hours' } }
			},
			tooltip
		});
	});
</script>

<div class="flex flex-col gap-3">
	<!-- Mode toggle -->
	<div class="flex justify-end">
		<div class="join border border-base-200 rounded-lg overflow-hidden">
			<button
				type="button"
				class="btn btn-xs join-item {mode === 'bars'
					? 'bg-primary/15 text-primary hover:bg-primary/25 border-primary/30'
					: 'btn-ghost'}"
				aria-pressed={mode === 'bars'}
				onclick={() => (mode = 'bars')}
			>
				<BarChart3 class="w-3.5 h-3.5" />
				Bars
			</button>
			<button
				type="button"
				class="btn btn-xs join-item {mode === 'area'
					? 'bg-primary/15 text-primary hover:bg-primary/25 border-primary/30'
					: 'btn-ghost'}"
				aria-pressed={mode === 'area'}
				onclick={() => (mode = 'area')}
			>
				<Activity class="w-3.5 h-3.5" />
				Trend
			</button>
		</div>
	</div>

	{#if chartDefinition}
		<TanStackChart
			definition={chartDefinition}
			ariaLabel="Time tracked over the selected period"
			{height}
		/>
	{:else}
		<div class="flex flex-col items-center justify-center h-56 text-center gap-2">
			<Activity class="w-8 h-8 text-base-content/20" />
			<p class="text-sm text-base-content/50">No activity in this range yet</p>
		</div>
	{/if}
</div>
