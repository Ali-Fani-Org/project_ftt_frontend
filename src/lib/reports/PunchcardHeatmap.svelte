<script lang="ts">
	import type { TimeEntry } from '$lib/api';
	import {
		DAY_LABELS_SAT_FIRST,
		formatDuration,
		heatmapMatrix,
		resolvePrimaryRgb
	} from './analytics';

	let {
		entries,
		cellSize = 14
	}: {
		entries: TimeEntry[];
		cellSize?: number;
	} = $props();

	const rgb = $state(resolvePrimaryRgb());

	const matrix = $derived(heatmapMatrix(entries));
	const hasData = $derived(matrix.totalSeconds > 0);

	/** 5 visual buckets (index 0 = no time) mapped to alpha intensities. */
	function levelAlpha(seconds: number): number | null {
		if (seconds <= 0 || matrix.maxSeconds <= 0) return null;
		const ratio = seconds / matrix.maxSeconds;
		if (ratio <= 0.25) return 0.3;
		if (ratio <= 0.5) return 0.52;
		if (ratio <= 0.75) return 0.72;
		return 0.92;
	}

	// Precompute per-cell alpha to keep the template lean.
	const cells = $derived.by(() =>
		matrix.values.map((row) => row.map((seconds) => ({ seconds, alpha: levelAlpha(seconds) })))
	);

	const legendLevels = [null, 0.3, 0.52, 0.72, 0.92];

	function cellTitle(dayIndex: number, hour: number, seconds: number): string {
		if (seconds === 0) return '';
		return `${DAY_LABELS_SAT_FIRST[dayIndex]} ${hour.toString().padStart(2, '0')}:00 — ${formatDuration(seconds)}`;
	}
</script>

<div class="flex flex-col gap-3">
	{#if hasData}
		<div
			class="grid gap-[3px] overflow-x-auto pb-1"
			style="grid-template-columns: 3rem repeat(24, minmax({cellSize}px, 1fr));"
			role="img"
			aria-label="Time tracked per weekday and hour"
		>
			<!-- Hour ruler -->
			<div></div>
			{#each Array.from({ length: 24 }) as _, hour}
				<div
					class="text-[9px] text-base-content/40 text-center leading-none pt-0.5 tabular-nums select-none"
				>
					{hour % 3 === 0 ? hour.toString().padStart(2, '0') : ''}
				</div>
			{/each}

			<!-- One row per weekday (Saturday-first, consistent with every other view here) -->
			{#each cells as row, dayIndex}
				<div
					class="text-[10px] text-base-content/50 flex items-center justify-end pr-2 leading-none select-none uppercase tracking-wider"
				>
					{DAY_LABELS_SAT_FIRST[dayIndex]}
				</div>
				{#each row as cell, hour}
					<div
						class="rounded-[3px] transition-transform duration-100 hover:scale-[1.35] {cell.seconds ===
						0
							? 'bg-base-200'
							: ''}"
						style={cell.alpha !== null ? `background-color: rgba(${rgb}, ${cell.alpha});` : ''}
						title={cellTitle(dayIndex, hour, cell.seconds)}
					></div>
				{/each}
			{/each}
		</div>

		<!-- Legend -->
		<div class="flex items-center justify-end gap-1.5 text-[10px] text-base-content/40 select-none">
			<span>less</span>
			{#each legendLevels as level}
				<div
					class="w-3 h-3 rounded-sm border border-base-content/10"
					style={level !== null
						? `background-color: rgba(${rgb}, ${level});`
						: 'background-color: var(--color-base-200);'}
				></div>
			{/each}
			<span>more</span>
		</div>
	{:else}
		<div class="flex items-center justify-center h-56 text-center">
			<p class="text-sm text-base-content/50">Track some tasks to see your weekly rhythm</p>
		</div>
	{/if}
</div>
