<script lang="ts">
	import { Chart, type ChartDefinition } from '@tanstack/charts/svelte';

	/**
	 * Thin wrapper around TanStack Charts' Svelte adapter.
	 * The heavy lifting (data, scales, marks) lives in the `definition`
	 * built with defineChart(); this component only hosts it.
	 */
	let {
		definition,
		ariaLabel,
		height = 240
	}: {
		definition: ChartDefinition;
		ariaLabel: string;
		height?: number;
	} = $props();
</script>

<Chart {definition} {ariaLabel} {height} />
