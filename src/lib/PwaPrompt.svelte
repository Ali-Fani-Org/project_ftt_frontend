<script lang="ts">
	import { onMount } from 'svelte';
	import { version } from '$app/environment';
	import { updated } from '$app/stores';
	import { base } from '$app/paths';
	import { pwaInfo } from 'virtual:pwa-info';
	import logger from '$lib/logger';
	import {
		pwaNativeInstall,
		pwaManualInstall,
		pwaNeedRefresh,
		pwaIsInstalled,
		isStandalone,
		isIosDevice,
		isAndroidDevice,
		installHintDismissed,
		dismissInstallHint,
		checkInstalled
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

	let installed = $state(false);

	const canUpdate = $derived((needRefresh || $updated) && !dismissedUpdate);
	const canInstall = $derived(!installed && !canUpdate && (nativeInstall || manualInstall));

	$effect(() => {
		if ($updated) markNeedsRefresh();
	});

	function markNeedsRefresh() {
		needRefresh = true;
		dismissedUpdate = false;
		pwaNeedRefresh.set(true);
	}

	/** GitHub Pages CDNs cache `sw.js` for minutes. version.json is NetworkOnly
	 *  and fetched with cache: 'no-store' so we notice a new deploy anyway. */
	async function checkDeployedVersion() {
		if (typeof window === 'undefined' || !navigator.onLine) return false;
		try {
			const url = `${base}/_app/version.json?t=${Date.now()}`;
			const res = await fetch(url, { cache: 'no-store', headers: { pragma: 'no-cache' } });
			if (!res.ok) return false;
			const remote = (await res.json()) as { version?: string };
			if (remote.version && remote.version !== version) {
				logger.info('New deploy detected', { local: version, remote: remote.version });
				markNeedsRefresh();
				return true;
			}
		} catch (err) {
			logger.debug('version.json check failed', err);
		}
		try {
			await updated.check();
		} catch {
			/* ignore */
		}
		return false;
	}

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
		// iOS has no beforeinstallprompt. Android does — wait for it so we
		// don't send people to "Add to Home screen" (that only makes a shortcut).
		manualInstall = isIosDevice();
		pwaManualInstall.set(manualInstall);
	}

	function offerAndroidFallback() {
		if (isStandalone() || nativeInstall || installHintDismissed() || !isAndroidDevice()) {
			return;
		}
		manualInstall = true;
		pwaManualInstall.set(true);
	}

	onMount(() => {
		if (isTauri()) return;

		const refreshInstallState = async () => {
			installed = await checkInstalled();
			pwaIsInstalled.set(installed);
			if (installed) {
				nativeInstall = false;
				manualInstall = false;
				pwaNativeInstall.set(false);
				pwaManualInstall.set(false);
				return;
			}
			syncNativeFromWindow();
			if (isIosDevice() && !nativeInstall) offerManualInstall();
		};

		void refreshInstallState();
		void checkDeployedVersion();

		const onUserInstall = () => void install();
		const onUserReload = () => void reloadForUpdate();

		const onAvailable = () => syncNativeFromWindow();
		const onInstalled = () => {
			pwaHolder().deferredPrompt = null;
			installed = true;
			nativeInstall = false;
			manualInstall = false;
			pwaIsInstalled.set(true);
			pwaNativeInstall.set(false);
			pwaManualInstall.set(false);
		};
		window.addEventListener('pwa-install-available', onAvailable);
		window.addEventListener('pwa-installed', onInstalled);
		window.addEventListener('beforeinstallprompt', onAvailable);
		window.addEventListener('appinstalled', onInstalled);
		window.addEventListener('pwa-user-install', onUserInstall);
		window.addEventListener('pwa-user-reload', onUserReload);

		const onDisplayMode = () => {
			void refreshInstallState();
		};
		const standaloneMq =
			typeof window.matchMedia === 'function'
				? window.matchMedia('(display-mode: standalone), (display-mode: window-controls-overlay)')
				: null;
		standaloneMq?.addEventListener?.('change', onDisplayMode);

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
							markNeedsRefresh();
							logger.info('PWA update waiting — showing reload prompt');
						},
						onOfflineReady() {
							logger.debug('PWA ready to work offline');
							syncNativeFromWindow();
							if (isIosDevice() && !nativeInstall) offerManualInstall();
						},
						onRegisteredSW(swUrl, registration) {
							logger.info('Service worker registered', swUrl);
							if (!registration) return;

							if (registration.waiting && navigator.serviceWorker.controller) {
								markNeedsRefresh();
							}

							registration.addEventListener('updatefound', () => {
								const installing = registration.installing;
								if (!installing) return;
								installing.addEventListener('statechange', () => {
									if (
										installing.state === 'installed' &&
										navigator.serviceWorker.controller
									) {
										markNeedsRefresh();
									}
								});
							});

							const check = () => {
								void checkDeployedVersion();
								if (registration.installing || !navigator.onLine) return;
								void fetch(`${swUrl}?t=${Date.now()}`, { cache: 'no-store' })
									.then(() => registration.update())
									.catch((err) => logger.debug('SW update check failed', err));
								if (registration.waiting && navigator.serviceWorker.controller) {
									markNeedsRefresh();
								}
							};

							onVisible = () => {
								if (document.visibilityState === 'visible') {
									check();
									void refreshInstallState();
								}
							};
							onFocus = () => {
								check();
								void refreshInstallState();
							};
							document.addEventListener('visibilitychange', onVisible);
							window.addEventListener('focus', onFocus);
							void check();
							poll = setInterval(check, 20_000);

							// Chrome fires beforeinstallprompt after the SW is
							// installed. Give it several seconds before falling
							// back to menu instructions.
							setTimeout(async () => {
								if (await checkInstalled()) return;
								syncNativeFromWindow();
								if (!nativeInstall) offerAndroidFallback();
							}, 10_000);
						},
						onRegisterError(error) {
							logger.warn('Service worker registration failed', error);
							if (isIosDevice()) offerManualInstall();
							else setTimeout(() => offerAndroidFallback(), 10_000);
						}
					});
				})
				.catch((err) => logger.warn('PWA register module failed', err));
		} else if (isIosDevice() && !nativeInstall) {
			offerManualInstall();
		} else if (!nativeInstall) {
			setTimeout(() => {
				syncNativeFromWindow();
				if (!nativeInstall) offerAndroidFallback();
			}, 10_000);
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
			standaloneMq?.removeEventListener?.('change', onDisplayMode);
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
			logger.warn('PWA skipWaiting failed', err);
		}
		try {
			if ('serviceWorker' in navigator) {
				const regs = await navigator.serviceWorker.getRegistrations();
				await Promise.all(regs.map((r) => r.unregister()));
			}
			if (typeof caches !== 'undefined') {
				const keys = await caches.keys();
				await Promise.all(keys.map((k) => caches.delete(k)));
			}
		} catch (err) {
			logger.warn('PWA cache clear failed', err);
		}
		window.location.reload();
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
						Use Chrome’s Install app — not Add to Home screen (that only makes a shortcut).
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
			<p class="mt-2 text-sm opacity-80">
				Do not tap <strong>Add to Home screen</strong> — that only creates a bookmark shortcut.
				You want <strong>Install app</strong>, which installs Time Tracker as a real app.
			</p>
			<ol class="mt-3 list-decimal space-y-2 pl-5 text-sm">
				<li>Tap the <strong>⋮</strong> menu in the top-right of Chrome.</li>
				<li>Tap <strong>Install app</strong> (not Add to Home screen).</li>
				<li>Confirm <strong>Install</strong>.</li>
			</ol>
			<p class="mt-3 text-xs opacity-70">
				If you already added a shortcut, remove it from the home screen, then install from this
				banner or Chrome’s Install app item.
			</p>
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
