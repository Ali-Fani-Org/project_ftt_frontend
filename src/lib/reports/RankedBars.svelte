<script lang="ts">
	import { formatDuration, resolvePrimaryRgb, type RankedItem } from './analytics';

	let {
		items,
		ariaLabel = 'Ranked time breakdown',
		maxRows
	}: {
		items: RankedItem[];
		ariaLabel?: string;
		maxRows?: number;
	} = $props();

	const visible = $derived(maxRows ? items.slice(0, maxRows) : items);
	const maxValue = $derived(
		visible.length ? Math.max(...visible.map((i) => i.totalSeconds), 1) : 1
	);

	// Guarded client-side read (SSR returns a fallback); re-run per mount so
	// theme switches that remount content pick up the new color.
	const primaryRgb = resolvePrimaryRgb();

	function rowColor(item: RankedItem): string {
		return item.color || `rgba(${primaryRgb}, 0.85)`;
	}

	function widthPct(item: RankedItem): number {
		return Math.max(2, (item.totalSeconds / maxValue) * 100);
	}
</script>

<ul class="flex flex-col gap-3.5" aria-label={ariaLabel}>
	{#each visible as item, i (item.name)}
		<li class="flex flex-col gap-1 group" style={`--delay: ${i * 40}ms`}>
			<div class="flex items-baseline justify-between gap-2 text-xs leading-none">
				<span class="font-medium truncate text-base-content/90" title={item.name}>{item.name}</span>
				<span class="shrink-0 font-mono tabular-nums text-[11px] text-base-content/60">
					{formatDuration(item.totalSeconds)}
				</span>
			</div>
			<div class="h-1.5 rounded-full bg-base-200 overflow-hidden">
				<div
					class="h-full rounded-full transition-all duration-700 ease-out animate-in"
					style={`width: ${widthPct(item)}%; background-color: ${rowColor(item)}; animation-delay: var(--delay);`}
				></div>
			</div>
		</li>
	{/each}
</ul>

<style>
	/* Grow bars in on mount, staggered per row; respects reduced motion. */
	@keyframes grow-x {
		from {
			transform: scaleX(0);
		}
		to {
			transform: scaleX(1);
		}
	}
	.animate-in {
		transform-origin: left;
		animation: grow-x 0.7s cubic-bezier(0.22, 1, 0.36, 1) backwards;
	}
	@media (prefers-reduced-motion: reduce) {
		.animate-in,
		.transition-all {
			animation: none !important;
			transition: none !important;
		}
	}
</style>
