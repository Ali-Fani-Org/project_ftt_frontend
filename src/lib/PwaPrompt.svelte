<script lang="ts">
	import { onMount } from 'svelte';
	import { pwaInfo } from 'virtual:pwa-info';
	import logger from '$lib/logger';
	import {
		pwaNativeInstall,
		pwaManualInstall,
		pwaNeedRefresh,
		isStandalone,
		isIosDevice,
		isAndroidDevice,
		installHintDismissed,
		dismissInstallHint
	} from '$lib/pwa/availability';

	/**
	 * PWA install + update UI.
	 *
	 * Install: Chrome Android fires `beforeinstallprompt` before Svelte
	 * hydrates — captured in app.html onto window.__pwa.deferredPrompt.
	 * iOS never fires it; Android sometimes doesn't either (Samsung, Firefox,
	 * engagement heuristics). In those cases we show a manual home-screen hint.
	 *
	 * Update: Workbox `waiting` plus an explicit `registration.waiting` check
	 * (the event is easy to miss if the worker was already waiting).
	 */

	interface BeforeInstallPromptEvent extends Event {
		prompt: () => Promise<void>;
		userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
	}

	type PromptHolder = { deferredPrompt?: BeforeInstallPromptEvent | null };

	let dismissedUpdate = $state(false);
	let showIosHowTo = $state(false);
	let showAndroidHowTo = $state(false);
	let needRefresh = $state(false);
	let nativeInstall = $state(false);
	let manualInstall = $state(false);
	let updateServiceWorker = $state<((reloadPage?: boolean) => Promise<void>) | null>(null);

	const canUpdate = $derived(needRefresh && !dismissedUpdate);
	const canInstall = $derived(!canUpdate && (nativeInstall || manualInstall));

	function isTauri(): boolean {
		return (
			typeof window !== 'undefined' &&
			Boolean((window as any).__TAURI__ || (window as any).__TAURI_INTERNALS__)
		);
	}

	function pwaHolder(): PromptHolder {
		if (typeof window === 'undefined') return {};
		const w = window as Window & { __pwa?: PromptHolder };
		if (!w.__pwa) w.__pwa = {};
		return w.__pwa;
	}

	function syncNativeFromWindow() {
		nativeInstall = Boolean(pwaHolder().deferredPrompt) && !isStandalone();
		pwaNativeInstall.set(nativeInstall);
		if (nativeInstall) {
			manualInstall = false;
			pwaManualInstall.set(false);
		}
	}

	function offerManualInstall() {
		if (isStandalone() || nativeInstall || installHintDismissed()) {
			manualInstall = false;
			pwaManualInstall.set(false);
			return;
		}
		manualInstall = isIosDevice() || isAndroidDevice();
		pwaManualInstall.set(manualInstall);
	}

	onMount(() => {
		if (isTauri()) return;

		syncNativeFromWindow();
		if (!nativeInstall) offerManualInstall();

		const onUserInstall = () => void install();
		const onUserReload = () => void reloadForUpdate();

		const onAvailable = () => syncNativeFromWindow();
		const onInstalled = () => {
			pwaHolder().deferredPrompt = null;
			nativeInstall = false;
			manualInstall = false;
			pwaNativeInstall.set(false);
			pwaManualInstall.set(false);
		};
		window.addEventListener('pwa-install-available', onAvailable);
		window.addEventListener('pwa-installed', onInstalled);
		window.addEventListener('beforeinstallprompt', onAvailable);
		window.addEventListener('appinstalled', onInstalled);
		window.addEventListener('pwa-user-install', onUserInstall);
		window.addEventListener('pwa-user-reload', onUserReload);

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
							pwaNeedRefresh.set(true);
							logger.info('PWA update waiting — showing reload prompt');
						},
						onOfflineReady() {
							logger.debug('PWA ready to work offline');
							if (!nativeInstall) offerManualInstall();
						},
						onRegisteredSW(swUrl, registration) {
							logger.info('Service worker registered', swUrl);
							if (!registration) return;

							if (registration.waiting && navigator.serviceWorker.controller) {
								needRefresh = true;
								dismissedUpdate = false;
								pwaNeedRefresh.set(true);
							}

							registration.addEventListener('updatefound', () => {
								const installing = registration.installing;
								if (!installing) return;
								installing.addEventListener('statechange', () => {
									if (
										installing.state === 'installed' &&
										navigator.serviceWorker.controller
									) {
										needRefresh = true;
										dismissedUpdate = false;
										pwaNeedRefresh.set(true);
									}
								});
							});

							const check = () => {
								if (registration.installing || !navigator.onLine) return;
								void registration.update().catch((err) => {
									logger.debug('SW update check failed', err);
								});
								if (registration.waiting && navigator.serviceWorker.controller) {
									needRefresh = true;
									pwaNeedRefresh.set(true);
								}
							};

							onVisible = () => {
								if (document.visibilityState === 'visible') check();
							};
							onFocus = check;
							document.addEventListener('visibilitychange', onVisible);
							window.addEventListener('focus', onFocus);
							setTimeout(check, 3_000);
							poll = setInterval(check, 2 * 60 * 1000);

							if (!nativeInstall) offerManualInstall();
						},
						onRegisterError(error) {
							logger.warn('Service worker registration failed', error);
							if (!nativeInstall) offerManualInstall();
						}
					});
				})
				.catch((err) => logger.warn('PWA register module failed', err));
		} else if (!nativeInstall) {
			offerManualInstall();
		}

		return () => {
			cancelled = true;
			window.removeEventListener('pwa-install-available', onAvailable);
			window.removeEventListener('pwa-installed', onInstalled);
			window.removeEventListener('beforeinstallprompt', onAvailable);
			window.removeEventListener('appinstalled', onInstalled);
			window.removeEventListener('pwa-user-install', onUserInstall);
			window.removeEventListener('pwa-user-reload', onUserReload);
			if (onVisible) document.removeEventListener('visibilitychange', onVisible);
			if (onFocus) window.removeEventListener('focus', onFocus);
			if (poll) clearInterval(poll);
		};
	});

	async function install() {
		const prompt = pwaHolder().deferredPrompt;
		if (prompt) {
			try {
				await prompt.prompt();
				const { outcome } = await prompt.userChoice;
				pwaHolder().deferredPrompt = null;
				nativeInstall = false;
				pwaNativeInstall.set(false);
				if (outcome !== 'accepted') dismissInstallHint();
			} catch (err) {
				logger.warn('PWA install failed', err);
				dismissInstallHint();
				nativeInstall = false;
			}
			return;
		}
		if (isIosDevice()) showIosHowTo = true;
		else showAndroidHowTo = true;
	}

	function dismissInstall() {
		dismissInstallHint();
		nativeInstall = false;
		manualInstall = false;
		showIosHowTo = false;
		showAndroidHowTo = false;
	}

	async function reloadForUpdate() {
		pwaNeedRefresh.set(false);
		try {
			await updateServiceWorker?.(true);
		} catch (err) {
			logger.warn('PWA update failed', err);
			window.location.reload();
		}
	}
