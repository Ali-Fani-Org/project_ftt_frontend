<script lang="ts">
	import '../app.css';
	import { onMount, onDestroy } from 'svelte';
	import { dev, version } from '$app/environment';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import {
		authToken,
		user,
		theme,
		customThemes,
		backgroundAnimationEnabled,
		statsPanelEnabled
	} from '$lib/stores';
	import { setAuthContext, getAuthContext } from '$lib/auth-context';
	import Sidebar from '$lib/Sidebar.svelte';
	import Navbar from '$lib/Navbar.svelte';
	import '$lib/notifications'; // Initialize notification service
	import { themeChange } from 'theme-change';
	import BackgroundAnimation from '$lib/BackgroundAnimation.svelte';
	import logger from '$lib/logger';
	import { network } from '$lib/network';
	import ToastContainer from '$lib/ToastContainer.svelte';
	import { PersistQueryClientProvider } from '@tanstack/svelte-query-persist-client';
	import { queryClient, queryPersistOptions } from '$lib/queryClient';
	import { idlePrefetchRoutes } from '$lib/queries/prefetch';
	import { auth } from '$lib/api';
	import { SvelteQueryDevtools } from '@tanstack/svelte-query-devtools';
	import SyncIndicator from '$lib/SyncIndicator.svelte';

	let { children } = $props();
	let isTauri = $state(false);
	let authInitialized = $state(false);
	let drawerCheckbox = $state<HTMLInputElement>();
	let statsCleanup: (() => void) | null = null;

	// Set up authentication context
	const authStore = setAuthContext();

	onMount(async () => {
		// Initialize theme-change immediately (no DOMContentLoaded wait)
		themeChange(false);
		try {
			const { getCurrentWindow } = await import('@tauri-apps/api/window');
			const currentWindow = getCurrentWindow();
			currentWindow; // Test if it works
			isTauri = true;

			// Listen for single instance event
			const { listen } = await import('@tauri-apps/api/event');
			listen('single-instance', async () => {
				await currentWindow.unminimize();
				await currentWindow.show();
				await currentWindow.setFocus();
			});

			// Listen for theme change events from other windows
			listen('theme-changed', (event) => {
				const payload = event.payload as {
					theme: string;
					isCustom: boolean;
					customVars?: Record<string, string>;
				};
				const { theme, isCustom, customVars } = payload;
				if (isCustom && customVars) {
					document.documentElement.setAttribute('data-theme', '');
					for (const [key, value] of Object.entries(customVars)) {
						document.documentElement.style.setProperty(key, value as string);
					}
				} else {
					document.documentElement.setAttribute('data-theme', theme);
				}
			});
		} catch {
			isTauri = false;
		}

		// Initialize authentication state
		authStore.initialize();

		// Wait for persistent stores to finish loading before marking auth as initialized
		const [tokenValue, userValue] = await Promise.all([authToken.initialized, user.initialized]);
		logger.log('[AuthInit] Stores loaded:', {
			token: tokenValue ? 'exists' : 'null',
			user: userValue ? 'exists' : 'null'
		});

		// Refresh the profile from the server so permission flags (e.g. is_staff)
		// are current. A stored user from an older session may lack is_staff,
		// which hides admin-only UI (tag management). Offline or transient
		// server errors keep the stored user unchanged.
		if ($authToken) {
			try {
				const freshUser = await auth.getUser();
				user.set(freshUser);
			} catch {
				// keep the stored user (offline or transient server error)
			}
		}

		authInitialized = true;
		logger.log('[AuthInit] authInitialized set to true');

		// Warm the pages the user is most likely to open, one query-set per idle
		// slot so warming never competes with real interaction work.
		if ($authToken) {
			idlePrefetchRoutes(['/timer', '/dashboard', '/entries']);
		}
	});

	onDestroy(() => {
		if (statsCleanup) statsCleanup();
	});

	// Apply theme to document
	$effect(() => {
		if (typeof document !== 'undefined') {
			applyTheme($theme);

			// Emit theme change event to other windows
			if (isTauri) {
				import('@tauri-apps/api/event')
					.then(({ emit }) => {
						emit('theme-changed', {
							theme: $theme,
							isCustom: $theme in $customThemes,
							customVars: $customThemes[$theme]
						});
					})
					.catch((err) => logger.error('Failed to emit theme change event:', err));
			}
		}
	});

	// Authentication guard - redirect to login if not authenticated
	$effect(() => {
		if (!authInitialized) return;

		if ($authToken === null) {
			// Only redirect if we're not already on the login page
			if ($page.url.pathname !== '/') {
				goto('/');
			}
			return;
		}

		// If authenticated and still on login page, go to dashboard
		if ($page.url.pathname === '/') {
			goto('/dashboard');
		}
	});

	function applyTheme(themeName: string | null) {
		// Clear any previous inline vars from custom themes
		document.documentElement.style.cssText = '';
		if ($theme in $customThemes) {
			document.documentElement.setAttribute('data-theme', '');
			const vars = $customThemes[$theme];
			for (const [key, value] of Object.entries(vars)) {
				document.documentElement.style.setProperty(key, String(value));
			}
			// Keep theme name in storage so theme-change remembers selection
			if (typeof localStorage !== 'undefined') {
				localStorage.setItem('theme', themeName as string);
			}
		} else {
			// Let theme-change handle applying and persisting the theme
			if (typeof localStorage !== 'undefined') {
				localStorage.setItem('theme', themeName as string);
			}
			themeChange(false);
		}
	}

	// Check if current page is login page
	const isLoginPage = $derived($page.url.pathname === '/');

	// Helper function to format last online time
	function formatLastOnline(date: Date | null): string {
		if (!date) return 'never';
		return date.toLocaleTimeString([], {
			hour: '2-digit',
			minute: '2-digit',
			second: '2-digit'
		});
	}

	// Only show main layout for authenticated users
	const showMainLayout = $derived($authToken && !isLoginPage);

	$effect(() => {
		if (typeof document === 'undefined') return;
		if ($statsPanelEnabled && !statsCleanup) {
			initStatsPanel().then((cleanup) => {
				statsCleanup = cleanup;
			});
		} else if (!$statsPanelEnabled && statsCleanup) {
			statsCleanup();
			statsCleanup = null;
		}
	});

	async function initStatsPanel() {
		try {
			const { default: Stats } = await import('stats.js');
			const panels = [0, 1, 2]; // fps, ms, mb
			const wrappers: HTMLElement[] = [];

			panels.forEach((panel, idx) => {
				const stats = new Stats();
				stats.showPanel(panel);
				const dom = stats.dom;
				dom.style.position = 'fixed';
				dom.style.left = `${8 + idx * 90}px`;
				dom.style.top = '8px';
				dom.style.zIndex = '2147483647';
				dom.style.pointerEvents = 'none';
				document.body.appendChild(dom);

				let rafId: number;
				const loop = () => {
					stats.begin();
					stats.end();
					rafId = requestAnimationFrame(loop);
				};
				rafId = requestAnimationFrame(loop);

				// store cleanup per panel
				(wrappers as any).push({ dom, rafId });
			});

			return () => {
				(wrappers as any).forEach((item: { dom: HTMLElement; rafId: number }, idx: number) => {
					cancelAnimationFrame(item.rafId);
					item.dom.remove();
				});
			};
		} catch (err) {
			logger.warn('Failed to init stats panel', err);
			return null;
		}
	}
