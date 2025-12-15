<script lang="ts">
	import '../app.css';
	import { onMount } from 'svelte';
	import { dev } from '$app/environment';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { authToken, user, theme, customThemes } from '$lib/stores';
	import { setAuthContext, getAuthContext } from '$lib/auth-context';
	import TitleBar from '$lib/TitleBar.svelte';
	import Sidebar from '$lib/Sidebar.svelte';
	import Navbar from '$lib/Navbar.svelte';
	import '$lib/notifications'; // Initialize notification service
	import { preload } from '$lib/preload';
	import { themeChange } from 'theme-change';

	let { children } = $props();
	let isTauri = $state(false);
	let authInitialized = $state(false);
	let drawerCheckbox = $state<HTMLInputElement>();

	// Set up authentication context
	const authStore = setAuthContext();

	onMount(async () => {
		console.log('Layout onMount started at', new Date().toISOString());
		// Initialize theme-change immediately (no DOMContentLoaded wait)
		themeChange(false);
		try {
			const { getCurrentWindow } = await import('@tauri-apps/api/window');
			const currentWindow = getCurrentWindow();
			currentWindow; // Test if it works
			isTauri = true;
			console.log('Running in Tauri, showing title bar at', new Date().toISOString());

			// Listen for single instance event
			const { listen } = await import('@tauri-apps/api/event');
			listen('single-instance', async () => {
				console.log('Another instance launched, focusing current window');
				await currentWindow.unminimize();
				await currentWindow.show();
				await currentWindow.setFocus();
			});

			// Listen for theme change events from other windows
			listen('theme-changed', (event) => {
				console.log('Received theme change event:', event.payload);
				const payload = event.payload as { theme: string; isCustom: boolean; customVars?: Record<string, string> };
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

			try {
				const { LazyStore } = await import('@tauri-apps/plugin-store');
				const tauriStore = new LazyStore('auth.json');
				const token = await tauriStore.get<string | null>('authToken');
				console.log('Token loaded at', new Date().toISOString(), token ? 'with token' : 'no token');
				if (token) authToken.set(token);
				const userData = await tauriStore.get<{ id: number; username: string; first_name: string; last_name: string; profile_image: string | null } | null>('user');
				console.log('User loaded at', new Date().toISOString(), userData ? 'with user' : 'no user');
				if (userData) user.set(userData);
			} catch (e) {
				console.error('Failed to load from Tauri store', e);
			}
		} catch {
			isTauri = false;
			console.log('Running in browser, no title bar at', new Date().toISOString());
		}

		// Initialize authentication state
		authStore.initialize();
		authInitialized = true;

		// Preload commonly accessed data after initial authentication is set up
		if ($authToken) {
			// Preload timer page resources after a short delay to avoid blocking initial render
			setTimeout(() => {
				// Use SvelteKit's preload feature for faster subsequent navigation
				import('$app/navigation').then(({ preloadData }) => {
					// Preload the /timer route if available
					const timerLink = document.createElement('a');
					timerLink.href = '/timer';
					if (preloadData && typeof preloadData === 'function') {
						preloadData(timerLink).catch(() => {
							// Ignore errors during preloading
						});
					} else {
						// Fallback: pre-cache the API calls that will be made
						import('$lib/api').then(({ projects, timeEntries }) => {
							// Preload data that's typically needed
							projects.list().catch(err => console.warn('Failed to preload projects in layout:', err));
							timeEntries.getCurrentActive().catch(err => console.warn('Failed to preload active timer in layout:', err));
						});
					}
				});
			}, 1000); // 1 second delay to allow initial load to complete
		}
	});

	// Apply theme to document
	$effect(() => {
		if (typeof document !== 'undefined') {
			console.log('Applying theme:', $theme, 'is custom:', $theme in $customThemes);
			applyTheme($theme);

			// Emit theme change event to other windows
			if (isTauri) {
				import('@tauri-apps/api/event').then(({ emit }) => {
					emit('theme-changed', { theme: $theme, isCustom: $theme in $customThemes, customVars: $customThemes[$theme] });
				}).catch(err => console.error('Failed to emit theme change event:', err));
			}
		}
	});

	// Authentication guard - redirect to login if not authenticated
	$effect(() => {
		if (authInitialized && $authToken === null) {
			// Only redirect if we're not already on the login page
			if ($page.url.pathname !== '/') {
				goto('/');
			}
		}
	});

	function applyTheme(themeName: string) {
		// Clear any previous inline vars from custom themes
		document.documentElement.style.cssText = '';
		if ($theme in $customThemes) {
			document.documentElement.setAttribute('data-theme', '');
			const vars = $customThemes[$theme];
			console.log('Applying custom vars:', vars);
			for (const [key, value] of Object.entries(vars)) {
				document.documentElement.style.setProperty(key, value);
			}
			// Keep theme name in storage so theme-change remembers selection
			if (typeof localStorage !== 'undefined') {
				localStorage.setItem('theme', themeName);
			}
		} else {
			// Let theme-change handle applying and persisting the theme
			if (typeof localStorage !== 'undefined') {
				localStorage.setItem('theme', themeName);
			}
			themeChange(false);
		}
	}

	// Check if current page is login page
	const isLoginPage = $derived($page.url.pathname === '/');
	
	// Only show main layout for authenticated users
	const showMainLayout = $derived($authToken && !isLoginPage);
</script>

{#if isTauri}
	<TitleBar />
{/if}

{#if dev}
	<!-- Debug info -->
	<div class="fixed bottom-4 left-4 bg-black text-white p-2 rounded text-sm z-50">
		Tauri detected: {isTauri ? 'Yes' : 'No'}
	</div>
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
		<input 
			id="app-drawer" 
			type="checkbox" 
			class="drawer-toggle" 
			bind:this={drawerCheckbox}
		/>
		
		<!-- Drawer content (main content area with navbar) -->
		<div class="drawer-content flex flex-col">
			<Navbar />
			
			<!-- Main page content -->
			<main class="flex-1 p-4 lg:p-6 overflow-y-auto">
				{@render children()}
			</main>
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

<style>
	/* Custom styles for better spacing */
	.drawer-content {
		display: flex;
		flex-direction: column;
	}
	
	main {
		flex: 1;
	}
	
	/* Adjust for Tauri title bar */
	:global(.with-titlebar) .drawer-content {
		padding-top: 0;
	}
</style>
