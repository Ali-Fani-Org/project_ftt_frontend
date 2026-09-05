<script lang="ts">
	import { onMount } from 'svelte';
	import { pwaInfo } from 'virtual:pwa-info';
	import logger from '$lib/logger';

	/**
	 * PWA install + update prompt (web builds only).
	 *
	 * Updates go through Workbox (`workbox-window`, wrapped by
	 * `virtual:pwa-register`) — the SvelteKit-documented path. A raw
	 * `navigator.serviceWorker.register` never fires `waiting` / skipWaiting,
	 * so the reload banner never appears.
	 *
	 * `virtual:pwa-info` / `virtual:pwa-register` are real plugin modules in
	 * ENABLE_PWA builds, and stubbed for Tauri via vite aliases.
	 */

	interface BeforeInstallPromptEvent extends Event {
		prompt: () => Promise<void>;
		userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
	}

	let deferredPrompt = $state<BeforeInstallPromptEvent | null>(null);
	let dismissedInstall = $state(false);
	let dismissedUpdate = $state(false);
	let isStandalone = $state(false);
	let needRefresh = $state(false);
	let updateServiceWorker = $state<((reloadPage?: boolean) => Promise<void>) | null>(null);

	const canInstall = $derived(!!deferredPrompt && !dismissedInstall && !isStandalone);
	const canUpdate = $derived(needRefresh && !dismissedUpdate);

	function isTauri(): boolean {
		return (
			typeof window !== 'undefined' &&
			Boolean((window as any).__TAURI__ || (window as any).__TAURI_INTERNALS__)
		);
	}

	onMount(() => {
		if (isTauri()) return;

		isStandalone =
			window.matchMedia('(display-mode: standalone)').matches ||
			(window.navigator as any).standalone === true;

		const onBeforeInstall = (e: Event) => {
			e.preventDefault();
			deferredPrompt = e as BeforeInstallPromptEvent;
			logger.debug('PWA install prompt available');
		};
		const onInstalled = () => {
			deferredPrompt = null;
			dismissedInstall = false;
		};
		window.addEventListener('beforeinstallprompt', onBeforeInstall);
		window.addEventListener('appinstalled', onInstalled);

		let poll: ReturnType<typeof setInterval> | undefined;
		let cancelled = false;
		let onVisible: (() => void) | undefined;
		let onFocus: (() => void) | undefined;

		if (pwaInfo) {
			void import('virtual:pwa-register')
				.then(({ registerSW }) => {
					if (cancelled) return;
					updateServiceWorker = registerSW({
						immediate: true,
						onNeedRefresh() {
							needRefresh = true;
							dismissedUpdate = false;
							logger.info('PWA update waiting — showing reload prompt');
						},
						onOfflineReady() {
							logger.debug('PWA ready to work offline');
						},
						onRegisteredSW(swUrl, registration) {
							logger.info('Service worker registered', swUrl);
							if (!registration) return;

							const check = () => {
								if (registration.installing || !navigator.onLine) return;
								void registration.update().catch((err) => {
									logger.debug('SW update check failed', err);
								});
							};

							// Workbox only re-fetches sw.js on navigation or update().
							// A long-lived timer PWA barely navigates, so check on
							// focus / visibility and every few minutes.
							onVisible = () => {
								if (document.visibilityState === 'visible') check();
							};
							onFocus = check;
							document.addEventListener('visibilitychange', onVisible);
							window.addEventListener('focus', onFocus);
							setTimeout(check, 8_000);
							poll = setInterval(check, 5 * 60 * 1000);
						},
						onRegisterError(error) {
							logger.warn('Service worker registration failed', error);
						}
					});
				})
				.catch((err) => logger.warn('PWA register module failed', err));
		}

		return () => {
			cancelled = true;
			window.removeEventListener('beforeinstallprompt', onBeforeInstall);
			window.removeEventListener('appinstalled', onInstalled);
			if (onVisible) document.removeEventListener('visibilitychange', onVisible);
			if (onFocus) window.removeEventListener('focus', onFocus);
			if (poll) clearInterval(poll);
		};
	});

	async function install() {
		if (!deferredPrompt) return;
		try {
			await deferredPrompt.prompt();
			const { outcome } = await deferredPrompt.userChoice;
			if (outcome === 'accepted') deferredPrompt = null;
			else dismissedInstall = true;
		} catch (err) {
			logger.warn('PWA install failed', err);
			dismissedInstall = true;
		}
	}

	async function reloadForUpdate() {
		try {
			await updateServiceWorker?.(true);
		} catch (err) {
			logger.warn('PWA update failed', err);
			window.location.reload();
		}
	}
</script>

{#if canUpdate}
	<div
		class="fixed inset-x-4 bottom-[calc(var(--tab-bar-height)+0.75rem)] z-50 sm:left-auto sm:right-6 sm:max-w-sm lg:bottom-4"
		role="status"
		aria-label="Update available"
	>
		<div class="alert bg-base-100 shadow-xl border border-base-300">
			<div class="flex-1">
				<h3 class="font-bold text-sm">New version available</h3>
				<p class="text-xs opacity-70">Reload to pick up the latest Time Tracker.</p>
			</div>
			<button class="btn btn-sm btn-primary" onclick={reloadForUpdate}>Reload</button>
			<button
				class="btn btn-sm btn-ghost"
				aria-label="Dismiss update prompt"
				onclick={() => (dismissedUpdate = true)}>✕</button
			>
		</div>
	</div>
{:else if canInstall}
	<div
		class="fixed inset-x-4 bottom-[calc(var(--tab-bar-height)+0.75rem)] z-50 sm:left-auto sm:right-6 sm:max-w-sm lg:bottom-4"
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
				onclick={() => (dismissedInstall = true)}>✕</button
			>
		</div>
	</div>
{/if}
