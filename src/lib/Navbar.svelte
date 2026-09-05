<script lang="ts">
	import { page } from '$app/stores';
	import { onMount, onDestroy } from 'svelte';
	import { Clock, Minus, Minimize, Maximize, X, PinOff } from '@jis3r/icons';
	import { Pin } from '@lucide/svelte';
	import DataFreshnessIndicator from '$lib/DataFreshnessIndicator.svelte';
	import { network } from '$lib/network';
	import { minimizeToTray, closeToTray } from '$lib/stores';
	import { queryClient } from '$lib/queryClient';
	import logger from '$lib/logger';
	import { stripBase } from '$lib/navigation';

	// ------------------------------------------------------------------
	// Unified app bar — one 56px bar in both the browser and the Tauri
	// desktop shell. Left: brand + current page. Center: drag region in
	// Tauri. Right: network status, the global refresh ring, and (in Tauri)
	// the window controls.
	// ------------------------------------------------------------------

	// Current page title from URL
	const pageTitles: Record<string, string> = {
		'/': 'Login',
		'/dashboard': 'Dashboard',
		'/timer': 'Timer',
		'/entries': 'Time Entries',
		'/settings': 'Settings',
		'/tasks': 'Tasks',
		'/reports': 'Reports',
		'/profile': 'Profile'
	};

	// $page.url.pathname includes the deployment base path (if any) — strip
	// it before looking up the app-relative title.
	let currentTitle = $derived(pageTitles[stripBase($page.url.pathname)] || 'Time Tracker');

	// --- Tauri window plumbing -----------------------------------------
	let isTauri = $state(false);
	let appWindow: any = null;
	let isTimeEntriesWindow = $state(false);
	let isAlwaysOnTop = $state(false);
	let isMaximized = $state(false);
	let unlistenResize: (() => void) | null = null;

	// Windows draws its own window chrome because tauri.windows.conf.json sets
	// decorations:false. macOS and Linux keep the native OS-drawn titlebar, so
	// we must NOT render custom controls nor act as a drag region there.
	let useCustomTitlebar = $state(false);

	let minimizeToTrayValue = $state(false);
	let closeToTrayValue = $state(false);

	const unsubscribeMin = minimizeToTray.subscribe((value: boolean) => {
		minimizeToTrayValue = value;
	});
	const unsubscribeClose = closeToTray.subscribe((value: boolean) => {
		closeToTrayValue = value;
	});

	onDestroy(() => {
		unsubscribeMin();
		unsubscribeClose();
		if (unlistenResize) unlistenResize();
	});

	onMount(async () => {
		try {
			if (!('__TAURI_INTERNALS__' in window)) return; // plain browser — no window chrome
			const { getCurrentWindow } = await import('@tauri-apps/api/window');
			appWindow = getCurrentWindow();
			isTauri = true;

			// Custom (frontend-drawn) window controls only match the Windows
			// decorations:false setup; macOS/Linux use the native titlebar.
			try {
				const os = await import('@tauri-apps/plugin-os');
				useCustomTitlebar = os.platform() === 'windows';
			} catch {
				useCustomTitlebar = true; // safe fallback: webview chrome was configured
			}

			const winTitle = await appWindow.title();
			isTimeEntriesWindow = winTitle === 'Time Entries';
			if (useCustomTitlebar) {
				isAlwaysOnTop = await appWindow.isAlwaysOnTop();
				isMaximized = await appWindow.isMaximized();

				// Listen for window resize/maximize events to update icon state
				unlistenResize = await appWindow.listen('tauri://resize', async () => {
					isMaximized = await appWindow?.isMaximized();
				});
			}
		} catch (error) {
			logger.error('Navbar: Tauri init failed:', error);
			isTauri = false;
		}
	});

	// --- Window controls ----------------------------------------------
	function minimize() {
		if (minimizeToTrayValue) {
			appWindow?.hide();
		} else {
			appWindow?.minimize();
		}
	}

	async function toggleMaximize() {
		await appWindow?.toggleMaximize();
		isMaximized = await appWindow?.isMaximized();
	}

	function close() {
		if (closeToTrayValue) {
			appWindow?.hide();
		} else {
			appWindow?.close();
		}
	}

	async function toggleAlwaysOnTop() {
		isAlwaysOnTop = !isAlwaysOnTop;
		await appWindow?.setAlwaysOnTop(isAlwaysOnTop);
	}

	// Drag: only when not grabbing an interactive element (buttons, inputs).
	// Only applies with a custom titlebar (i.e. Windows decorations:false).
	async function handleBarMouseDown(event: MouseEvent) {
		if (!useCustomTitlebar) return;
		if (event.button !== 0) return;
		const target = event.target as HTMLElement;
		if (target.closest('button, a, input, select, [role="img"], .window-controls')) return;
		try {
			await appWindow?.startDragging();
		} catch (error) {
			logger.error('Failed to start dragging:', error);
		}
	}

	async function handleBarDoubleClick(event: MouseEvent) {
		if (!useCustomTitlebar) return;
		const target = event.target as HTMLElement;
		if (target.closest('button, a, input, select, .window-controls')) return;
		try {
			await toggleMaximize();
		} catch (error) {
			logger.error('Failed to toggle maximize:', error);
		}
	}

	// --- Network status -----------------------------------------------
	const netState = $derived.by(() => {
		if (!$network.isOnline) return 'offline';
		if ($network.isChecking) return 'checking';
		return 'online';
	});
	const netDotClass = $derived(
		netState === 'online'
			? 'bg-success'
			: netState === 'checking'
				? 'bg-warning animate-pulse'
				: 'bg-error'
	);
	const netLabel = $derived(
		netState === 'online' ? 'Online' : netState === 'checking' ? 'Checking…' : 'Offline'
	);

	// --- Global refresh ------------------------------------------------
	async function refreshAll() {
		await queryClient.invalidateQueries();
		if (typeof window !== 'undefined') {
			import('$lib/dataFreshness')
				.then(({ dataFreshnessManager }) => {
					dataFreshnessManager.updateTimestamp('global');
				})
				.catch(() => {
					// Ignore import errors when offline
				});
		}
	}