</script>

<PersistQueryClientProvider client={queryClient} persistOptions={queryPersistOptions}>
	{#if $backgroundAnimationEnabled}
		<BackgroundAnimation />
	{/if}

	{#if dev}
		<!-- Debug info -->
		<div class="fixed bottom-4 left-4 bg-black text-white p-2 rounded text-sm z-50">
			Tauri detected: {isTauri ? 'Yes' : 'No'}
		</div>

		<!-- TanStack Query Devtools (dev only; toggle stored in localStorage) -->
		<SvelteQueryDevtools />
	{/if}

	{#if !authInitialized}
		<!-- Loading screen during auth initialization -->
		<div class="min-h-screen flex items-center justify-center bg-base-200">
			<div class="text-center">
				<span class="loading loading-spinner loading-lg text-primary"></span>
				<p class="mt-4 text-base-content/70">Loading...</p>
			</div>
		</div>
	{:else if showMainLayout}
		<!-- Main authenticated layout using DaisyUI Drawer -->
		<div class="drawer lg:drawer-open min-h-screen">
			<!-- Drawer toggle input -->
			<input id="app-drawer" type="checkbox" class="drawer-toggle" bind:this={drawerCheckbox} />

			<!-- Drawer content (main content area with navbar) -->
			<div class="drawer-content flex flex-col">
				<Navbar />

				<!-- Offline Banner - positioned below navbar -->
				{#if !$network.isOnline}
					<div class="alert alert-error px-4 py-3 shadow-lg sticky top-14 z-40">
						<div class="flex items-center justify-between w-full">
							<div class="flex items-center gap-3">
								<!-- Pulsing offline icon -->
								<span class="relative flex h-3 w-3">
									<span
										class="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"
									></span>
									<span class="relative inline-flex rounded-full h-3 w-3 bg-white"></span>
								</span>

								<div class="flex flex-col">
									<span class="font-bold">No Internet Connection</span>
									<span class="text-sm opacity-90">
										Showing cached data from {formatLastOnline($network.lastOnline)}
									</span>
								</div>
							</div>

							<!-- Reconnection status -->
							{#if $network.isChecking}
								<div class="flex items-center gap-2">
									<span class="loading loading-spinner loading-sm"></span>
									<span class="text-sm">Reconnecting...</span>
								</div>
							{/if}
						</div>
					</div>
				{/if}
				<!-- Main page content -->
				<main class="flex-1 p-4 lg:p-6">
					{@render children()}
				</main>

				<!-- Subtle global sync indicator while any query is fetching -->
				<SyncIndicator />
			</div>

			<!-- Drawer side (sidebar) -->
			<Sidebar />
		</div>
	{:else}
		<!-- Login page or other non-authenticated content -->
		<div class="min-h-screen">
			{@render children()}
		</div>
	{/if}

	<!-- Toast notifications - visible on all pages -->
	<ToastContainer />
</PersistQueryClientProvider>

<style>
	/* Custom styles for better spacing */
	.drawer-content {
		display: flex;
		flex-direction: column;
	}

	main {
		flex: 1;
	}
</style>
