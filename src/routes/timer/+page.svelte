<script lang="ts">
	import { onMount } from 'svelte';
	import { get } from 'svelte/store';
	import { goto } from '$app/navigation';
	import {
		authToken,
		user,
		timeEntriesDisplayMode,
		featureFlagsStore,
		timerRefreshInterval,
		autoRefreshEnabled,
		refreshOnlyWhenVisible,
		refreshOnReconnect
	} from '$lib/stores';
	import { projects, timeEntries, type Project, type TimeEntry } from '$lib/api';
	import { preventDefault } from '$lib/commands.svelte';
	import TasksModal from '$lib/TasksModal.svelte';
	import type { PageData } from './$types';
	import { network } from '$lib/network';
	import DataFreshnessIndicator from '$lib/DataFreshnessIndicator.svelte';
	import { ACTIVE_TIMER_VALIDITY_THRESHOLD } from '$lib/stores';
	import { refreshController } from '$lib/refreshController';

	// Get any data loaded on server (may be empty)
	const { data } = $props<{ data: PageData }>();

	// Initialize state - we'll load data client-side if not pre-loaded
	let activeEntry = $state<TimeEntry | null>(data.activeEntry || null);
	let projectsList = $state<Project[]>(data.projects || []);
	let error = $state(data.error || '');
	let loadingProjects = $state(data.projects?.length === 0); // Only false if we already have projects
	let loadingActiveEntry = $state(false);
	let loadingFeatureFlags = $state(true); // Start as true since we'll load features client-side
	let todaySessions = $state<TimeEntry[]>([]);
	let loadingTodaySessions = $state(false);

	// Form data
	let title = $state('');
	let description = $state('');
	let selectedProject = $state<number | null>(null);
	let showAdvancedOptions = $state(false);
	let isStartingTimer = $state(false);

	// Timer
	let elapsed = $state(0);
	let timerInterval = $state<any>(null);

	// Tasks modal
	let showTasksModal = $state(false);

	// Feature flags state
	let showProcessMonitorButton = $state(false);

	// Last server update timestamp
	let lastServerUpdate = $state<Date | null>(null);

	// Auto-refresh interval
	let currentRefreshIntervalValue = $state<number>(30000);

	// LocalStorage key constants
	const LAST_ACTIVE_ENTRY_KEY = 'timer_last_active_entry';
	const LAST_TODAY_SESSIONS_KEY = 'timer_last_today_sessions';
	const LAST_UPDATE_KEY = 'timer_last_update';

	/**
	 * Save data to localStorage with timestamp
	 */
	function saveToLocalStorage<T>(key: string, data: T): void {
		try {
			const storageData = {
				data,
				timestamp: Date.now()
			};
			localStorage.setItem(key, JSON.stringify(storageData));
		} catch (err) {
			console.error('Error saving to localStorage:', err);
		}
	}

	/**
	 * Load data from localStorage
	 */
	function loadFromLocalStorage<T>(key: string): { data: T | null; timestamp: number | null } {
		try {
			const stored = localStorage.getItem(key);
			if (stored) {
				const parsed = JSON.parse(stored);
				return { data: parsed.data, timestamp: parsed.timestamp };
			}
		} catch (err) {
			console.error('Error loading from localStorage:', err);
		}
		return { data: null, timestamp: null };
	}

	/**
	 * Get cached data from localStorage
	 */
	function getLocalStorageData<T>(key: string, maxAge: number = 24 * 60 * 60 * 1000): T | null {
		const { data, timestamp } = loadFromLocalStorage<T>(key);
		if (!data || !timestamp) return null;

		// Check if data is not too old
		if (Date.now() - timestamp > maxAge) {
			console.log(`LocalStorage data for ${key} is too old, removing...`);
			try {
				localStorage.removeItem(key);
			} catch (err) {
				console.error('Error removing stale localStorage data:', err);
			}
			return null;
		}

		return data;
	}

	// Check if cached timer is still valid
	function isActiveTimerValid(timer: TimeEntry | null): boolean {
		if (!timer || !timer.is_active) return false;

		const startTime = new Date(timer.start_time).getTime();
		const age = Date.now() - startTime;

		return age <= ACTIVE_TIMER_VALIDITY_THRESHOLD;
	}

	onMount(async () => {
		console.log('Timer onMount started at', new Date().toISOString());
		const token = get(authToken);
		if (!token) {
			goto('/');
			return;
		}

		try {
			// Load data based on whether we already have it from server
			if (projectsList.length === 0) {
				// We need to load projects
				loadingProjects = true;
				try {
					projectsList = await projects.list();
					console.log('Projects loaded at', new Date().toISOString());
				} catch (err) {
					console.error('Error loading projects:', err);
					error = 'Failed to load projects';
				} finally {
					loadingProjects = false;
				}
			}

			// Load active entry if not already loaded
			if (activeEntry === null) {
				loadingActiveEntry = true;
				try {
					activeEntry = await timeEntries.getCurrentActive();
					if (activeEntry) {
						saveToLocalStorage(LAST_ACTIVE_ENTRY_KEY, activeEntry);
						startTimer();
					} else {
						// Server returned null (no active timer) - clear localStorage cache
						console.log('No active timer on server, clearing localStorage cache');
						try {
							localStorage.removeItem(LAST_ACTIVE_ENTRY_KEY);
						} catch (e) {
							console.error('Error clearing localStorage:', e);
						}
						activeEntry = null;
					}
					console.log(
						'Active entry loaded at',
						new Date().toISOString(),
						activeEntry ? 'with active entry' : 'no active entry'
					);
				} catch (err) {
					// For any error, try to load from localStorage as fallback
					console.error('Error loading active entry:', err);

					// Try to load from localStorage as fallback
					const cachedEntry = getLocalStorageData<TimeEntry>(
						LAST_ACTIVE_ENTRY_KEY,
						24 * 60 * 60 * 1000
					);
					if (cachedEntry) {
						console.log('Using cached active entry from localStorage after error');
						activeEntry = cachedEntry;

						// Check if cached timer is valid when offline
						if (!$network.isOnline && isActiveTimerValid(activeEntry)) {
							console.log('Cached active timer is valid, starting client-side timer');
							startTimer();
						} else if (!$network.isOnline) {
							console.log('Cached active timer is too old, hiding it');
							activeEntry = null;
						} else {
							// If online, we should have gotten the real state from the server
							// So if we're using cached data, it means the server reported no active timer
							activeEntry = null;
						}
					} else {
						activeEntry = null;
					}
				} finally {
					loadingActiveEntry = false;
				}
			} else if (activeEntry) {
				// If we already have an active entry from server, start the timer
				startTimer();
			}

			// Load feature flags
			loadingFeatureFlags = true;
			try {
				await featureFlagsStore.loadFeatures();
				showProcessMonitorButton = await featureFlagsStore.isFeatureEnabled('process-monitor-ui');
				console.log('Feature flags loaded:', { processMonitorUI: showProcessMonitorButton });
			} catch (err) {
				console.error('Error loading feature flags:', err);
				error = 'Failed to load feature flags';
			} finally {
				loadingFeatureFlags = false;
			}

			// Load today's sessions
			await loadTodaySessions();

			// Initial data load complete, update timestamp
			updateLastServerUpdate();
		} catch (err) {
			console.error('Error loading data at', new Date().toISOString(), err);

			// If we have cached data in localStorage, use it
			const cachedSessions = getLocalStorageData<TimeEntry[]>(
				LAST_TODAY_SESSIONS_KEY,
				24 * 60 * 60 * 1000
			);
			if (cachedSessions && todaySessions.length === 0) {
				console.log("Using cached today's sessions from localStorage after error");
				todaySessions = cachedSessions;

				// Load the last update timestamp from localStorage
				const { timestamp } = loadFromLocalStorage(LAST_UPDATE_KEY);
				if (timestamp) {
					lastServerUpdate = new Date(timestamp);
				}
			}

			error = 'Failed to load data';
			loadingProjects = false;
			loadingActiveEntry = false;
			loadingFeatureFlags = false;
			loadingTodaySessions = false;
		}

		// Register refresh callback with refresh controller
		refreshController.register('timer-page', async () => {
			await refreshAllData();
		});

		// Update refresh controller with current settings
		refreshController.updateConfig({
			enabled: get(autoRefreshEnabled),
			interval: get(timerRefreshInterval) || 30000,
			onlyWhenVisible: get(refreshOnlyWhenVisible),
			refreshOnReconnect: get(refreshOnReconnect)
		});

		// Cleanup function for onMount
		return () => {
			// Unregister from refresh controller
			refreshController.unregister('timer-page');
		};

		// Listen for events from Tauri
		if (typeof window !== 'undefined' && (window as any).__TAURI__) {
			const { listen, emit } = await import('@tauri-apps/api/event');
			listen('stop-timer', (event) => {
				console.log('Received stop-timer event from tray:', event);
				onStopTimer();
			});

			listen('request-timer-state', (event) => {
				console.log('Received request-timer-state event from tray:', event);
				// Respond with current timer state
				const timerState = activeEntry
					? {
							active: true,
							title: activeEntry.title,
							start_time: activeEntry.start_time
						}
					: {
							active: false,
							title: null
						};
				console.log('Sending timer state response:', timerState);
				emit('timer-state-response', timerState);
			});

			// Listen for backend-triggered devtools opening.
			listen('open-devtools', () => {
				try {
					// Try to use Tauri-side devtools API if exposed
					// otherwise fall back to dispatching an F12 key event.
					const ev = new KeyboardEvent('keydown', {
						key: 'F12',
						code: 'F12',
						keyCode: 123,
						which: 123,
						bubbles: true,
						cancelable: true
					});
					window.dispatchEvent(ev);
				} catch (err) {
					console.error('Failed to open devtools from event:', err);
				}
			});

			// Test event emission
			console.log('Testing event emission...');
			setTimeout(() => {
				emit('test-event', 'hello from frontend')
					.then(() => {
						console.log('Test event emitted successfully');
					})
					.catch((err) => {
						console.error('Failed to emit test event:', err);
					});
			}, 1000);
		}
	});

	function startTimer() {
		if (activeEntry) {
			const startTime = new Date(activeEntry.start_time).getTime();
			elapsed = Math.floor((Date.now() - startTime) / 1000);
			timerInterval = setInterval(() => {
				elapsed = Math.floor((Date.now() - startTime) / 1000);
			}, 1000);
		}
	}

	function formatTime(seconds: number): string {
		const hours = Math.floor(seconds / 3600);
		const minutes = Math.floor((seconds % 3600) / 60);
		const secs = seconds % 60;
		return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
	}

	function updateLastServerUpdate() {
		lastServerUpdate = new Date();
		saveToLocalStorage(LAST_UPDATE_KEY, lastServerUpdate.toISOString());

		// Update data freshness manager
		import('$lib/dataFreshness').then(({ dataFreshnessManager }) => {
			dataFreshnessManager.updateTimestamp('global');
		});
	}

	function formatLastUpdateTime(date: Date | null): string {
		if (!date) return 'Never';
		return date.toLocaleTimeString([], {
			hour: '2-digit',
			minute: '2-digit',
			second: '2-digit'
		});
	}

	async function refreshAllData() {
		console.log('Auto-refreshing data at', new Date().toISOString());

		// Refresh active entry (silently uses cache on failure)
		const activeResult = await timeEntries.getCurrentActive();

		if (activeResult) {
			if (!activeEntry || activeEntry.id !== activeResult.id) {
				// New active entry found that differs from current
				activeEntry = activeResult;
				startTimer();
			}
			// Save to localStorage
			saveToLocalStorage(LAST_ACTIVE_ENTRY_KEY, activeResult);
			// If activeEntry exists and matches, just keep the timer running
		} else if (activeEntry) {
			// No active entry on server but we have one locally - it was stopped externally
			activeEntry = null;
			// Clear localStorage cache since server has no active timer
			try {
				localStorage.removeItem(LAST_ACTIVE_ENTRY_KEY);
				console.log('Cleared localStorage active entry cache - no active timer on server');
			} catch (e) {
				console.error('Error clearing localStorage:', e);
			}
			if (timerInterval) {
				clearInterval(timerInterval);
				timerInterval = null;
			}
			elapsed = 0;
		}

		// Refresh today's sessions using fetchWithCache (silently uses cache on failure)
		const now = new Date();
		const year = now.toLocaleString('en', { year: 'numeric', timeZone: 'Asia/Tehran' });
		const month = now.toLocaleString('en', { month: '2-digit', timeZone: 'Asia/Tehran' });
		const day = now.toLocaleString('en', { day: '2-digit', timeZone: 'Asia/Tehran' });
		const dateStr = `${year}-${month}-${day}`;

		const response = await timeEntries.listWithFilters({
			start_date_after_tz: dateStr,
			start_date_before_tz: dateStr,
			ordering: '-start_time'
		});

		// Handle the response - it could be an array or the PaginatedTimeEntries object
		const entries = Array.isArray(response) ? response : response?.results || [];

		// Filter to only include completed sessions (not active) and limit to 5
		const completedSessions = entries.filter((entry: TimeEntry) => !entry.is_active).slice(0, 5);

		todaySessions = completedSessions;

		// Save to localStorage
		saveToLocalStorage(LAST_TODAY_SESSIONS_KEY, completedSessions);

		// Update the last server update timestamp
		updateLastServerUpdate();

		// Also update data freshness manager directly
		import('$lib/dataFreshness').then(({ dataFreshnessManager }) => {
			dataFreshnessManager.updateTimestamp('global');
		});
	}

	async function loadTodaySessions() {
		loadingTodaySessions = true;
		try {
			// Get today's date in Asia/Tehran timezone as YYYY-MM-DD format
			const now = new Date();
			// Format the date in Asia/Tehran timezone
			const year = now.toLocaleString('en', { year: 'numeric', timeZone: 'Asia/Tehran' });
			const month = now.toLocaleString('en', { month: '2-digit', timeZone: 'Asia/Tehran' });
			const day = now.toLocaleString('en', { day: '2-digit', timeZone: 'Asia/Tehran' });
			const dateStr = `${year}-${month}-${day}`;

			console.log("Loading today's sessions for date (Asia/Tehran):", dateStr);

			// Load time entries for today that are not active (finished sessions)
			// Using the listWithFilters function with timezone-aware parameters
			const response = await timeEntries.listWithFilters({
				start_date_after_tz: dateStr,
				start_date_before_tz: dateStr,
				ordering: '-start_time' // Most recent first
			});

			// Handle the response - it could be an array or the PaginatedTimeEntries object
			const entries = Array.isArray(response) ? response : response?.results || [];

			// Filter to only include completed sessions (not active) and limit to 5
			const completedSessions = entries.filter((entry) => !entry.is_active).slice(0, 5);

			todaySessions = completedSessions;

			// Save to localStorage
			saveToLocalStorage(LAST_TODAY_SESSIONS_KEY, completedSessions);

			// Update the last server update timestamp
			updateLastServerUpdate();
		} catch (err) {
			console.error("Error loading today's sessions:", err);

			// Try to load from localStorage as fallback
			const cachedSessions = getLocalStorageData<TimeEntry[]>(
				LAST_TODAY_SESSIONS_KEY,
				24 * 60 * 60 * 1000
			);
			if (cachedSessions) {
				console.log("Using cached today's sessions from localStorage");
				todaySessions = cachedSessions;

				// Load the last update timestamp from localStorage
				const { timestamp } = loadFromLocalStorage(LAST_UPDATE_KEY);
				if (timestamp) {
					lastServerUpdate = new Date(timestamp);
				}
			} else {
				error = "Failed to load today's sessions";
			}
		} finally {
			loadingTodaySessions = false;
		}
	}

	const onStartTimer = preventDefault(async () => {
		if (!selectedProject || !title) return;

		// Check if online before starting timer
		if (!$network.isOnline) {
			error = 'Cannot start timer while offline. Please check your internet connection.';
			return;
		}

		try {
			isStartingTimer = true;
			activeEntry = await timeEntries.start({
				title,
				description,
				project: selectedProject
			});
			startTimer();

			// Emit event to Tauri
			if (typeof window !== 'undefined' && (window as any).__TAURI__) {
				const { emit } = await import('@tauri-apps/api/event');
				console.log('Emitting timer-started event:', activeEntry.title);
				await emit('timer-started', {
					title: activeEntry.title,
					start_time: activeEntry.start_time
				});
			}

			// Reset form but keep the state for the new layout
			title = '';
			description = '';
			selectedProject = null;
			showAdvancedOptions = false;
			isStartingTimer = false;
		} catch (err) {
			error = 'Failed to start timer';
			isStartingTimer = false;
		}
	});

	const onStopTimer = async () => {
		if (!activeEntry) return;

		// Check if online before stopping timer
		if (!$network.isOnline) {
			error = 'Cannot stop timer while offline. Please check your internet connection.';
			return;
		}

		try {
			await timeEntries.stop(activeEntry.id);
			activeEntry = null;
			if (timerInterval) {
				clearInterval(timerInterval);
				timerInterval = null;
			}
			elapsed = 0;

			// Emit event to Tauri
			if (typeof window !== 'undefined' && (window as any).__TAURI__) {
				const { emit } = await import('@tauri-apps/api/event');
				console.log('Emitting timer-stopped event');
				await emit('timer-stopped', {});
			}
		} catch (err) {
			error = 'Failed to stop timer';
		}
	};

	const openTimeEntries = async () => {
		console.log('openTimeEntries called, mode:', get(timeEntriesDisplayMode));
		const mode = get(timeEntriesDisplayMode);

		if (mode === 'modal') {
			console.log('Opening tasks in modal');
			showTasksModal = true;
			return;
		}

		// Default to window/tab mode
		try {
			const { getCurrentWindow } = await import('@tauri-apps/api/window');
			getCurrentWindow(); // Test if running in Tauri
			console.log('Detected Tauri environment, opening new window');
			const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');
			console.log('WebviewWindow imported successfully');
			const webview = new WebviewWindow('time-entries', {
				url: `${window.location.origin}/entries`,
				title: 'Time Entries',
				width: 1000,
				height: 700,
				resizable: true,
				decorations: false,
				fullscreen: false,
				contentProtected: true
			});
			console.log('WebviewWindow created:', webview);
		} catch {
			console.log('Web environment, opening new tab');
			window.open('/entries', '_blank');
		}
	};

	const openProcessMonitor = async () => {
		// Log feature access
		try {
			await featureFlagsStore.logFeatureAccess('process-monitor-ui');
			await featureFlagsStore.logFeatureAccess('process-monitor-backend');
		} catch (error) {
			console.error('Failed to log process monitor access:', error);
		}

		try {
			const { getCurrentWindow } = await import('@tauri-apps/api/window');
			getCurrentWindow(); // Test if running in Tauri
			console.log('Detected Tauri environment, opening process monitor window');
			const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');
			const webview = new WebviewWindow('process-monitor', {
				url: `${window.location.origin}/processes`,
				title: 'System Process Monitor',
				width: 1000,
				height: 700,
				resizable: true,
				decorations: false,
				fullscreen: false,
				contentProtected: true
			});
			console.log('Process monitor WebviewWindow created:', webview);
		} catch {
			console.log('Web environment, opening new tab');
			window.open('/processes', '_blank');
		}
	};

	// DevTools control removed from dashboard. Use Settings to inspect the
	// feature flag and the backend will only open devtools when allowed.

	// Reactive effect to handle timer refresh interval changes
	$effect(() => {
		const newInterval = $timerRefreshInterval || 30000;
		if (newInterval !== currentRefreshIntervalValue) {
			console.log(
				`Timer refresh interval changed from ${currentRefreshIntervalValue}ms to ${newInterval}ms`
			);
			currentRefreshIntervalValue = newInterval;

			// Update refresh controller with new interval
			refreshController.updateConfig({
				enabled: $autoRefreshEnabled,
				interval: newInterval,
				onlyWhenVisible: $refreshOnlyWhenVisible,
				refreshOnReconnect: $refreshOnReconnect
			});
		}
	});
