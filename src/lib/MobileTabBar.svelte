<script lang="ts">
	import { Timer, LayoutDashboard, ListChecks, ChartColumn } from '@jis3r/icons';
	import { page } from '$app/stores';
	import { gotoApp, stripBase } from '$lib/navigation';
	import { prefetchRoute } from '$lib/queries/prefetch';

	let { drawerCheckbox }: { drawerCheckbox?: HTMLInputElement } = $props();

	const tabs = [
		{ name: 'Timer', href: '/timer', icon: Timer },
		{ name: 'Dash', href: '/dashboard', icon: LayoutDashboard },
		{ name: 'Entries', href: '/entries', icon: ListChecks },
		{ name: 'Reports', href: '/reports', icon: ChartColumn }
	] as const;

	const current = $derived(stripBase($page.url.pathname));
	const moreActive = $derived(current === '/settings' || current === '/profile');

	function isActive(href: string) {
		return current === href || (href !== '/' && current.startsWith(`${href}/`));
	}

	function drawer(): HTMLInputElement | null {
		return (
			drawerCheckbox ??
			(typeof document !== 'undefined'
				? (document.getElementById('app-drawer') as HTMLInputElement | null)
				: null)
		);
	}

	function go(href: string) {
		const el = drawer();
		if (el) el.checked = false;
		gotoApp(href);
	}

	function openMore() {
		const el = drawer();
		if (el) el.checked = true;
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
					class="flex h-full w-full min-h-11 flex-col items-center justify-center gap-0.5 px-1 text-[10px] font-medium leading-none whitespace-nowrap {isActive(
						tab.href
					)
						? 'text-primary'
						: 'text-base-content/60'}"
					aria-current={isActive(tab.href) ? 'page' : undefined}
					onclick={() => go(tab.href)}
					onmouseenter={() => prefetchRoute(tab.href)}
					onfocus={() => prefetchRoute(tab.href)}
				>
					<span class="inline-flex" aria-hidden="true"><tab.icon size={20} /></span>
					{tab.name}
				</button>
			</li>
		{/each}
		<li class="min-w-0">
			<button
				type="button"
				class="flex h-full w-full min-h-11 flex-col items-center justify-center gap-0.5 px-1 text-[10px] font-medium leading-none whitespace-nowrap {moreActive
					? 'text-primary'
					: 'text-base-content/60'}"
				aria-label="More"
				onclick={openMore}
			>
				<span class="inline-flex h-5 w-5 items-center justify-center" aria-hidden="true">
					<svg viewBox="0 0 24 24" fill="currentColor" class="h-5 w-5">
						<circle cx="6" cy="12" r="1.7" />
						<circle cx="12" cy="12" r="1.7" />
						<circle cx="18" cy="12" r="1.7" />
					</svg>
				</span>
				More
			</button>
		</li>
	</ul>
</nav>
