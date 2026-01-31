<script lang="ts">
	import { page } from '$app/stores';
	import { onMount } from 'svelte';

	// Get current page title from URL
	const pageTitles: Record<string, string> = {
		'/': 'Login',
		'/dashboard': 'Dashboard',
		'/timer': 'Timer',
		'/entries': 'Time Entries',
		'/settings': 'Settings',
		'/tasks': 'Tasks',
		'/processes': 'Process Monitor'
	};

	let currentTitle = $derived(pageTitles[$page.url.pathname] || 'Time Tracker');
	let isTauri = $state(false);

	onMount(async () => {
		try {
			const { getCurrentWindow } = await import('@tauri-apps/api/window');
			getCurrentWindow();
			isTauri = true;
		} catch {
			isTauri = false;
		}
	});
</script>

<!-- Navbar -->
<nav class="navbar w-full bg-base-100 border-b border-base-300 px-4 lg:px-6 h-16 relative">
	<!-- Left section: Sidebar toggle + Page title -->
	<div class="navbar-start">
		<!-- Sidebar toggle button (mobile only) -->
		<label
			for="app-drawer"
			aria-label="open sidebar"
			class="btn btn-square btn-ghost mr-2 hover:bg-base-200 lg:hidden"
		>
			<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="M4 6h16M4 12h16M4 18h16"
				></path>
			</svg>
		</label>

		<!-- Page title -->
		{#if !isTauri}
			<div class="hidden sm:block">
				<h1 class="text-xl font-semibold text-base-content">{currentTitle}</h1>
			</div>
		{/if}
	</div>

	<!-- Center section: Mobile page title -->
	{#if !isTauri}
		<div class="navbar-center lg:hidden absolute left-1/2 -translate-x-1/2">
			<h1 class="text-lg font-semibold text-base-content">{currentTitle}</h1>
		</div>
	{/if}

	<!-- Right section: Empty -->
</nav>