</script>

{#if canUpdate}
	<div class="pwa-banner" role="status" aria-label="Update available">
		<div class="alert bg-base-100 shadow-xl border border-base-300">
			<div class="flex-1 min-w-0">
				<h3 class="font-bold text-sm">New version available</h3>
				<p class="text-xs opacity-70">Reload to pick up the latest Time Tracker.</p>
			</div>
			<button class="btn btn-sm btn-primary" onclick={reloadForUpdate}>Reload</button>
			<button
				class="btn btn-sm btn-ghost"
				aria-label="Dismiss update prompt"
				onclick={() => {
					dismissedUpdate = true;
					pwaNeedRefresh.set(false);
				}}>✕</button
			>
		</div>
	</div>
{:else if canInstall}
	<div class="pwa-banner" role="dialog" aria-label="Install app">
		<div class="alert bg-base-100 shadow-xl border border-base-300">
			<div class="flex-1 min-w-0">
				<h3 class="font-bold text-sm">Install Time Tracker</h3>
				<p class="text-xs opacity-70">
					{#if nativeInstall}
						Add it to your home screen for faster access and offline use.
					{:else if isIosDevice()}
						On iPhone: tap Share, then Add to Home Screen.
					{:else}
						On Android: tap the browser menu, then Install app.
					{/if}
				</p>
			</div>
			<button class="btn btn-sm btn-primary" onclick={install}>
				{nativeInstall ? 'Install' : 'How'}
			</button>
			<button class="btn btn-sm btn-ghost" aria-label="Dismiss install prompt" onclick={dismissInstall}
				>✕</button
			>
		</div>
	</div>
{/if}

{#if showIosHowTo}
	<div class="modal modal-open">
		<div class="modal-box">
			<h3 class="font-bold text-lg">Add to Home Screen</h3>
			<ol class="mt-3 list-decimal space-y-2 pl-5 text-sm">
				<li>Tap the <strong>Share</strong> button in Safari (square with an arrow).</li>
				<li>Scroll and tap <strong>Add to Home Screen</strong>.</li>
				<li>Tap <strong>Add</strong>.</li>
			</ol>
			<div class="modal-action">
				<button class="btn btn-primary" onclick={() => (showIosHowTo = false)}>Got it</button>
			</div>
		</div>
		<button class="modal-backdrop" aria-label="Close" onclick={() => (showIosHowTo = false)}></button>
	</div>
{/if}

{#if showAndroidHowTo}
	<div class="modal modal-open">
		<div class="modal-box">
			<h3 class="font-bold text-lg">Install the app</h3>
			<ol class="mt-3 list-decimal space-y-2 pl-5 text-sm">
				<li>Tap the <strong>⋮</strong> menu in the top-right of Chrome.</li>
				<li>Tap <strong>Install app</strong> or <strong>Add to Home screen</strong>.</li>
				<li>Confirm <strong>Install</strong>.</li>
			</ol>
			<div class="modal-action">
				<button class="btn btn-primary" onclick={() => (showAndroidHowTo = false)}>Got it</button>
			</div>
		</div>
		<button class="modal-backdrop" aria-label="Close" onclick={() => (showAndroidHowTo = false)}
		></button>
	</div>
{/if}

<style>
	.pwa-banner {
		position: fixed;
		left: 0.75rem;
		right: 0.75rem;
		bottom: calc(var(--tab-bar-height, 3.5rem) + 0.5rem);
		z-index: 80;
	}
	@media (min-width: 1024px) {
		.pwa-banner {
			left: auto;
			right: 1.5rem;
			bottom: 1rem;
			width: 24rem;
			max-width: calc(100vw - 2rem);
		}
	}
</style>