</script>

<div class="container mx-auto p-4 lg:p-8 max-w-7xl">
	<!-- Page Header -->
	<div class="mb-8">
		<div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
			<div>
				<h1 class="text-3xl font-bold text-primary">Timer</h1>
				<p class="text-base-content/70">Track your time with precision</p>
			</div>
			<DataFreshnessIndicator onRefresh={refreshAllData} />
		</div>
	</div>

	{#if loadingProjects}
		<div class="flex justify-center items-center min-h-[50vh]">
			<span class="loading loading-spinner loading-lg"></span>
		</div>
	{:else if error}
		<div class="alert alert-error mb-6">
			<span>{error}</span>
		</div>
	{:else}
		{#if loadingActiveEntry}
			<div class="card bg-base-200 shadow-xl mb-8">
				<div class="card-body">
					<h2 class="card-title">Checking for active timer...</h2>
					<div class="flex justify-center">
						<span class="loading loading-spinner loading-lg"></span>
					</div>
				</div>
			</div>
		{:else}
			<!-- Timer Section (Full Width) -->
			<div class="mb-6">
				{#if activeEntry || isStartingTimer}
					<div class="card bg-base-100 shadow-xl">
						<div class="card-body items-center text-center space-y-6">
							<!-- Status at top -->
							<p class="text-base-content/70 text-sm font-normal leading-normal">
								{activeEntry ? 'In Progress' : 'Starting...'}
							</p>

							{#if activeEntry}
								<!-- Task Title -->
								<h2 class="text-xl font-bold text-base-content">{activeEntry.title}</h2>

								<!-- Big Timer Display in the center -->
								<div class="py-4">
									<h1
										class="text-5xl lg:text-6xl font-bold tracking-tighter leading-tight text-base-content"
									>
										{formatTime(elapsed)}
									</h1>
								</div>

								<!-- Big Stop Button at the bottom -->
								<div class="flex flex-col items-center mt-4 gap-2">
									<button
										class="btn btn-lg rounded-full bg-red-500 hover:bg-red-600 text-white border-none text-lg font-bold"
										onclick={onStopTimer}
										disabled={!$network.isOnline}
									>
										<svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
											<path
												stroke-linecap="round"
												stroke-linejoin="round"
												stroke-width="2"
												d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
											></path>
											<path
												stroke-linecap="round"
												stroke-linejoin="round"
												stroke-width="2"
												d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z"
											></path>
										</svg>
										Stop
									</button>
									{#if !$network.isOnline}
										<div class="text-sm text-warning font-medium">
											Cannot stop timer while offline
										</div>
									{/if}
								</div>
							{:else if isStartingTimer}
								<!-- Starting Timer State -->
								<div class="py-4">
									<span class="loading loading-spinner loading-lg text-primary"></span>
								</div>
								<p class="text-base-content/70">Starting timer...</p>
							{/if}
						</div>
					</div>
				{:else}
					<!-- Compact Start Form when idle (Full Width) -->
					<div class="card bg-base-100 shadow-xl">
						<div class="card-body">
							<div class="text-center mb-6">
								<h2 class="text-2xl font-bold text-base-content mb-2">Ready to start tracking?</h2>
								<p class="text-base-content/70">Start a new timer session</p>
							</div>

							<form onsubmit={onStartTimer} class="space-y-6">
								<div class="form-control">
									<label class="label" for="title">
										<span class="label-text">Task Title</span>
									</label>
									<input
										id="title"
										bind:value={title}
										type="text"
										placeholder="What are you working on?"
										class="input input-bordered"
										required
									/>
								</div>

								<!-- Project Selector -->
								<div class="form-control">
									<label class="label" for="project">
										<span class="label-text">Project</span>
									</label>
									<select
										id="project"
										bind:value={selectedProject}
										class="select select-bordered"
										required
									>
										<option value={null}>Select a project</option>
										{#each projectsList as project}
											<option value={project.id}>{project.title}</option>
										{/each}
									</select>
								</div>

								<!-- Advanced Options Toggle -->
								<div class="form-control">
									<button
										type="button"
										class="btn btn-ghost btn-sm"
										onclick={() => (showAdvancedOptions = !showAdvancedOptions)}
									>
										<svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
											<path
												stroke-linecap="round"
												stroke-linejoin="round"
												stroke-width="2"
												d="M19 9l-7 7-7-7"
											></path>
										</svg>
										Advanced Options
									</button>
								</div>

								{#if showAdvancedOptions}
									<!-- Advanced Description -->
									<div class="form-control">
										<label class="label" for="description">
											<span class="label-text text-base-content/70">Description (optional)</span>
										</label>
										<textarea
											id="description"
											bind:value={description}
											placeholder="Additional details..."
											class="textarea textarea-bordered"
											rows="3"
										></textarea>
									</div>
								{/if}

								<!-- Centered Start Button with Play Icon -->
								<div class="flex flex-col items-center gap-2">
									<button
										class="btn btn-primary btn-lg rounded-full text-xl px-8"
										type="submit"
										disabled={!$network.isOnline}
									>
										<svg class="w-6 h-6 mr-2" fill="currentColor" viewBox="0 0 24 24">
											<path d="M8 5v14l11-7z" />
										</svg>
										Start Timer
									</button>
									{#if !$network.isOnline}
										<div class="text-sm text-warning font-medium">
											Cannot start timer while offline
										</div>
									{/if}
								</div>
							</form>
						</div>
					</div>
				{/if}
			</div>

			<!-- Today's Timers Section (Full Width, Below Timer) -->
			<div>
				<div class="card bg-base-100 shadow-xl">
					<div class="card-body">
						<h3 class="text-lg font-medium text-base-content mb-4">Today's Sessions</h3>
						{#if loadingTodaySessions}
							<div class="flex justify-center py-8">
								<span class="loading loading-spinner loading-lg"></span>
							</div>
						{:else if todaySessions.length > 0}
							<div class="space-y-4">
								{#each todaySessions as session (session.id)}
									<div
										class="border border-base-300 rounded-lg p-4 hover:bg-base-200 transition-colors"
									>
										<div class="flex justify-between items-start">
											<div class="flex-1 min-w-0">
												<h4 class="font-medium text-base-content truncate">{session.title}</h4>
												<p class="text-sm text-base-content/70 truncate">{session.project}</p>
												{#if session.description}
													<p class="text-sm text-base-content/60 mt-1 truncate">
														{session.description}
													</p>
												{/if}
											</div>
											<div class="text-right ml-4">
												<div class="text-sm text-base-content/90 font-mono">
													{session.duration || '00:00:00'}
												</div>
												<div class="text-xs text-base-content/60 mt-1">
													{new Date(session.start_time).toLocaleTimeString([], {
														hour: '2-digit',
														minute: '2-digit'
													})} -
													{session.end_time
														? new Date(session.end_time).toLocaleTimeString([], {
																hour: '2-digit',
																minute: '2-digit'
															})
														: 'Active'}
												</div>
											</div>
										</div>
									</div>
								{/each}
							</div>
						{:else}
							<div class="text-center py-8">
								<p class="text-base-content/70">No completed sessions today</p>
								<p class="text-sm text-base-content/50 mt-2">
									Your completed timer sessions will appear here
								</p>
							</div>
						{/if}
					</div>
				</div>
			</div>
		{/if}

		<!-- Process Monitor Button (only) -->
		<div class="flex flex-wrap gap-4 mt-8">
			{#if !loadingFeatureFlags && showProcessMonitorButton}
				<button class="btn btn-outline btn-lg" onclick={openProcessMonitor}>
					<svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z"
						></path>
					</svg>
					Process Monitor
				</button>
			{/if}
		</div>
	{/if}

	{#if showTasksModal}
		<TasksModal on:close={() => (showTasksModal = false)} />
	{/if}
</div>
