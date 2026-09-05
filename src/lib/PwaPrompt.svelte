<script lang="ts">
	import { onMount } from 'svelte';
	import { base } from '$app/paths';
	import logger from '$lib/logger';

	/**
	 * PWA install + update prompt (web builds only — never rendered in Tauri).
	 *
	 * Registration goes through `virtual:pwa-register/svelte` so skipWaiting /
	 * clientsClaim / needRefresh stay wired. A raw `navigator.serviceWorker.register`
	 * bypasses the updater. `__PWA_ENABLED__` is compile-time false in Tauri
	 * builds, so this module tree-shakes out of the desktop bundle.
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

		let unsubRefresh: (() => void) | undefined;
		let poll: ReturnType<typeof setInterval> | undefined;
		let cancelled = false;

		if (__PWA_ENABLED__) {
			void import('virtual:pwa-register/svelte')
				.then(({ useRegisterSW }) => {
					if (cancelled) return;
					const sw = useRegisterSW({
						immediate: true,
						onRegisteredSW(swUrl, registration) {
							logger.debug('Service worker registered', swUrl, `${base}/`);
							if (!registration) return;
							poll = setInterval(async () => {
								if (registration.installing || !navigator.onLine) return;
								try {
									const resp = await fetch(swUrl, {
										cache: 'no-store',
										headers: { 'cache-control': 'no-cache' }
									});
									if (resp?.status === 200) await registration.update();
								} catch {
									// offline or transient — try again next hour
								}
							}, 60 * 60 * 1000);
						},
						onRegisterError(error) {
							logger.warn('Service worker registration failed', error);
						}
					});
					updateServiceWorker = sw.updateServiceWorker;
					unsubRefresh = sw.needRefresh.subscribe((value) => {
						needRefresh = value;
						if (value) dismissedUpdate = false;
					});
				})
				.catch((err) => logger.warn('PWA register module failed', err));
		}

		return () => {
			cancelled = true;
			window.removeEventListener('beforeinstallprompt', onBeforeInstall);
			window.removeEventListener('appinstalled', onInstalled);
			unsubRefresh?.();
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
			dismissedUpdate = true;
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
