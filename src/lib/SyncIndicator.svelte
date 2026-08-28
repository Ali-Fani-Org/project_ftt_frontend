<script lang="ts">
	import { useIsFetching } from '@tanstack/svelte-query';
	import { onDestroy } from 'svelte';

	// Prefetches are intentionally silent; this indicator is for data needed by
	// the visible page, not speculative sidebar warmups.
	let fetchingCount = $derived(useIsFetching({ predicate: (query) => !query.meta?.prefetch }).current);
	let showIndicator = $state(false);
	let hideTimer: ReturnType<typeof setTimeout> | undefined;
	let showTimer: ReturnType<typeof setTimeout> | undefined;

	$effect(() => {
		const fetching = fetchingCount > 0;
		if (fetching) {
			clearTimeout(hideTimer);
			if (!showIndicator && !showTimer) {
				showTimer = setTimeout(() => {
					showIndicator = true;
					showTimer = undefined;
				}, 350);
			}
		} else {
			clearTimeout(showTimer);
			showTimer = undefined;
			if (showIndicator && !hideTimer) {
				hideTimer = setTimeout(() => {
					showIndicator = false;
					hideTimer = undefined;
				}, 500);
			}
		}
	});

	onDestroy(() => {
		clearTimeout(showTimer);
		clearTimeout(hideTimer);
	});
</script>

{#if showIndicator}
	<div
		class="fixed bottom-4 right-4 flex items-center gap-2 bg-base-100 border border-base-300 rounded-full px-3 py-1.5 shadow-lg z-40 text-xs text-base-content/70"
		aria-live="polite"
	>
		<span class="loading loading-spinner loading-xs"></span>
		Updating…
	</div>
{/if}
