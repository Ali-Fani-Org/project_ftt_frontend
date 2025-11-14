<script lang="ts">
	import '../app.css';
	import { onMount } from 'svelte';
	import { dev } from '$app/environment';
	import { authToken, user, theme, showSettings, customThemes } from '$lib/stores';
	import SettingsModal from '$lib/SettingsModal.svelte';
	import TitleBar from '$lib/TitleBar.svelte';

	let { children } = $props();
	let isTauri = $state(false);

	onMount(async () => {
		console.log('Layout onMount started at', new Date().toISOString());
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

			try {
				const { LazyStore } = await import('@tauri-apps/plugin-store');
				const tauriStore = new LazyStore('auth.json');
				const token = await tauriStore.get<string | null>('authToken');
				console.log('Token loaded at', new Date().toISOString(), token ? 'with token' : 'no token');
				if (token) authToken.set(token);
				const userData = await tauriStore.get<{ id: number; username: string; first_name: string; last_name: string } | null>('user');
				console.log('User loaded at', new Date().toISOString(), userData ? 'with user' : 'no user');
				if (userData) user.set(userData);
			} catch (e) {
				console.error('Failed to load from Tauri store', e);
			}
		} catch {
			isTauri = false;
			console.log('Running in browser, no title bar at', new Date().toISOString());
		}
	});

	// Apply theme to document
	$effect(() => {
		if (typeof document !== 'undefined') {
			console.log('Applying theme:', $theme, 'is custom:', $theme in $customThemes);
			if ($theme in $customThemes) {
				document.documentElement.setAttribute('data-theme', '');
				const vars = $customThemes[$theme];
				console.log('Applying custom vars:', vars);
				for (const [key, value] of Object.entries(vars)) {
					document.documentElement.style.setProperty(key, value);
				}
			} else {
				document.documentElement.setAttribute('data-theme', $theme);
			}
		}
	});
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

<div class="app-content" class:with-titlebar={isTauri}>
	{@render children()}
</div>

{#if $showSettings}
	<SettingsModal on:close={() => showSettings.set(false)} />
{/if}

<style>
	.app-content {
		height: 100vh;
	}

	.app-content.with-titlebar {
		padding-top: 30px;
	}
</style>
