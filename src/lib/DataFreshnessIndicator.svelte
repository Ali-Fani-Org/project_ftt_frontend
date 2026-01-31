<script lang="ts">
	import { dataFreshness } from '$lib/dataFreshness';
	import { network } from '$lib/network';
	import { autoRefreshEnabled, refreshInterval } from '$lib/stores';

	let { onRefresh } = $props<{ onRefresh: () => Promise<void> }>();

	let refreshing = $state(false);
	let countdown = $state(0);
	async function handleRefresh() {
		if (refreshing || !$network.isOnline) return;

		refreshing = true;
		try {
			await onRefresh();
		} finally {
			refreshing = false;
		}
	}

	// Calculate countdown to next refresh
	$effect(() => {
		if ($autoRefreshEnabled && $network.isOnline && $refreshInterval > 0) {
			let intervalId: number | null = null;

			const updateCountdown = () => {
				const lastUpdate = $dataFreshness.lastUpdate;
				if (lastUpdate) {
					const elapsed = Date.now() - lastUpdate.getTime();
					const remaining = Math.max(0, $refreshInterval - elapsed);
					countdown = remaining;
				}
			};

			// Update immediately
			updateCountdown();

			// Update every second
			intervalId = window.setInterval(updateCountdown, 1000);

			// Clean up interval
			return () => {
				if (intervalId) {
					clearInterval(intervalId);
				}
			};
		} else {
			countdown = 0;
		}
	});

	// Reactive current time that updates every second
	let currentTime = $state(Date.now());

	$effect(() => {
		const interval = setInterval(() => {
			currentTime = Date.now();
		}, 1000);

		return () => clearInterval(interval);
	});

	// Helper function to format age
	function formatAge(ms: number): string {
		if (ms === Infinity) return 'Never';
		if (ms < 0) return 'Just now';

		const seconds = Math.floor(ms / 1000);
		if (seconds < 60) return `${seconds}s ago`;

		const minutes = Math.floor(seconds / 60);
		if (minutes < 60) return `${minutes}m ago`;

		const hours = Math.floor(minutes / 60);
		if (hours < 24) return `${hours}h ago`;

		const days = Math.floor(hours / 24);
		return `${days}d ago`;
	}

	// Helper function to format countdown
	function formatCountdown(ms: number): string {
		if (ms <= 0) return 'Now';

		const seconds = Math.floor(ms / 1000);
		if (seconds < 60) return `${seconds}s`;

		const minutes = Math.floor(seconds / 60);
		if (minutes < 60) return `${minutes}m ${Math.floor(seconds % 60)}s`;

		const hours = Math.floor(minutes / 60);
		return `${hours}h ${Math.floor(minutes % 60)}m`;
	}
</script>

<div class="flex items-center gap-4 p-3 bg-base-200 rounded-lg">
	<!-- Status indicator -->
	<div class="flex items-center gap-2">
		{#if $dataFreshness.isFresh}
			<span class="badge badge-success badge-sm">Fresh</span>
		{:else if $dataFreshness.isOutdated}
			<span class="badge badge-info badge-sm">Outdated</span>
		{:else}
			<span class="badge badge-warning badge-sm">Stale</span>
		{/if}

		<span class="text-sm text-base-content/70">
			Last updated: {formatAge(
				$dataFreshness.lastUpdate ? currentTime - $dataFreshness.lastUpdate.getTime() : Infinity
			)}
		</span>
	</div>

	<!-- Auto-refresh countdown -->
	{#if $autoRefreshEnabled && $network.isOnline && $refreshInterval > 0}
		<span class="text-xs text-base-content/60">
			Next refresh in: {formatCountdown(countdown)}
		</span>
	{:else if !$network.isOnline}
		<span class="text-xs text-base-content/60"> Offline mode </span>
	{/if}

	<!-- Manual refresh button -->
	<button
		class="btn btn-sm btn-ghost gap-2"
		onclick={handleRefresh}
		disabled={refreshing || !$network.isOnline}
	>
		{#if refreshing}
			<span class="loading loading-spinner loading-xs"></span>
			Refreshing...
		{:else}
			<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
				/>
			</svg>
			Refresh
		{/if}
	</button>
</div>
