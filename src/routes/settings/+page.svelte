<script lang="ts">
	import {
		baseUrl,
		theme,
		customThemes,
		minimizeToTray,
		closeToTray,
		autostart,
		backgroundAnimationEnabled,
		statsPanelEnabled,
		timerRefreshInterval,
		autoRefreshEnabled,
		refreshInterval,
		refreshOnReconnect,
		refreshOnlyWhenVisible
	} from '$lib/stores';

	import { enable, disable } from '@tauri-apps/plugin-autostart';
	import IdleMonitorDebug from '$lib/IdleMonitorDebug.svelte';
	import { isUserIdleMonitoringEnabled, isUserIdleMonitorDebugEnabled } from '$lib/stores';
	import { featureFlagsStore } from '$lib/stores';
	import { refreshController } from '$lib/refreshController';
	import { network } from '$lib/network';
	import DataFreshnessIndicator from '$lib/DataFreshnessIndicator.svelte';
	import { addToast } from '$lib/toast';
	import { check } from '@tauri-apps/plugin-updater';
	import { relaunch } from '@tauri-apps/plugin-process';

	import { onMount } from 'svelte';
	import { isTauri } from '@tauri-apps/api/core';
	import { getVersion } from '@tauri-apps/api/app';
	import { goto } from '$app/navigation';

	let localBaseUrl = $state($baseUrl);
	let localTheme = $state($theme);
	let customTheme = $state('');
	let enablePreview = $state(false);
	let localMinimizeToTray = $state($minimizeToTray);
	let localCloseToTray = $state($closeToTray);
	let localAutostart = $state($autostart);
	let localBackgroundAnimation = $state($backgroundAnimationEnabled);
	let localStatsPanel = $state($statsPanelEnabled);

	// Data refresh settings
	let localAutoRefreshEnabled = $state($autoRefreshEnabled);
	let localRefreshInterval = $state($refreshInterval);
	let localRefreshOnReconnect = $state($refreshOnReconnect);
	let localRefreshOnlyWhenVisible = $state($refreshOnlyWhenVisible);

	let appVersion = $state('');
	let showLogoutConfirm = $state(false);
	let showIdleDebug = $state(false);
	let isTauriApp = $state(false);
	let updateStatus = $state<'idle' | 'checking' | 'available' | 'up-to-date' | 'downloading' | 'installed' | 'error'>('idle');
	let updateError = $state('');
	let updateInfo = $state<{ version?: string; date?: string; notes?: string } | null>(null);
	let updateProgress = $state<{ downloaded: number; total?: number } | null>(null);
	let pendingUpdate = $state<any | null>(null);
	const updateEndpointUrl = 'https://github.com/Ali-Fani/project_ftt_frontend/releases/latest/download/latest.json';
	let updateProxyUrl = $state('');

	onMount(async () => {
		try {
			isTauriApp = await isTauri();
		} catch {
			isTauriApp = false;
		}
		// Try to get app version, but don't fail if offline
		try {
			appVersion = await getVersion();
		} catch (err) {
			console.log('Could not get app version:', err);
			appVersion = 'unknown';
		}
		// Load feature flags and check if debug is enabled (only if online)
		try {
			if ($network.isOnline) {
				await featureFlagsStore.loadFeatures();
				showIdleDebug = await isUserIdleMonitorDebugEnabled();
				console.log(' Debug feature flag check result:', showIdleDebug);
			} else {
				console.log('Offline: skipping feature flags load');
				showIdleDebug = false;
			}
		} catch (error) {
			console.error('Failed to load feature flags for debug check:', error);
			showIdleDebug = false;
		}
		if (typeof window !== 'undefined') {
			updateProxyUrl = localStorage.getItem('updateProxyUrl') ?? '';
		}
	});

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
			const update = await withTimeout(
				check({ timeout: 30000, proxy: proxyUrl || undefined }),
				35000,
				'Updater check'
			);
			console.debug('Updater check() resolved in', Math.round(performance.now() - checkStartedAt), 'ms');
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

			pendingUpdate = update;
			updateInfo = {
				version: update.version,
				date: update.date,
				notes: update.body
			};
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
			await relaunch();
		} catch (error) {
			console.error('Update install failed.', error);
			updateStatus = 'error';
			updateError = error instanceof Error ? error.message : 'Update install failed.';
		}
	}

	const builtInThemes = [
		'light',
		'dark',
		'cupcake',
		'bumblebee',
		'emerald',
		'corporate',
		'synthwave',
		'retro',
		'cyberpunk',
		'valentine',
		'halloween',
		'garden',
		'forest',
		'aqua',
		'lofi',
		'pastel',
		'fantasy',
		'wireframe',
		'black',
		'luxury',
		'dracula',
		'cmyk',
		'autumn',
		'business',
		'acid',
		'lemonade',
		'night',
		'coffee',
		'winter',
		'web3hub'
	];

	async function saveBaseUrl() {
		baseUrl.set(localBaseUrl);
	}

	async function saveTheme() {
		theme.set(localTheme);
	}

	async function addCustomTheme() {
		if (customTheme.trim()) {
			const themes = $customThemes;
			themes[customTheme.trim()] = {};
			customThemes.set(themes);
			customTheme = '';
		}
	}

	async function removeCustomTheme(themeName: string) {
		const themes = $customThemes;
		delete themes[themeName];
		customThemes.set(themes);
	}

	async function saveTraySettings() {
		minimizeToTray.set(localMinimizeToTray);
		closeToTray.set(localCloseToTray);
		backgroundAnimationEnabled.set(localBackgroundAnimation);
	}

	async function saveAutostart() {
		autostart.set(localAutostart);
		if (localAutostart) {
			await enable();
		} else {
			await disable();
		}
	}

	function saveBackgroundAnimation() {
		backgroundAnimationEnabled.set(localBackgroundAnimation);
	}

	function saveStatsPanel() {
		statsPanelEnabled.set(localStatsPanel);
	}

	function saveDataRefreshSettings() {
		autoRefreshEnabled.set(localAutoRefreshEnabled);
		refreshInterval.set(localRefreshInterval);
		refreshOnReconnect.set(localRefreshOnReconnect);
		refreshOnlyWhenVisible.set(localRefreshOnlyWhenVisible);

		refreshController.updateConfig({
			enabled: localAutoRefreshEnabled,
			interval: localRefreshInterval,
			onlyWhenVisible: localRefreshOnlyWhenVisible,
			refreshOnReconnect: localRefreshOnReconnect
		});
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

<div class="container mx-auto p-4 lg:p-8">
	<!-- Page Header -->
	<div class="mb-8">
		<div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
			<div>
				<h1 class="text-3xl font-bold text-primary">Settings</h1>
				<p class="text-base-content/70">Version {appVersion}</p>
			</div>
			<DataFreshnessIndicator />
		</div>
	</div>

	<!-- Offline Warning -->
	{#if !$network.isOnline}
		<div class="alert alert-warning mb-6 shadow-lg max-w-4xl mx-auto">
			<div class="flex items-center gap-3">
				<svg class="w-6 h-6 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
				</svg>
				<div>
					<p class="font-medium">You are offline</p>
					<p class="text-sm opacity-80">Some settings may not be available until you reconnect.</p>
				</div>
			</div>
		</div>
	{/if}

	<div class="max-w-4xl mx-auto space-y-8">
		<!-- API Configuration -->
		<div class="card bg-base-100 shadow-xl">
			<div class="card-body p-6">
				<h2 class="card-title text-xl mb-6">API Configuration</h2>
				<div class="form-control">
					<label class="label" for="baseUrl">
						<span class="label-text font-medium text-base">Base URL</span>
					</label>
					<div class="join">
						<input
							id="baseUrl"
							type="url"
							bind:value={localBaseUrl}
							placeholder="Enter API base URL"
							class="input input-bordered join-item flex-1"
						/>
						<button class="btn btn-primary join-item" onclick={saveBaseUrl}> Save </button>
					</div>
				</div>
			</div>
		</div>

		<!-- Appearance -->
		<div class="card bg-base-100 shadow-xl">
			<div class="card-body p-6">
				<h2 class="card-title text-xl mb-6">Appearance</h2>

				<div class="form-control mb-6">
					<label class="label" for="theme">
						<span class="label-text font-medium text-base">Theme</span>
					</label>
					<select
						id="theme"
						bind:value={localTheme}
						onchange={saveTheme}
						class="select select-bordered"
					>
						{#each builtInThemes as themeOption}
							<option value={themeOption}>{themeOption}</option>
						{/each}
					</select>
				</div>

				<div class="divider my-6">Custom Themes</div>

				<div class="form-control">
					<label class="label" for="customTheme">
						<span class="label-text font-medium text-base">Add Custom Theme</span>
					</label>
					<div class="join">
						<input
							id="customTheme"
							type="text"
							bind:value={customTheme}
							placeholder="Enter theme name"
							class="input input-bordered join-item flex-1"
						/>
						<button class="btn btn-primary join-item" onclick={addCustomTheme}> Add </button>
					</div>
				</div>

				{#if Object.keys($customThemes).length > 0}
					<div class="mt-6">
						<h3 class="font-semibold text-lg mb-4">Saved Custom Themes</h3>
						<div class="flex flex-wrap gap-2">
							{#each Object.keys($customThemes) as customThemeName}
								<div class="badge badge-outline gap-1">
									{customThemeName}
									<button
										class="btn btn-xs btn-ghost ml-1"
										onclick={() => removeCustomTheme(customThemeName)}
									>
										✕
									</button>
								</div>
							{/each}
						</div>
					</div>
				{/if}
			</div>
		</div>

		<!-- Window Behavior -->
		<div class="card bg-base-100 shadow-xl">
			<div class="card-body p-6">
				<h2 class="card-title text-xl mb-6">Window Behavior</h2>

				<div class="space-y-4">
					<div class="form-control">
						<label class="cursor-pointer label">
							<span class="label-text font-medium text-base">Minimize to tray</span>
							<input
								type="checkbox"
								bind:checked={localMinimizeToTray}
								onchange={saveTraySettings}
								class="checkbox checkbox-primary"
							/>
						</label>
					</div>

					<div class="form-control">
						<label class="cursor-pointer label">
							<span class="label-text font-medium text-base">Close to tray</span>
							<input
								type="checkbox"
								bind:checked={localCloseToTray}
								onchange={saveTraySettings}
								class="checkbox checkbox-primary"
							/>
						</label>
					</div>
				</div>
			</div>
		</div>

		<!-- System -->
		<div class="card bg-base-100 shadow-xl">
			<div class="card-body p-6">
				<h2 class="card-title text-xl mb-6">System</h2>

				<div class="form-control">
					<label class="cursor-pointer label">
						<span class="label-text font-medium text-base">Start with system</span>
						<input
							type="checkbox"
							bind:checked={localAutostart}
							onchange={saveAutostart}
							class="checkbox checkbox-primary"
						/>
					</label>
				</div>

				<div class="form-control mt-4">
					<label class="cursor-pointer label">
						<span class="label-text font-medium text-base">Show animated background</span>
						<input
							type="checkbox"
							bind:checked={localBackgroundAnimation}
							onchange={saveBackgroundAnimation}
							class="checkbox checkbox-primary"
						/>
					</label>
				</div>

				<div class="form-control mt-2">
					<label class="cursor-pointer label">
						<span class="label-text font-medium text-base">Show performance stats panel</span>
						<input
							type="checkbox"
							bind:checked={localStatsPanel}
							onchange={saveStatsPanel}
							class="checkbox checkbox-primary"
						/>
					</label>
					<p class="text-xs text-base-content/70 ml-1">
						When enabled, a small FPS/MB panel appears in the top-left.
					</p>
				</div>
			</div>
		</div>

		<!-- Updates -->
		<div class="card bg-base-100 shadow-xl">
			<div class="card-body p-6">
				<h2 class="card-title text-xl mb-6">Updates</h2>
				<div class="space-y-3">
					<div class="form-control">
						<label class="label" for="updateProxyUrl">
							<span class="label-text font-medium text-base">Proxy URL (optional)</span>
						</label>
						<div class="join">
							<input
								id="updateProxyUrl"
								type="url"
								bind:value={updateProxyUrl}
								placeholder="https://proxy.yourdomain.com"
								class="input input-bordered join-item flex-1"
							/>
							<button class="btn btn-primary join-item" onclick={saveUpdateProxyUrl}>
								Save
							</button>
						</div>
						<p class="text-xs text-base-content/60">
							Use a proxy if GitHub is blocked in your region.
						</p>
					</div>
					<p class="text-sm text-base-content/70">{updateStatusLabel()}</p>
					{#if updateInfo?.notes}
						<div class="text-sm text-base-content/80 whitespace-pre-wrap">{updateInfo.notes}</div>
					{/if}
					{#if updateProgress?.total}
						<progress
							class="progress progress-primary w-full"
							value={updateProgress.downloaded}
							max={updateProgress.total}
						></progress>
						<p class="text-xs text-base-content/60">
							Downloaded {Math.round(updateProgress.downloaded / 1024 / 1024)} MB of
							{Math.round(updateProgress.total / 1024 / 1024)} MB
						</p>
					{/if}
					<div class="flex flex-wrap items-center gap-2">
						<button
							class="btn btn-primary"
							onclick={checkForUpdates}
							disabled={updateStatus === 'checking' || updateStatus === 'downloading'}
						>
							{updateStatus === 'checking' ? 'Checking…' : 'Check for updates'}
						</button>
						{#if updateStatus === 'available'}
							<button class="btn btn-accent" onclick={downloadAndInstallUpdate}>
								Download & Install
							</button>
						{/if}
					</div>
					{#if updateStatus === 'error'}
						<p class="text-sm text-error">{updateError}</p>
					{/if}
				</div>
			</div>
		</div>

		<!-- Data Refresh Settings -->
		<div class="card bg-base-100 shadow-xl">
			<div class="card-body p-6">
				<h2 class="card-title text-xl mb-6">Data Refresh Settings</h2>

				<div class="space-y-4">
					<div class="form-control">
						<label class="cursor-pointer label">
							<span class="label-text font-medium text-base">Auto-Refresh</span>
							<input
								type="checkbox"
								bind:checked={localAutoRefreshEnabled}
								onchange={saveDataRefreshSettings}
								class="toggle toggle-primary"
							/>
						</label>
						<div class="label">
							<span class="label-text-alt"> Automatically refresh data at regular intervals </span>
						</div>
					</div>

					{#if localAutoRefreshEnabled}
						<div class="form-control">
							<label class="label" for="refreshInterval">
								<span class="label-text font-medium text-base">Refresh Interval</span>
							</label>
							<select
								id="refreshInterval"
								bind:value={localRefreshInterval}
								onchange={saveDataRefreshSettings}
								class="select select-bordered"
							>
								<option value={30000}>30 seconds</option>
								<option value={120000}>2 minutes</option>
								<option value={300000}>5 minutes</option>
								<option value={600000}>10 minutes</option>
								<option value={1800000}>30 minutes</option>
								<option value={0}>Manual only</option>
							</select>
						</div>
					{/if}

					<div class="form-control">
						<label class="cursor-pointer label">
							<span class="label-text font-medium text-base">Refresh on Reconnect</span>
							<input
								type="checkbox"
								bind:checked={localRefreshOnReconnect}
								onchange={saveDataRefreshSettings}
								class="toggle toggle-primary"
							/>
						</label>
						<div class="label">
							<span class="label-text-alt">
								Automatically refresh when internet connection is restored
							</span>
						</div>
					</div>

					<div class="form-control">
						<label class="cursor-pointer label">
							<span class="label-text font-medium text-base">Pause When Inactive</span>
							<input
								type="checkbox"
								bind:checked={localRefreshOnlyWhenVisible}
								onchange={saveDataRefreshSettings}
								class="toggle toggle-primary"
							/>
						</label>
						<div class="label">
							<span class="label-text-alt">
								Pause auto-refresh when browser tab is not visible
							</span>
						</div>
					</div>
				</div>
			</div>
		</div>

		<!-- User Idle Monitoring Debug Section -->
		{#if showIdleDebug}
			<div class="card bg-base-100 shadow-xl">
				<div class="card-body p-6">
					<IdleMonitorDebug />
				</div>
			</div>
		{/if}

		<!-- Logout Section -->
		<div class="card bg-base-100 shadow-xl">
			<div class="card-body p-6">
				<h2 class="card-title text-xl mb-6">Account</h2>

				<button class="btn btn-error" onclick={confirmLogout}> Logout </button>
			</div>
		</div>
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
