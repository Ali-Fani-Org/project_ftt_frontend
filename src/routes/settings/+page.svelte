<script lang="ts">
	import TagManager from '$lib/TagManager.svelte';
	import PageHeader from '$lib/PageHeader.svelte';
	import SectionCard from '$lib/settings/SectionCard.svelte';
	import SettingRow from '$lib/settings/SettingRow.svelte';
	import SettingToggle from '$lib/settings/SettingToggle.svelte';
	import ThemeSwatchPicker from '$lib/settings/ThemeSwatchPicker.svelte';
	import {
		Palette,
		SlidersHorizontal,
		Database,
		CloudDownload,
		Tags,
		Info,
		Monitor,
		FlaskConical,
		Server,
		Boxes,
		Minimize2,
		DoorClosed,
		Power,
		Waves,
		Gauge,
		RefreshCw,
		Timer,
		Wifi,
		Activity,
		ChevronDown,
		Check,
		UserRound
	} from '@lucide/svelte';
	import { gotoApp } from '$lib/navigation';
	import { Settings as SettingsIcon } from '@jis3r/icons';
	import {
		baseUrl,
		minimizeToTray,
		closeToTray,
		autostart,
		backgroundAnimationEnabled,
		backgroundAnimationStyle,
		oceanWaveCharacter,
		statsPanelEnabled,
		autoRefreshEnabled,
		refreshInterval,
		refreshOnReconnect,
		refreshOnlyWhenVisible,
		isAdmin,
		user,
		type BackgroundAnimationStyle
	} from '$lib/stores';
	import { useProjects } from '$lib/queries/timeEntries';
	import { useTagsQuery } from '$lib/queries/tags';

	import { network, pingBaseUrl, type BaseUrlPingResult } from '$lib/network';
	import { addToast } from '$lib/toast';
	import { dev } from '$app/environment';

	import { onMount, untrack } from 'svelte';

	// In the Tauri desktop shell a fixed 30px titlebar overlays the top of the
	// webview (decorations: false), so sticky UI must pin below it.
	// Detect the shell synchronously: v2 exposes __TAURI_INTERNALS__, v1 exposed
	// __TAURI__, and withGlobalTauri exposes window.isTauri. A plain browser has
	// none of these, so sticky UI pins at the true viewport top.
	let isTauri = $state(
		typeof window !== 'undefined' &&
			!!(
				(window as any).__TAURI_INTERNALS__ ||
				(window as any).__TAURI__ ||
				(window as any).isTauri
			)
	);

	let localBaseUrl = $state($baseUrl);
	let localMinimizeToTray = $state($minimizeToTray);
	let localCloseToTray = $state($closeToTray);
	let localAutostart = $state($autostart);
	let localBackgroundAnimation = $state($backgroundAnimationEnabled);
	let localBackgroundStyle = $state($backgroundAnimationStyle);
	let localOceanCharacter = $state($oceanWaveCharacter);
	let localStatsPanel = $state($statsPanelEnabled);

	// Data refresh settings
	let localAutoRefreshEnabled = $state($autoRefreshEnabled);
	let localRefreshInterval = $state($refreshInterval);
	let localRefreshOnReconnect = $state($refreshOnReconnect);
	let localRefreshOnlyWhenVisible = $state($refreshOnlyWhenVisible);

	// The persistent stores hydrate asynchronously (Tauri IPC / localStorage
	// read), so a one-shot `$state($store)` capture can miss the real value on
	// first paint — e.g. the refresh-interval dropdown showing its first option
	// instead of the saved value. Mirror the stores into the edit buffers
	// reactively so every control settles on the hydrated value.
	$effect(() => {
		localBaseUrl = $baseUrl;
		localMinimizeToTray = $minimizeToTray;
		localCloseToTray = $closeToTray;
		localAutostart = $autostart;
		localBackgroundAnimation = $backgroundAnimationEnabled;
		localBackgroundStyle = $backgroundAnimationStyle;
		localOceanCharacter = $oceanWaveCharacter;
		localStatsPanel = $statsPanelEnabled;
		localAutoRefreshEnabled = $autoRefreshEnabled;
		localRefreshInterval = $refreshInterval;
		localRefreshOnReconnect = $refreshOnReconnect;
		localRefreshOnlyWhenVisible = $refreshOnlyWhenVisible;
	});

	let appVersion = $state(typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '');
	let versionSource = $state<'pending' | 'web' | 'desktop'>('pending');
	let showLogoutConfirm = $state(false);
	let isTauriApp = $state(false);
	let updateStatus = $state<
		'idle' | 'checking' | 'available' | 'up-to-date' | 'downloading' | 'installed' | 'error'
	>('idle');
	let updateError = $state('');
	let updateInfo = $state<{ version?: string; date?: string; notes?: string } | null>(null);
	let updateProgress = $state<{ downloaded: number; total?: number } | null>(null);
	let pendingUpdate = $state<any | null>(null);
	const updateEndpointUrl =
		'https://github.com/Ali-Fani/project_ftt_frontend/releases/latest/download/latest.json';
	let updateProxyUrl = $state('');

	// Scrollspy — which section is currently in view
	let activeSection = $state('appearance');
	const sections = $derived([
		{ id: 'appearance', label: 'Appearance' },
		{ id: 'behavior', label: 'Behavior' },
		{ id: 'data', label: 'Data & Sync' },
		{ id: 'updates', label: 'Updates' },
		...($isAdmin ? [{ id: 'team', label: 'Team' }] : []),
		{ id: 'about', label: 'About' }
	]);
	const intervalOptions = [
		{ value: 30000, label: '30 seconds' },
		{ value: 120000, label: '2 minutes' },
		{ value: 300000, label: '5 minutes' },
		{ value: 600000, label: '10 minutes' },
		{ value: 1800000, label: '30 minutes' },
		{ value: 0, label: 'Manual only' }
	];
	const intervalLabel = $derived(
		intervalOptions.find((o) => o.value === localRefreshInterval)?.label ?? intervalOptions[0].label
	);
	let intervalOpen = $state(false);
	let intervalMenuEl = $state<HTMLDivElement>();

	// Close the custom dropdown on outside click
	$effect(() => {
		if (!intervalOpen) return;
		const onDocMouseDown = (e: MouseEvent) => {
			if (intervalMenuEl && !intervalMenuEl.contains(e.target as Node)) {
				intervalOpen = false;
			}
		};
		document.addEventListener('mousedown', onDocMouseDown);
		return () => document.removeEventListener('mousedown', onDocMouseDown);
	});

	function selectInterval(value: number) {
		localRefreshInterval = value;
		intervalOpen = false;
		saveDataRefreshSettings();
	}

	// Background style — the same custom dropdown pattern as refresh interval
	const backgroundOptions: { value: BackgroundAnimationStyle; label: string }[] = [
		{ value: 'drift', label: 'Aurora Drift' },
		{ value: 'wave', label: 'Wave' },
		{ value: 'bokeh', label: 'Bokeh Float' },
		{ value: 'ocean', label: 'Ocean' },
		{ value: 'nebula', label: 'Nebula' },
		{ value: 'lattice', label: 'Lattice' }
	];
	const backgroundLabel = $derived(
		backgroundOptions.find((o) => o.value === localBackgroundStyle)?.label ??
			backgroundOptions[0].label
	);
	let backgroundOpen = $state(false);
	let backgroundMenuEl = $state<HTMLDivElement>();

	// Close the background dropdown on outside click
	$effect(() => {
		if (!backgroundOpen) return;
		const onDocMouseDown = (e: MouseEvent) => {
			if (backgroundMenuEl && !backgroundMenuEl.contains(e.target as Node)) {
				backgroundOpen = false;
			}
		};
		document.addEventListener('mousedown', onDocMouseDown);
		return () => document.removeEventListener('mousedown', onDocMouseDown);
	});

	function selectBackground(value: BackgroundAnimationStyle) {
		localBackgroundStyle = value;
		backgroundOpen = false;
		saveBackgroundStyle();
	}

	// Workspace stats for the About section
	const projectsQuery = useProjects();
	const tagsQuery = useTagsQuery();
	const projectCount = $derived(projectsQuery.data?.length ?? 0);
	const tagCount = $derived(tagsQuery.data?.length ?? 0);

	// Platform + server status for the About section
	let osLabel = $state('');
	let serverPing = $state<BaseUrlPingResult | null>(null);
	let pinging = $state(false);
	const osBadge = $derived(isTauri || isTauriApp ? 'Desktop (Tauri)' : 'Web browser');

	function detectBrowserOs(): string {
		const ua = navigator.userAgent;
		if (/windows/i.test(ua)) return 'Windows';
		if (/mac os x|macintosh/i.test(ua)) return 'macOS';
		if (/android/i.test(ua)) return 'Android';
		if (/iphone|ipad|ipod/i.test(ua)) return 'iOS';
		if (/linux/i.test(ua)) return 'Linux';
		return 'Unknown OS';
	}

	async function detectPlatform() {
		if (isTauri || isTauriApp) {
			try {
				const os = await import('@tauri-apps/plugin-os');
				const typeName = os.type();
				const archName = os.arch();
				const label =
					typeName === 'windows'
						? 'Windows'
						: typeName === 'macos'
							? 'macOS'
							: typeName === 'linux'
								? 'Linux'
								: typeName === 'android'
									? 'Android'
									: typeName === 'ios'
										? 'iOS'
										: typeName;
				const arch = archName === 'x86_64' ? 'x64' : archName === 'aarch64' ? 'ARM64' : archName;
				osLabel = `${label} · ${arch}`;
			} catch {
				osLabel = 'Tauri desktop';
			}
		} else {
			osLabel = detectBrowserOs();
		}
	}

	async function refreshServerPing() {
		if (pinging) return;
		pinging = true;
		try {
			serverPing = await pingBaseUrl($baseUrl, { timeoutMs: 3000 });
		} finally {
			pinging = false;
		}
	}

	// Ping the server on load and whenever the base URL changes. The call is
	// wrapped in untrack() so the effect only depends on $baseUrl — otherwise
	// flipping the `pinging` state would re-trigger the effect and ping forever.
	$effect(() => {
		const url = $baseUrl;
		if (typeof document === 'undefined' || !url) return;
		untrack(() => refreshServerPing());
	});

	onMount(async () => {
		// Lazy load Tauri modules
		let isTauriFn: any;
		let getVersionFn: any;
		try {
			const tauriModule = await import('@tauri-apps/api/core');
			isTauriFn = tauriModule.isTauri;
			const appModule = await import('@tauri-apps/api/app');
			getVersionFn = appModule.getVersion;
		} catch (e) {
			console.log('Not running in Tauri environment');
		}

		try {
			if (isTauriFn) isTauriApp = await isTauriFn();
		} catch {
			isTauriApp = false;
		}
		// Belt-and-braces: if the Tauri window APIs resolve, we're in the shell.
		try {
			const { getCurrentWindow } = await import('@tauri-apps/api/window');
			getCurrentWindow();
			isTauri = true;
			isTauriApp = true;
		} catch {
			// Not running in Tauri — keep the synchronous detection result.
		}
		detectPlatform();
		// Desktop: Tauri's bundled version. Web: compile-time __APP_VERSION__
		// from package.json (vite.config.ts define). Never show "unknown".
		if (isTauriApp && getVersionFn) {
			try {
				appVersion = await getVersionFn();
				versionSource = 'desktop';
			} catch (err) {
				console.log('Could not get Tauri app version:', err);
				appVersion = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : appVersion;
				versionSource = 'desktop';
			}
		} else {
			appVersion = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : appVersion;
			versionSource = 'web';
		}
		if (typeof window !== 'undefined') {
			updateProxyUrl = localStorage.getItem('updateProxyUrl') ?? '';
		}
	});

	// Scrollspy — highlight the section currently in view. The app's layout
	// does not make <main> a scroll container (it grows with content), so the
	// window itself is the scroller.
	$effect(() => {
		if (typeof document === 'undefined') return;
		let ticking = false;
		const measure = () => {
			ticking = false;
			// Activate a section as its top approaches the sticky pill bar (a
			// little early, so pills light up smoothly and never get skipped).
			const pickup = 220;
			let current = sections[0]?.id ?? 'appearance';
			for (const s of sections) {
				const el = document.getElementById(s.id);
				if (el && el.getBoundingClientRect().top <= pickup) current = s.id;
			}
			activeSection = current;
		};
		const onScroll = () => {
			if (ticking) return;
			ticking = true;
			requestAnimationFrame(measure);
		};
		window.addEventListener('scroll', onScroll, { passive: true });
		measure();
		return () => window.removeEventListener('scroll', onScroll);
	});

	function scrollToSection(id: string) {
		document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
	}

	function saveBaseUrl() {
		baseUrl.set(localBaseUrl);
	}

	function saveTraySettings() {
		minimizeToTray.set(localMinimizeToTray);
		closeToTray.set(localCloseToTray);
		backgroundAnimationEnabled.set(localBackgroundAnimation);
	}

	async function saveAutostart() {
		autostart.set(localAutostart);
		try {
			const { enable, disable } = await import('@tauri-apps/plugin-autostart');
			if (localAutostart) {
				await enable();
			} else {
				await disable();
			}
		} catch (err) {
			console.warn('Autostart not available:', err);
		}
	}

	function saveBackgroundAnimation() {
		backgroundAnimationEnabled.set(localBackgroundAnimation);
	}

	function saveBackgroundStyle() {
		backgroundAnimationStyle.set(localBackgroundStyle);
	}

	function saveOceanCharacter() {
		oceanWaveCharacter.set(localOceanCharacter);
	}

	function saveStatsPanel() {
		statsPanelEnabled.set(localStatsPanel);
	}

	function saveDataRefreshSettings() {
		autoRefreshEnabled.set(localAutoRefreshEnabled);
		refreshInterval.set(localRefreshInterval);
		refreshOnReconnect.set(localRefreshOnReconnect);
		refreshOnlyWhenVisible.set(localRefreshOnlyWhenVisible);

		// TanStack Query picks these up reactively (see queryClient.ts) — no
		// separate refresh controller to configure anymore.
	}

	function saveUpdateProxyUrl() {
		const trimmed = updateProxyUrl.trim();
		if (typeof window === 'undefined') return;
		if (trimmed) {
			localStorage.setItem('updateProxyUrl', trimmed);
			addToast('Proxy URL saved for updates.', 'success', 2500);
		} else {
			localStorage.removeItem('updateProxyUrl');
			addToast('Proxy URL cleared.', 'info', 2000);
		}
	}

	function updateStatusLabel() {
		switch (updateStatus) {
			case 'checking':
				return 'Checking for updates…';
			case 'available':
				return `Update available${updateInfo?.version ? `: v${updateInfo.version}` : ''}`;
			case 'up-to-date':
				return 'You are up to date.';
			case 'downloading':
				return 'Downloading update…';
			case 'installed':
				return 'Update installed. Relaunching…';
			case 'error':
				return updateError || 'Update check failed.';
			default:
				return 'Check for updates.';
		}
	}

	function withTimeout<T>(promise: Promise<T>, ms: number, label: string) {
		return new Promise<T>((resolve, reject) => {
			const timeoutId = window.setTimeout(() => {
				reject(new Error(`${label} timed out after ${ms}ms`));
			}, ms);

			promise
				.then((result) => {
					window.clearTimeout(timeoutId);
					resolve(result);
				})
				.catch((error) => {
					window.clearTimeout(timeoutId);
					reject(error);
				});
		});
	}

	async function checkForUpdates() {
		console.info('Checking for updates from settings.');
		console.info('Updater endpoint URL:', updateEndpointUrl);
		const proxyUrl = updateProxyUrl.trim();
		if (proxyUrl) {
			console.info('Using updater proxy URL:', proxyUrl);
		}
		const checkStartedAt = performance.now();
		updateError = '';
		updateInfo = null;
		updateProgress = null;
		pendingUpdate = null;

		if (!isTauriApp) {
			console.warn('Update check blocked: not running in Tauri.');
			updateStatus = 'error';
			updateError = 'Updates are only available in the desktop app.';
			return;
		}

		if (!$network.isOnline) {
			console.warn('Update check blocked: offline.');
			updateStatus = 'error';
			updateError = 'You are offline. Connect to the internet to check for updates.';
			return;
		}

		updateStatus = 'checking';
		try {
			console.debug('Calling updater check()...');
			const { check } = await import('@tauri-apps/plugin-updater');
			const update = await withTimeout(
				check({ timeout: 30000, proxy: proxyUrl || undefined }),
				35000,
				'Updater check'
			);
			console.debug(
				'Updater check() resolved in',
				Math.round(performance.now() - checkStartedAt),
				'ms'
			);
			const available = update && 'available' in update ? update.available : !!update;
			console.info('Current app version:', appVersion || '(unknown)');
			console.info('Updater response payload:', update);
			if (update) {
				const updateSignature = (update as any).signature ?? (update as any).signatures;
				console.info('Update metadata:', {
					version: (update as any).version ?? (update as any).currentVersion,
					date: (update as any).date,
					signature: updateSignature
				});
			} else {
				console.info('No update metadata returned (updater responded with null/undefined).');
			}
			console.info('Update check result.', { available });
			if (!available) {
				updateStatus = 'up-to-date';
				return;
			}

			const updatePayload = update as {
				version?: string;
				date?: string;
				body?: string;
			} | null;
			pendingUpdate = updatePayload;
			updateInfo = updatePayload
				? {
						version: updatePayload.version,
						date: updatePayload.date,
						notes: updatePayload.body
					}
				: null;
			console.info('Update available.', updateInfo);
			updateStatus = 'available';
		} catch (error) {
			console.error('Update check failed.', error);
			updateStatus = 'error';
			updateError = error instanceof Error ? error.message : 'Update check failed.';
		}
	}

	async function downloadAndInstallUpdate() {
		if (!pendingUpdate) return;
		console.info('Starting update download/install.');
		if (updateProxyUrl.trim()) {
			console.info('Update download using configured proxy (if supported by updater).');
		}
		updateStatus = 'downloading';
		updateProgress = { downloaded: 0, total: undefined };

		try {
			await pendingUpdate.downloadAndInstall((event: any) => {
				switch (event.event) {
					case 'Started':
						updateProgress = { downloaded: 0, total: event.data.contentLength };
						console.info('Update download started.', { total: event.data.contentLength });
						break;
					case 'Progress':
						updateProgress = {
							downloaded: (updateProgress?.downloaded ?? 0) + event.data.chunkLength,
							total: updateProgress?.total
						};
						console.debug('Update download progress.', {
							downloaded: updateProgress?.downloaded,
							total: updateProgress?.total
						});
						break;
					case 'Finished':
						updateProgress = {
							downloaded: updateProgress?.total ?? updateProgress?.downloaded ?? 0,
							total: updateProgress?.total
						};
						console.info('Update download finished.');
						break;
					default:
						break;
				}
			});
			updateStatus = 'installed';
			console.info('Update installed, relaunching.');
			const { relaunch } = await import('@tauri-apps/plugin-process');
			await relaunch();
		} catch (error) {
			console.error('Update install failed.', error);
			updateStatus = 'error';
			updateError = error instanceof Error ? error.message : 'Update install failed.';
		}
	}

	function confirmLogout() {
		showLogoutConfirm = true;
	}

	function cancelLogout() {
		showLogoutConfirm = false;
	}

	function logout() {
		showLogoutConfirm = false;
		import('$lib/stores').then(({ logout }) => {
			logout();
		});
	}
