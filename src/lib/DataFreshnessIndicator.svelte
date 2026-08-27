<script lang="ts">
	import { RefreshCw } from '@jis3r/icons';
	import { Pause } from '@lucide/svelte';
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

	// -----------------------------------------------------------------------
	// UI: a compact pill matching the top bar's network-status pill — a
	// status dot + age line, and a clickable countdown ring that doubles as
	// the refresh button.
	// -----------------------------------------------------------------------

	const RING_RADIUS = 13.5;
	const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

	const isOnline = $derived($network.isOnline);
	const autoRefreshOn = $derived($autoRefreshEnabled && $refreshInterval > 0);
	const lastUpdateMs = $derived(
		$dataFreshness.lastUpdate ? $dataFreshness.lastUpdate.getTime() : null
	);

	// Fraction of the interval still remaining — the ring depletes as time
	// runs out. Clamped so a sliver always stays visible while waiting.
	const ringFraction = $derived(
		autoRefreshOn && isOnline && lastUpdateMs !== null
			? Math.min(1, Math.max(0.02, countdown / $refreshInterval))
			: 1
	);

	const statusKey = $derived(
		!isOnline
			? 'offline'
			: lastUpdateMs === null
				? 'never'
				: $dataFreshness.isFresh
					? 'fresh'
					: $dataFreshness.isOutdated
						? 'outdated'
						: 'stale'
	);

	// Per-state styling: the status dot, the countdown ring stroke, and the
	// soft glow behind the ring all share one color language with the state.
	const STATUS_STYLES = {
		fresh: {
			dot: 'animate-pulse bg-success ring-2 ring-success/25 motion-reduce:animate-none',
			ring: 'stroke-primary'
		},
		outdated: {
			dot: 'bg-info ring-2 ring-info/25',
			ring: 'stroke-info'
		},
		stale: {
			dot: 'bg-warning ring-2 ring-warning/25',
			ring: 'stroke-warning'
		},
		never: {
			dot: 'bg-base-content/30',
			ring: 'stroke-base-content/40'
		},
		offline: {
			dot: 'bg-base-content/40',
			ring: 'stroke-base-content/40'
		}
	} as const;

	const statusDotClass = $derived(STATUS_STYLES[statusKey].dot);
	const ringStrokeClass = $derived(STATUS_STYLES[statusKey].ring);

	const statusText = $derived.by(() => {
		if (!isOnline) {
			return lastUpdateMs !== null
				? `Offline — updated ${formatAge(currentTime - lastUpdateMs)}`
				: 'Offline — cached data';
		}
		if (lastUpdateMs === null) return 'Never updated';
		return `Updated ${formatAge(currentTime - lastUpdateMs)}`;
	});

	const statusTitle = $derived.by(() => {
		if (!isOnline) return 'Offline — showing cached data';
		if (lastUpdateMs === null) return 'No data loaded yet';
		if ($dataFreshness.isFresh) return 'Data is fresh';
		if ($dataFreshness.isOutdated) return 'Data is outdated';
		return 'Data is stale';
	});

	const ringTitle = $derived.by(() => {
		if (refreshing) return 'Refreshing…';
		if (!isOnline) return 'Offline — refresh unavailable';
		if (autoRefreshOn) {
			return `Next refresh in ${formatCountdown(countdown)} — click to refresh now`;
		}
		return 'Auto-refresh off — click to refresh manually';
	});

	const ringIcon = $derived.by(() => (autoRefreshOn ? RefreshCw : Pause));
</script>

<div
	class="flex items-center rounded-full border border-base-300/60 bg-base-200/60 py-0.5 pl-2.5 pr-1 backdrop-blur transition-colors hover:bg-base-200/80"
>
	<!-- Status dot + age -->
	<div class="flex items-center gap-1.5" title={statusTitle}>
		<span class="h-2 w-2 shrink-0 rounded-full {statusDotClass}"></span>
		<span class="text-xs font-medium text-base-content/70 {isOnline ? 'hidden md:inline' : ''}">
			{statusText}
		</span>
	</div>

	{#if isOnline}
		<!-- Countdown ring = refresh button -->
		<button
			class="relative ml-1.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-base-content/10 focus-visible:ring-2 focus-visible:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-60"
			onclick={handleRefresh}
			disabled={refreshing}
			title={ringTitle}
			aria-label={ringTitle}
		>
			<svg class="absolute inset-0 h-full w-full -rotate-90" viewBox="0 0 32 32" aria-hidden="true">
				<circle
					cx="16"
					cy="16"
					r={RING_RADIUS}
					fill="none"
					stroke-width="2.75"
					class="stroke-base-300/70"
				></circle>
				<circle
					cx="16"
					cy="16"
					r={RING_RADIUS}
					fill="none"
					stroke-width="2.75"
					stroke-linecap="round"
					stroke-dasharray={RING_CIRCUMFERENCE}
					stroke-dashoffset={RING_CIRCUMFERENCE * (1 - ringFraction)}
					class="{ringStrokeClass} transition-[stroke-dashoffset,stroke] duration-1000 ease-linear motion-reduce:transition-none"
				></circle>
			</svg>
			{#if refreshing}
				<span class="loading loading-spinner loading-xs text-primary"></span>
			{:else}
				{@const RingIcon = ringIcon}
				<span class="inline-flex" aria-hidden="true">
					<RingIcon size={13} strokeWidth={2.6} class="text-base-content/70"></RingIcon>
				</span>
			{/if}
		</button>
	{/if}
</div>
