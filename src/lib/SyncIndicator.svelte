<script lang="ts">
	import { useIsFetching } from '@tanstack/svelte-query';

	// Shows while ANY query in the app is fetching (refetch, pagination, invalidation).
	// Rendered inside <PersistQueryClientProvider> so the query context is available.
	let fetchingCount = $derived(useIsFetching().current);
</script>

{#if fetchingCount > 0}
	<div
		class="fixed bottom-4 right-4 flex items-center gap-2 bg-base-100 border border-base-300 rounded-full px-3 py-1.5 shadow-lg z-40 text-xs text-base-content/70"
	>
		<span class="loading loading-spinner loading-xs"></span>
		Syncing…
	</div>
{/if}