</script>

<div class="mx-auto max-w-4xl" style="padding-bottom: max(24px, calc(100vh - 780px))">
	<!-- Page Header -->
	<div class="mb-6">
		<PageHeader
			icon={SettingsIcon}
			title="Settings"
			subtitle={`Version ${appVersion || '…'}${
				versionSource === 'desktop' ? ' (desktop)' : versionSource === 'web' ? ' (web)' : ''
			}`}
		/>
	</div>

	<!-- Offline Warning -->
	{#if !$network.isOnline}
		<div class="alert alert-warning mb-6 shadow-lg">
			<div class="flex items-center gap-3">
				<svg class="h-6 w-6 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
					/>
				</svg>
				<div>
					<p class="font-medium">You are offline</p>
					<p class="text-sm opacity-80">Some settings may not be available until you reconnect.</p>
				</div>
			</div>
		</div>
	{/if}

	<!-- Sticky section navigation: pins below the unified 56px app bar -->
	<nav
		class="sticky z-30 mb-6 flex gap-1.5 overflow-x-auto rounded-2xl border border-base-300/70 bg-base-100/80 p-1.5 shadow-sm backdrop-blur-md"
		style="top: var(--app-bar-height, 3.5rem)"
		aria-label="Settings sections"
	>
		{#each sections as s (s.id)}
			<button
				class="shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors {activeSection ===
				s.id
					? 'bg-primary text-primary-content shadow-sm'
					: 'text-base-content/60 hover:bg-base-content/10 hover:text-base-content'}"
				onclick={() => scrollToSection(s.id)}
			>
				{s.label}
			</button>
		{/each}
	</nav>

	<div class="space-y-6">
		<!-- Appearance -->
		<SectionCard
			id="appearance"
			icon={Palette}
			title="Appearance"
			description="Personalize how the app looks"
		>
			<ThemeSwatchPicker />
		</SectionCard>

		<!-- Behavior -->
		<SectionCard
			id="behavior"
			icon={SlidersHorizontal}
			title="Behavior"
			description="Window, startup, and system behavior"
		>
			<p class="mb-1 mt-1 text-xs font-semibold uppercase tracking-wide text-base-content/50">
				Window
			</p>
			<div class="divide-y divide-base-200">
				<SettingRow
					icon={Minimize2}
					title="Minimize to tray"
					description="Keep running in the system tray when minimized"
				>
					<SettingToggle
						checked={localMinimizeToTray}
						label="Minimize to tray"
						onChange={(v) => {
							localMinimizeToTray = v;
							saveTraySettings();
						}}
					/>
				</SettingRow>
				<SettingRow
					icon={DoorClosed}
					title="Close to tray"
					description="Keep running in the tray when the window is closed"
				>
					<SettingToggle
						checked={localCloseToTray}
						label="Close to tray"
						onChange={(v) => {
							localCloseToTray = v;
							saveTraySettings();
						}}
					/>
				</SettingRow>
			</div>

			<p class="mb-1 mt-5 text-xs font-semibold uppercase tracking-wide text-base-content/50">
				System
			</p>
			<div class="divide-y divide-base-200">
				<SettingRow
					icon={Power}
					title="Start with system"
					description="Launch automatically when you sign in"
				>
					<SettingToggle
						checked={localAutostart}
						label="Start with system"
						onChange={(v) => {
							localAutostart = v;
							saveAutostart();
						}}
					/>
				</SettingRow>
				<SettingRow
					icon={Waves}
					title="Animated background"
					description="A subtle animated background behind the app"
				>
					<SettingToggle
						checked={localBackgroundAnimation}
						label="Animated background"
						onChange={(v) => {
							localBackgroundAnimation = v;
							saveBackgroundAnimation();
						}}
					/>
				</SettingRow>
				{#if localBackgroundAnimation}
					<SettingRow
						icon={Waves}
						title="Background style"
						description="Aurora Drift · Wave · Bokeh Float · Ocean · Nebula · Lattice"
					>
						<div class="relative" bind:this={backgroundMenuEl}>
							<button
								type="button"
								class="btn btn-sm gap-1.5 border border-base-300 bg-base-100 font-normal hover:bg-base-200"
								aria-haspopup="listbox"
								aria-expanded={backgroundOpen}
								onclick={() => (backgroundOpen = !backgroundOpen)}
							>
								{backgroundLabel}
								<ChevronDown
									size={14}
									class={backgroundOpen
										? 'rotate-180 transition-transform'
										: 'transition-transform'}
								/>
							</button>
							{#if backgroundOpen}
								<ul
									role="listbox"
									class="absolute right-0 z-30 mt-1.5 w-44 overflow-hidden rounded-xl border border-base-300 bg-base-100 p-1 shadow-xl"
								>
									{#each backgroundOptions as opt (opt.value)}
										<li role="option" aria-selected={opt.value === localBackgroundStyle}>
											<button
												type="button"
												class="flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm {opt.value ===
												localBackgroundStyle
													? 'bg-primary/10 font-medium text-primary'
													: 'text-base-content/80 hover:bg-base-200'}"
												onclick={() => selectBackground(opt.value)}
											>
												{opt.label}
												{#if opt.value === localBackgroundStyle}
													<Check size={14} />
												{/if}
											</button>
										</li>
									{/each}
								</ul>
							{/if}
						</div>
						{#if localBackgroundStyle === 'ocean'}
							<div
								class="mt-2 flex max-w-[13rem] items-start gap-1.5 text-xs leading-snug text-warning"
							>
								<svg
									class="mt-px h-3.5 w-3.5 shrink-0"
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
									/>
								</svg>
								<span
									>Heavy — real-time FFT ocean sim (~50&nbsp;MB GPU). Try a lighter style on low-end
									machines.</span
								>
							</div>
						{/if}
					</SettingRow>
					{#if localBackgroundStyle === 'ocean'}
						<SettingRow
							icon={Waves}
							title="Wave character"
							description="Calm glassy swells ↔ stormy chop"
						>
							<div class="w-44">
								<input
									type="range"
									min="0"
									max="1"
									step="0.05"
									value={localOceanCharacter}
									oninput={(e) => {
										localOceanCharacter = Number(e.currentTarget.value);
										saveOceanCharacter();
									}}
									class="range range-primary range-xs"
									aria-label="Wave character"
								/>
								<div class="flex justify-between text-xs text-base-content/50 mt-1">
									<span>Calm</span>
									<span>Stormy</span>
								</div>
							</div>
						</SettingRow>
					{/if}
				{/if}
				<SettingRow
					icon={Gauge}
					title="Performance stats panel"
					description="FPS and memory overlay in the top-left"
				>
					<SettingToggle
						checked={localStatsPanel}
						label="Performance stats panel"
						onChange={(v) => {
							localStatsPanel = v;
							saveStatsPanel();
						}}
					/>
				</SettingRow>
			</div>
		</SectionCard>

		<!-- Data & Sync -->
		<SectionCard
			id="data"
			icon={Database}
			title="Data & Sync"
			description="Server connection and data freshness"
		>
			<div class="divide-y divide-base-200">
				<div class="py-3">
					<div class="flex items-start gap-3">
						<span
							class="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-base-content/10 text-base-content"
						>
							<Server size={16} />
						</span>
						<div class="min-w-0">
							<p class="text-sm font-medium">API Base URL</p>
							<p class="mt-0.5 text-xs text-base-content/60">
								The server the app talks to. Changing this signs you out.
							</p>
						</div>
					</div>
					<div class="join mt-3 w-full">
						<input
							id="baseUrl"
							type="url"
							bind:value={localBaseUrl}
							placeholder="https://hr.alpharency.com"
							class="input input-bordered input-sm join-item min-w-0 flex-1"
						/>
						<button class="btn btn-primary btn-sm join-item" onclick={saveBaseUrl}>Save</button>
					</div>
				</div>
				<SettingRow
					icon={RefreshCw}
					title="Auto-refresh"
					description="Automatically fetch fresh data at regular intervals"
				>
					<SettingToggle
						checked={localAutoRefreshEnabled}
						label="Auto-refresh"
						onChange={(v) => {
							localAutoRefreshEnabled = v;
							saveDataRefreshSettings();
						}}
					/>
				</SettingRow>
				{#if localAutoRefreshEnabled}
					<SettingRow
						icon={Timer}
						title="Refresh interval"
						description="How often the app pulls new data"
					>
						<div class="relative" bind:this={intervalMenuEl}>
							<button
								type="button"
								class="btn btn-sm gap-1.5 border border-base-300 bg-base-100 font-normal hover:bg-base-200"
								aria-haspopup="listbox"
								aria-expanded={intervalOpen}
								onclick={() => (intervalOpen = !intervalOpen)}
							>
								{intervalLabel}
								<ChevronDown
									size={14}
									class={intervalOpen ? 'rotate-180 transition-transform' : 'transition-transform'}
								/>
							</button>
							{#if intervalOpen}
								<ul
									role="listbox"
									class="absolute right-0 z-30 mt-1.5 w-44 overflow-hidden rounded-xl border border-base-300 bg-base-100 p-1 shadow-xl"
								>
									{#each intervalOptions as opt (opt.value)}
										<li role="option" aria-selected={opt.value === localRefreshInterval}>
											<button
												type="button"
												class="flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm {opt.value ===
												localRefreshInterval
													? 'bg-primary/10 font-medium text-primary'
													: 'text-base-content/80 hover:bg-base-200'}"
												onclick={() => selectInterval(opt.value)}
											>
												{opt.label}
												{#if opt.value === localRefreshInterval}
													<Check size={14} />
												{/if}
											</button>
										</li>
									{/each}
								</ul>
							{/if}
						</div>
					</SettingRow>
				{/if}
				<SettingRow
					icon={Wifi}
					title="Refresh on reconnect"
					description="Fetch data when the connection comes back"
				>
					<SettingToggle
						checked={localRefreshOnReconnect}
						label="Refresh on reconnect"
						onChange={(v) => {
							localRefreshOnReconnect = v;
							saveDataRefreshSettings();
						}}
					/>
				</SettingRow>
				<SettingRow
					icon={Activity}
					title="Pause when inactive"
					description="Skip refreshing while the tab isn't visible"
				>
					<SettingToggle
						checked={localRefreshOnlyWhenVisible}
						label="Pause when inactive"
						onChange={(v) => {
							localRefreshOnlyWhenVisible = v;
							saveDataRefreshSettings();
						}}
					/>
				</SettingRow>
			</div>
		</SectionCard>

		<!-- Updates -->
		<SectionCard
			id="updates"
			icon={CloudDownload}
			title="Updates"
			description="App version and update channel"
		>
			<div class="divide-y divide-base-200">
				<SettingRow
					icon={CloudDownload}
					title="Check for updates"
					description={updateStatusLabel()}
				>
					<button
						class="btn btn-primary btn-sm"
						onclick={checkForUpdates}
						disabled={updateStatus === 'checking' || updateStatus === 'downloading'}
					>
						{#if updateStatus === 'checking'}
							<span class="loading loading-spinner loading-xs"></span>
							Checking…
						{:else}
							Check
						{/if}
					</button>
				</SettingRow>
				{#if updateStatus === 'available'}
					<div class="py-3">
						<button class="btn btn-accent btn-sm" onclick={downloadAndInstallUpdate}>
							Download & Install
						</button>
						{#if updateInfo?.notes}
							<div class="mt-3 whitespace-pre-wrap text-sm text-base-content/80">
								{updateInfo.notes}
							</div>
						{/if}
					</div>
				{/if}
				{#if updateProgress?.total}
					<div class="py-3">
						<progress
							class="progress progress-primary w-full"
							value={updateProgress.downloaded}
							max={updateProgress.total}
						></progress>
						<p class="mt-1 text-xs text-base-content/60">
							Downloaded {Math.round(updateProgress.downloaded / 1024 / 1024)} MB of
							{Math.round(updateProgress.total / 1024 / 1024)} MB
						</p>
					</div>
				{/if}
				{#if updateStatus === 'error'}
					<p class="py-3 text-sm text-error">{updateError}</p>
				{/if}
				<div class="py-3">
					<div class="flex items-start gap-3">
						<span
							class="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-base-content/10 text-base-content"
						>
							<Server size={16} />
						</span>
						<div class="min-w-0 flex-1">
							<p class="text-sm font-medium">Update proxy URL</p>
							<p class="mt-0.5 text-xs text-base-content/60">
								Use a proxy if GitHub is blocked in your region.
							</p>
							<div class="join mt-2 w-full">
								<input
									id="updateProxyUrl"
									type="url"
									bind:value={updateProxyUrl}
									placeholder="https://proxy.yourdomain.com"
									class="input input-bordered input-sm join-item min-w-0 flex-1"
								/>
								<button class="btn btn-primary btn-sm join-item" onclick={saveUpdateProxyUrl}>
									Save
								</button>
							</div>
						</div>
					</div>
				</div>
			</div>
		</SectionCard>

		<!-- Tags Section (staff only — the catalog is team-shared) -->
		{#if $isAdmin}
			<SectionCard
				id="team"
				icon={Tags}
				title="Team"
				description="Shared tag catalog used across the team"
			>
				<TagManager />
			</SectionCard>
		{/if}

		<!-- About -->
		<SectionCard
			id="about"
			icon={Info}
			title="About"
			description="App information and your workspace"
		>
			<div class="divide-y divide-base-200">
				<SettingRow icon={UserRound} title="Profile" description="Name, avatar and passkeys">
					<button type="button" class="btn btn-sm btn-ghost" onclick={() => gotoApp('/profile')}
						>Open</button
					>
				</SettingRow>
				<SettingRow icon={Info} title="Version" description="App release you are running">
					<span class="text-sm font-medium text-base-content/70">
						{appVersion || 'dev build'}{versionSource === 'desktop'
							? ' (desktop)'
							: versionSource === 'web'
								? ' (web)'
								: ''}
					</span>
				</SettingRow>
				<SettingRow icon={Monitor} title="Platform" description="Operating system and app shell">
					<div class="flex items-center gap-2">
						<span class="text-sm font-medium text-base-content/70">{osLabel || '…'}</span>
						<span class="badge badge-outline badge-sm">{osBadge}</span>
					</div>
				</SettingRow>
				<SettingRow icon={FlaskConical} title="Environment" description="Build channel">
					<span class="badge badge-outline badge-sm">{dev ? 'Development' : 'Production'}</span>
				</SettingRow>
				<div class="py-3">
					<div class="flex items-start gap-3">
						<span
							class="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-base-content/10 text-base-content"
						>
							<Server size={16} />
						</span>
						<div class="min-w-0 flex-1">
							<p class="text-sm font-medium">Server</p>
							<p class="mt-0.5 truncate font-mono text-xs text-base-content/60">{$baseUrl}</p>
						</div>
						<div class="flex shrink-0 items-center gap-1.5">
							{#if pinging && !serverPing}
								<span class="loading loading-spinner loading-xs"></span>
							{:else if serverPing}
								<span class="badge badge-sm {serverPing.ok ? 'badge-success' : 'badge-error'}">
									{serverPing.ok ? `Online · ${serverPing.pingMs}ms` : 'Offline'}
								</span>
							{:else}
								<span class="badge badge-ghost badge-sm">—</span>
							{/if}
							<button
								class="btn btn-ghost btn-xs btn-square"
								title="Re-check server"
								aria-label="Re-check server"
								onclick={refreshServerPing}
							>
								<RefreshCw size={14} class={pinging ? 'animate-spin' : ''} />
							</button>
						</div>
					</div>
				</div>
				<SettingRow icon={Boxes} title="Workspace" description="Your tracked data at a glance">
					<div class="flex items-center gap-1.5">
						<span class="badge badge-outline badge-sm">{projectCount} projects</span>
						<span class="badge badge-outline badge-sm">{tagCount} tags</span>
					</div>
				</SettingRow>
			</div>

			<div class="divider my-5"></div>

			<div
				class="flex items-center justify-between gap-4 rounded-xl border border-error/25 bg-error/5 p-4"
			>
				<div class="min-w-0">
					<p class="truncate text-sm font-semibold">
						Signed in as @{$user?.username ?? 'user'}
					</p>
					<p class="mt-0.5 text-xs text-base-content/60">Ends your session on this device.</p>
				</div>
				<button class="btn btn-error btn-sm shrink-0" onclick={confirmLogout}>Sign out</button>
			</div>
		</SectionCard>
	</div>
</div>

<!-- Logout Confirmation Modal -->
{#if showLogoutConfirm}
	<div class="modal modal-open">
		<div class="modal-box">
			<h3 class="font-bold text-lg">Confirm Logout</h3>
			<p class="py-4">Are you sure you want to logout?</p>
			<div class="modal-action">
				<button class="btn btn-ghost" onclick={cancelLogout}>Cancel</button>
				<button class="btn btn-error" onclick={logout}>Logout</button>
			</div>
		</div>
	</div>
{/if}
