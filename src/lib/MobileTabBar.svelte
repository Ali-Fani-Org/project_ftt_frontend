<script lang="ts">
	import { Timer, LayoutDashboard, ListChecks, ChartColumn, Settings } from '@jis3r/icons';
	import { page } from '$app/stores';
	import { gotoApp, stripBase } from '$lib/navigation';
	import { prefetchRoute } from '$lib/queries/prefetch';
	import { useActiveTimer } from '$lib/queries/timeEntries';

	const tabs = [
		{ name: 'Timer', href: '/timer', icon: Timer },
		{ name: 'Dash', href: '/dashboard', icon: LayoutDashboard },
		{ name: 'Entries', href: '/entries', icon: ListChecks },
		{ name: 'Reports', href: '/reports', icon: ChartColumn },
		{ name: 'Settings', href: '/settings', icon: Settings }
	] as const;

	const current = $derived(stripBase($page.url.pathname));
	const activeTimerQuery = useActiveTimer();
	const isTimerRunning = $derived(!!activeTimerQuery.data);

	function isActive(href: string) {
		return current === href || (href !== '/' && current.startsWith(`${href}/`));
	}

	function go(href: string) {
		gotoApp(href);
	}
</script>

<nav
	class="fixed inset-x-0 bottom-0 z-40 border-t border-base-300/70 bg-base-100/95 pb-[env(safe-area-inset-bottom,0px)] backdrop-blur-md lg:hidden"
	aria-label="Primary"
>
	<ul class="grid h-14 grid-cols-5">
		{#each tabs as tab}
			<li class="min-w-0">
				<button
					type="button"
					class="relative flex h-full w-full min-h-11 flex-col items-center justify-center gap-0.5 px-1 text-[10px] font-medium leading-none whitespace-nowrap {isActive(
						tab.href
					)
						? 'text-primary'
						: 'text-base-content/60'}"
					aria-current={isActive(tab.href) ? 'page' : undefined}
					onclick={() => go(tab.href)}
					onmouseenter={() => prefetchRoute(tab.href)}
					onfocus={() => prefetchRoute(tab.href)}
				>
					<span class="relative inline-flex" aria-hidden="true">
						<tab.icon
							size={20}
							class={tab.href === '/timer' && isTimerRunning ? 'tab-timer-running' : ''}
						/>
						{#if tab.href === '/timer' && isTimerRunning}
							<span class="absolute -right-0.5 -top-0.5 flex h-2 w-2">
								<span
									class="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75"
								></span>
								<span class="relative inline-flex h-2 w-2 rounded-full bg-success"></span>
							</span>
						{/if}
					</span>
					{tab.name}
				</button>
			</li>
		{/each}
	</ul>
</nav>

<style>
	:global(.tab-timer-running) {
		animation: tab-timer-spin 6s linear infinite;
	}
	@keyframes tab-timer-spin {
		to {
			transform: rotate(360deg);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		:global(.tab-timer-running) {
			animation: none;
		}
	}
</style>
