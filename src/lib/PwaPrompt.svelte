<script lang="ts">
	import { onMount } from 'svelte';
	import { base } from '$app/paths';
	import logger from '$lib/logger';

	/**
	 * PWA install prompt (web builds only — never rendered in Tauri).
	 *
	 * Browsers only fire `beforeinstallprompt` when the app is installable
	 * (valid manifest + icons + registered service worker). Even then, desktop
	 * Chrome surfaces just a subtle omnibox icon, so this banner gives users a
	 * visible way to install. No-op when the PWA plugin is disabled (Tauri
	 * builds have no service worker, hence no event) or when already installed.
	 */

	interface BeforeInstallPromptEvent extends Event {
		prompt: () => Promise<void>;
		userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
	}

	let deferredPrompt = $state<BeforeInstallPromptEvent | null>(null);
	let dismissed = $state(false);
	let isStandalone = $state(false);

	const canInstall = $derived(!!deferredPrompt && !dismissed && !isStandalone);

	function isTauri(): boolean {
		return (
			typeof window !== 'undefined' &&
			Boolean((window as any).__TAURI__ || (window as any).__TAURI_INTERNALS__)
		);
	}

	onMount(() => {
		if (isTauri()) return;

		// Register the service worker (exists only in ENABLE_PWA builds —
		// __PWA_ENABLED__ is false in Tauri/dev builds, so this whole block
		// is tree-shaken out of the desktop bundle).
		if (__PWA_ENABLED__ && 'serviceWorker' in navigator) {
			const scope = `${base}/`;
			navigator.serviceWorker
				.register(`${base}/sw.js`, { scope })
				.then((reg) => logger.debug('Service worker registered', reg.scope))
				.catch((err) => logger.warn('Service worker registration failed', err));
		}

		// Already running as the installed app — nothing to offer.
		isStandalone =
			window.matchMedia('(display-mode: standalone)').matches ||
			(window.navigator as any).standalone === true;

		const onBeforeInstall = (e: Event) => {
			// Hold the event so the Install button can trigger it on demand.
			e.preventDefault();
			deferredPrompt = e as BeforeInstallPromptEvent;
			logger.debug('PWA install prompt available');
		};

		const onInstalled = () => {
			deferredPrompt = null;
			dismissed = false;
		};

		window.addEventListener('beforeinstallprompt', onBeforeInstall);
		window.addEventListener('appinstalled', onInstalled);
		return () => {
			window.removeEventListener('beforeinstallprompt', onBeforeInstall);
			window.removeEventListener('appinstalled', onInstalled);
		};
	});

	async function install() {
		if (!deferredPrompt) return;
		try {
			await deferredPrompt.prompt();
			const { outcome } = await deferredPrompt.userChoice;
			if (outcome === 'accepted') deferredPrompt = null;
			else dismissed = true;
		} catch (err) {
			logger.warn('PWA install failed', err);
			dismissed = true;
		}
	}
</script>

{#if canInstall}
	<div
		class="fixed bottom-4 inset-x-4 sm:left-auto sm:right-6 sm:max-w-sm z-50"
		role="dialog"
		aria-label="Install app"
	>
		<div class="alert bg-base-100 shadow-xl border border-base-300">
			<svg
				xmlns="http://www.w3.org/2000/svg"
				fill="none"
				viewBox="0 0 24 24"
				class="stroke-primary h-6 w-6 shrink-0"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"
				/>
			</svg>
			<div class="flex-1">
				<h3 class="font-bold text-sm">Install Time Tracker</h3>
				<p class="text-xs opacity-70">Faster access, works offline, app-like experience.</p>
			</div>
			<button class="btn btn-sm btn-primary" onclick={install}>Install</button>
			<button
				class="btn btn-sm btn-ghost"
				aria-label="Dismiss install prompt"
				onclick={() => (dismissed = true)}>✕</button
			>
		</div>
	</div>
{/if}