</script>

<!--
	Unified app bar. In Tauri the whole bar is the drag region (buttons and
	the right-side cluster are excluded in the mouse handlers above). The
	mousedown/dblclick listeners are required for window dragging and are
	deliberately not keyboard-operable — the interactive children handle that.
-->
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<nav
	class="sticky top-0 z-40 flex min-h-14 w-full items-center gap-2 border-b border-base-300/60 bg-base-100 px-3 pt-[env(safe-area-inset-top,0px)] backdrop-blur-md lg:px-4"
	data-tauri-drag-region={useCustomTitlebar || undefined}
	onmousedown={handleBarMouseDown}
	ondblclick={handleBarDoubleClick}
>
	<!-- Left: hamburger (mobile only) + brand + page title -->
	<div class="flex min-w-0 items-center gap-2.5">
		<!-- Sidebar toggle (mobile only) -->
		<label
			for="app-drawer"
			aria-label="open sidebar"
			class="btn btn-square btn-ghost mr-0.5 min-h-11 min-w-11 hover:bg-base-200 lg:hidden"
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

		<!-- Brand mark: the app's clock tile (matches the sidebar brand) -->
		<div
			class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"
			title="Time Tracker"
		>
			<span class="inline-flex" aria-hidden="true"><Clock size={20} /></span>
		</div>

		<!-- Current page name (in Tauri this replaces the static window title) -->
		<div class="min-w-0">
			<h1 class="truncate text-base font-semibold tracking-tight text-base-content">
				{currentTitle}
			</h1>
		</div>
	</div>

	<!-- Center: flexible drag region (Tauri) -->
	<div class="min-w-0 flex-1"></div>

	<!-- Right: live status cluster -->
	<div class="flex shrink-0 items-center gap-2">
		<!-- Network status -->
		<span
			class="flex items-center gap-1.5 rounded-full border border-base-300/60 bg-base-200/60 px-2.5 py-1"
			title="Network status"
		>
			<span class="h-2 w-2 shrink-0 rounded-full {netDotClass}"></span>
			<span class="hidden text-xs font-medium text-base-content/70 md:inline">{netLabel}</span>
		</span>

		<!-- Global data freshness ring -->
		<DataFreshnessIndicator onRefresh={refreshAll} />

		<!-- Tauri window controls (Windows only — macOS/Linux use native chrome) -->
		{#if isTauri && useCustomTitlebar}
			<div class="window-controls ml-1 flex items-center gap-0.5 border-l border-base-300/60 pl-2">
				{#if !isTimeEntriesWindow}
					<button
						id="titlebar-minimize"
						class="flex h-8 w-8 items-center justify-center rounded-lg text-base-content/70 transition-colors hover:bg-base-200 hover:text-base-content"
						onclick={minimize}
						title="Minimize"
						aria-label="Minimize window"
					>
						<Minus size={16} />
					</button>
				{/if}
				{#if isTimeEntriesWindow}
					<button
						id="titlebar-pin"
						class="flex h-8 w-8 items-center justify-center rounded-lg transition-colors {isAlwaysOnTop
							? 'bg-primary text-primary-content'
							: 'text-base-content/70 hover:bg-base-200 hover:text-base-content'}"
						onclick={toggleAlwaysOnTop}
						title={isAlwaysOnTop ? 'Unpin window' : 'Pin window on top'}
						aria-label="Toggle always on top"
					>
						{#if isAlwaysOnTop}
							<Pin size={16} />
						{:else}
							<PinOff size={16} />
						{/if}
					</button>
				{/if}
				<button
					id="titlebar-maximize"
					class="flex h-8 w-8 items-center justify-center rounded-lg text-base-content/70 transition-colors hover:bg-base-200 hover:text-base-content"
					onclick={toggleMaximize}
					title={isMaximized ? 'Restore' : 'Maximize'}
					aria-label={isMaximized ? 'Restore window' : 'Maximize window'}
				>
					{#if isMaximized}
						<Minimize size={16} />
					{:else}
						<Maximize size={16} />
					{/if}
				</button>
				<button
					id="titlebar-close"
					class="flex h-8 w-8 items-center justify-center rounded-lg text-base-content/70 transition-colors hover:bg-error hover:text-error-content"
					onclick={close}
					title="Close"
					aria-label="Close window"
				>
					<X size={16} />
				</button>
			</div>
		{/if}
	</div>
</nav>

<style>
	/* Touch/pen drag on Windows (custom titlebar only). The `app-region` rule
	lives in app.css — it's a Tauri/WinUI-specific property that the CSS
	language service flags inside component style blocks. */
</style>
