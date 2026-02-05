<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { get } from 'svelte/store';
	import { goto } from '$app/navigation';
	import { user, timeEntriesDisplayMode, featureFlagsStore } from '$lib/stores';
	import { projects, timeEntries, type Project, type TimeEntry } from '$lib/api';
	import TasksModal from '$lib/TasksModal.svelte';
	import Last7DaysChart from '$lib/Last7DaysChart.svelte';
	import CalendarHeatmap from '$lib/CalendarHeatmap.svelte';
	import { preloadOnHover } from '$lib/preloadOnHover';
	import DebugPreloadIcon from '$lib/DebugPreloadIcon.svelte';
	import { debugPreloadActive } from '$lib/preloadOnHover';
	import { refreshController } from '$lib/refreshController';
	import DataFreshnessIndicator from '$lib/DataFreshnessIndicator.svelte';
	import { network } from '$lib/network';

	let projectsList = $state<Project[]>([]);
	let recentEntries = $state<TimeEntry[]>([]);
	let todayEntries = $state<TimeEntry[]>([]);
	let activeEntry = $state<TimeEntry | null>(null);
	let loading = $state(true);
	let error = $state('');
	let showTasksModal = $state(false);

	// Stats
	let totalHoursToday = $state(0);
	let completedTasksToday = $state(0);
	let activeProject = $state<string>('None');

	// Feature flags
	let showProcessMonitorButton = $state(false);
	let loadingFeatureFlags = $state(true);

	// Track preloading state
	const preloadingStates = {
		'/timer': false,
		'/entries': false,
		'/settings': false,
		'/processes': false
	};

	// Handler to update preloading state
	function setPreloading(path, state) {
		preloadingStates[path] = state;
	}

	// Clean up old dashboard caches (keep only last 7 days)
	function cleanupOldDashboardCaches() {
		try {
			const today = new Date();
			const keysToRemove: string[] = [];
			
			for (let i = 0; i < localStorage.length; i++) {
				const key = localStorage.key(i);
				if (key?.startsWith('dashboard_today_')) {
					const dateStr = key.replace('dashboard_today_', '');
					const cacheDate = new Date(dateStr);
					const daysDiff = Math.floor((today.getTime() - cacheDate.getTime()) / (1000 * 60 * 60 * 24));
					
					if (daysDiff > 7) {
						keysToRemove.push(key);
					}
				}
			}
			
			keysToRemove.forEach(key => localStorage.removeItem(key));
			if (keysToRemove.length > 0) {
				console.log(`Cleaned up ${keysToRemove.length} old dashboard caches`);
			}
		} catch (err) {
			console.warn('Failed to cleanup old dashboard caches:', err);
		}
	}

	// Helper to load cached projects
	async function loadCachedProjects(): Promise<Project[] | null> {
		try {
			// Try localStorage as fallback (saved by refreshAllData)
			const stored = localStorage.getItem('dashboard_projects');
			if (stored) {
				const parsed = JSON.parse(stored);
				return parsed || null;
			}
			// Also try the timer page's projects cache
			const timerProjects = localStorage.getItem('timer_last_projects');
			if (timerProjects) {
				const parsed = JSON.parse(timerProjects);
				return parsed.data || null;
			}
		} catch (err) {
			console.warn('Failed to load cached projects:', err);
		}
		return null;
	}

	// Helper to load cached time entries
	async function loadCachedTimeEntries(today: string): Promise<{
		todayEntries: TimeEntry[];
		recentEntries: TimeEntry[];
		activeEntry: TimeEntry | null;
	} | null> {
		try {
			// Try localStorage cache
			const todayKey = `dashboard_today_${today}`;
			const recentKey = 'dashboard_recent_entries';
			const activeKey = 'dashboard_active_entry';

			const todayStored = localStorage.getItem(todayKey);
			const recentStored = localStorage.getItem(recentKey);
			const activeStored = localStorage.getItem(activeKey);

			if (todayStored || recentStored) {
				return {
					todayEntries: todayStored ? JSON.parse(todayStored) : [],
					recentEntries: recentStored ? JSON.parse(recentStored) : [],
					activeEntry: activeStored ? JSON.parse(activeStored) : null
				};
			}
		} catch (err) {
			console.warn('Failed to load cached time entries:', err);
		}
		return null;
	}

	// Note: Authentication is now handled globally in the layout
	onMount(async () => {
		try {
			// Clean up old caches on mount
			cleanupOldDashboardCaches();
			
			loading = true;
			loadingFeatureFlags = true;

			// Load feature flags
			await featureFlagsStore.loadFeatures();
			showProcessMonitorButton = await featureFlagsStore.isFeatureEnabled('process-monitor-ui');
			loadingFeatureFlags = false;

			// Check if online before making API calls
			const isOnline = $network.isOnline;

			// Load projects, today's entries, and active entry in parallel
			const today = new Date().toISOString().split('T')[0]; // Format: YYYY-MM-DD

			if (isOnline) {
				// Online: fetch from API
				const [projectsResult, todayEntriesResult, recentEntriesResult, activeResult] =
					await Promise.allSettled([
						projects.list(),
						timeEntries.listWithFilters({
							start_date_after_tz: today,
							start_date_before_tz: today,
							limit: 50
						}),
						timeEntries.list(),
						(async () => {
							try {
								return await timeEntries.getCurrentActive();
							} catch {
								return null;
							}
						})()
					]);

					if (projectsResult.status === 'fulfilled') {
						projectsList = projectsResult.value;
					}

					if (todayEntriesResult.status === 'fulfilled') {
						const data = todayEntriesResult.value;
						todayEntries = Array.isArray(data) ? data : data?.results || [];
						calculateStats(
							todayEntries,
							activeResult.status === 'fulfilled' ? activeResult.value : null
						);
					}

					if (recentEntriesResult.status === 'fulfilled') {
						const data = recentEntriesResult.value;
						const entriesArray = Array.isArray(data) ? data : data?.results || [];
						recentEntries = entriesArray.slice(0, 5);
					}

					if (activeResult.status === 'fulfilled') {
						activeEntry = activeResult.value;
					}
				} else {
					// Offline: try to load from cache
					console.log('Dashboard: Offline mode, loading from cache');

					// Load cached projects
					const cachedProjects = await loadCachedProjects();
					if (cachedProjects) {
						projectsList = cachedProjects;
					}

					// Load cached time entries
					const cachedEntries = await loadCachedTimeEntries(today);
					if (cachedEntries) {
						todayEntries = cachedEntries.todayEntries;
						recentEntries = cachedEntries.recentEntries;
						activeEntry = cachedEntries.activeEntry;
						calculateStats(todayEntries, activeEntry);
					}
				}

				loading = false;
		} catch (err) {
			console.error('Dashboard loading error:', err);
			error = 'Failed to load dashboard data';
			loading = false;
		}
	});

	// Register refresh callback with refresh controller
	refreshController.register('dashboard-page', async () => {
		await refreshAllData();
	});

	// Cleanup function to unregister from refresh controller
	onDestroy(() => {
		refreshController.unregister('dashboard-page');
	});

	function filterTodayEntries(entries: TimeEntry[]): TimeEntry[] {
		// With the API now returning timezone-aware datetimes, we can still do client-side filtering
		// but now it will be based on the correctly converted datetimes from the API
		const today = new Date();
		today.setHours(0, 0, 0, 0);
		const tomorrow = new Date(today);
		tomorrow.setDate(tomorrow.getDate() + 1);

		return entries.filter((entry) => {
			const entryDate = new Date(entry.start_time);
			return entryDate >= today && entryDate < tomorrow;
		});
	}

	function calculateStats(entries: TimeEntry[], active: TimeEntry | null) {
		// Calculate completed tasks today
		completedTasksToday = entries.filter((entry) => !entry.is_active).length;

		// Calculate total hours today
		let totalSeconds = 0;
		for (const entry of entries) {
			if (entry.duration) {
				const duration = parseInt(entry.duration, 10) || 0; // Duration is now in seconds as string
				totalSeconds += duration;
			} else if (entry.is_active && active?.id === entry.id) {
				// For active entry, calculate from start time to now
				const startTime = new Date(entry.start_time).getTime();
				totalSeconds += Math.floor((Date.now() - startTime) / 1000);
			}
		}
		totalHoursToday = Math.floor((totalSeconds / 3600) * 10) / 10; // Round to 1 decimal

		// Get active project
		if (active) {
			const project = projectsList.find((p) => p.title === active.project);
			activeProject = project?.title || active.project || 'Unknown';
		}
	}

	function formatDuration(seconds: number): string {
		const hours = Math.floor(seconds / 3600);
		const minutes = Math.floor((seconds % 3600) / 60);
		return `${hours}h ${minutes}m`;
	}

	function formatDate(dateStr: string): string {
		const date = new Date(dateStr);
		const now = new Date();
		const diffTime = now.getTime() - date.getTime();
		const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

		if (diffDays === 0) {
			return 'Today';
		} else if (diffDays === 1) {
			return 'Yesterday';
		} else if (diffDays < 7) {
			return `${diffDays} days ago`;
		} else {
			return date.toLocaleDateString();
		}
	}

	const openTimeEntries = async () => {
		const mode = get(timeEntriesDisplayMode);
		if (mode === 'modal') {
			showTasksModal = true;
			return;
		}
		goto('/entries');
	};

	const openProcessMonitor = async () => {
		try {
			await featureFlagsStore.logFeatureAccess('process-monitor-ui');
			await featureFlagsStore.logFeatureAccess('process-monitor-backend');
		} catch (error) {
			console.error('Failed to log process monitor access:', error);
		}

		try {
			const { getCurrentWindow } = await import('@tauri-apps/api/window');
			getCurrentWindow();
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
		} catch {
			window.open('/processes', '_blank');
		}
	};

	function getGreeting(): string {
		const hour = new Date().getHours();
		if (hour < 12) return 'Good morning';
		if (hour < 17) return 'Good afternoon';
		return 'Good evening';
	}

	// Enable debug mode in development
	const debugMode = import.meta.env.DEV;

	async function refreshAllData() {
		try {
			// Skip refresh if offline
			if (!$network.isOnline) {
				console.log('Dashboard: Skipping refresh while offline');
				return;
			}

			// Load projects, today's entries, and active entry in parallel
			const today = new Date().toISOString().split('T')[0]; // Format: YYYY-MM-DD
			const [projectsResult, todayEntriesResult, recentEntriesResult, activeResult] =
				await Promise.allSettled([
					projects.list(),
					timeEntries.listWithFilters({
						start_date_after_tz: today,
						start_date_before_tz: today,
						limit: 50 // Reasonable limit for today's entries
					}),
					timeEntries.list(), // For recent entries
					(async () => {
						try {
							return await timeEntries.getCurrentActive();
						} catch {
							return null;
						}
					})()
				]);

			if (projectsResult.status === 'fulfilled') {
				projectsList = projectsResult.value;
				// Save to localStorage for offline use
				try {
					localStorage.setItem('dashboard_projects', JSON.stringify(projectsResult.value));
				} catch (e) {}
			}

			if (todayEntriesResult.status === 'fulfilled') {
				const data = todayEntriesResult.value;
				todayEntries = Array.isArray(data) ? data : data?.results || [];
				calculateStats(
					todayEntries,
					activeResult.status === 'fulfilled' ? activeResult.value : null
				);
				// Save to localStorage for offline use
				try {
					localStorage.setItem(`dashboard_today_${today}`, JSON.stringify(todayEntries));
				} catch (e) {}
			}

			if (recentEntriesResult.status === 'fulfilled') {
				const data = recentEntriesResult.value;
				const entriesArray = Array.isArray(data) ? data : data?.results || [];
				recentEntries = entriesArray.slice(0, 5);
				// Save to localStorage for offline use
				try {
					localStorage.setItem('dashboard_recent_entries', JSON.stringify(recentEntries));
				} catch (e) {}
			}

			if (activeResult.status === 'fulfilled') {
				activeEntry = activeResult.value;
				// Save to localStorage for offline use
				try {
					localStorage.setItem('dashboard_active_entry', JSON.stringify(activeEntry));
				} catch (e) {}
			}

			// Update data freshness manager - only when online
			if (typeof window !== 'undefined') {
				import('$lib/dataFreshness').then(({ dataFreshnessManager }) => {
					dataFreshnessManager.updateTimestamp('global');
				}).catch(() => {
					// Ignore import errors when offline
				});
			}
		} catch (err) {
			console.error('Dashboard refresh error:', err);
			error = 'Failed to refresh dashboard data';
		}
	}
</script>

<div class="container mx-auto p-4 lg:p-8">
	<!-- Header -->
	<div class="mb-6">
		<div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
			<div>
				<h1 class="text-3xl font-bold text-primary">Dashboard</h1>
				<p class="text-base-content/70">{getGreeting()}, {$user?.first_name || 'User'}!</p>
			</div>
			<DataFreshnessIndicator onRefresh={refreshAllData} />
		</div>
	</div>

	{#if loading}
		<!-- Skeleton Loading State -->
		<div class="space-y-8">
			<!-- Quick Stats Skeletons -->
			<div class="grid grid-cols-1 md:grid-cols-3 gap-6">
				{#each Array(3) as _}
					<div class="card bg-base-100 shadow-lg">
						<div class="card-body">
							<div class="flex items-center justify-between">
								<div class="flex-1">
									<div class="skeleton h-4 w-24 mb-2"></div>
									<div class="skeleton h-8 w-16"></div>
								</div>
								<div class="skeleton h-12 w-12 rounded-full"></div>
							</div>
						</div>
					</div>
				{/each}
			</div>

			<!-- Charts Skeletons -->
			<div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
				<div class="card shadow-lg">
					<div class="card-body">
						<div class="skeleton h-6 w-32 mb-4"></div>
						<div class="skeleton h-48 w-full"></div>
					</div>
				</div>
				<div class="card shadow-lg">
					<div class="card-body">
						<div class="skeleton h-6 w-32 mb-4"></div>
						<div class="skeleton h-48 w-full"></div>
					</div>
				</div>
			</div>

			<!-- Recent Activity & Quick Actions Skeletons -->
			<div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
				<!-- Recent Entries Skeleton -->
				<div class="card bg-base-100 shadow-lg">
					<div class="card-body">
						<div class="skeleton h-6 w-32 mb-4"></div>
						<div class="space-y-3">
							{#each Array(5) as _}
								<div class="flex items-center justify-between p-3 bg-base-200 rounded-lg">
									<div class="flex-1">
										<div class="skeleton h-4 w-32 mb-1"></div>
										<div class="skeleton h-3 w-24"></div>
									</div>
									<div class="skeleton h-6 w-12 rounded"></div>
								</div>
							{/each}
						</div>
						<div class="card-actions mt-4">
							<div class="skeleton h-8 w-32"></div>
						</div>
					</div>
				</div>

				<!-- Quick Actions Skeleton -->
				<div class="card bg-base-100 shadow-lg">
					<div class="card-body">
						<div class="skeleton h-6 w-32 mb-4"></div>
						<div class="space-y-3">
							{#each Array(4) as _}
								<div class="skeleton h-12 w-full"></div>
							{/each}
						</div>
					</div>
				</div>
			</div>
		</div>
	{:else if error}
		<div class="alert alert-error">
			<span>{error}</span>
		</div>
	{:else}
		<!-- Quick Stats -->
		<div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-4">
			<div class="card bg-base-100 shadow-lg">
				<div class="card-body">
					<div class="flex items-center justify-between">
						<div>
							<h3 class="card-title text-sm font-normal text-base-content/70">Hours Today</h3>
							<p class="text-3xl font-bold text-primary">{totalHoursToday}h</p>
						</div>
						<div class="avatar placeholder bg-primary/10 rounded-full p-4">
							<svg
								class="w-8 h-8 text-primary"
								fill="none"
								stroke="currentColor"
								viewBox="0 0 24 24"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
								></path>
							</svg>
						</div>
					</div>
				</div>
			</div>

			<div class="card bg-base-100 shadow-lg">
				<div class="card-body">
					<div class="flex items-center justify-between">
						<div>
							<h3 class="card-title text-sm font-normal text-base-content/70">Tasks Completed</h3>
							<p class="text-3xl font-bold text-secondary">{completedTasksToday}</p>
						</div>
						<div class="avatar placeholder bg-secondary/10 rounded-full p-4">
							<svg
								class="w-8 h-8 text-secondary"
								fill="none"
								stroke="currentColor"
								viewBox="0 0 24 24"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
								></path>
							</svg>
						</div>
					</div>
				</div>
			</div>

			<div class="card bg-base-100 shadow-lg">
				<div class="card-body">
					<div class="flex items-center justify-between">
						<div>
							<h3 class="card-title text-sm font-normal text-base-content/70">Active Project</h3>
							<p class="text-lg font-semibold truncate">{activeProject}</p>
						</div>
						<div class="avatar placeholder bg-accent/10 rounded-full p-4">
							<svg
								class="w-8 h-8 text-accent"
								fill="none"
								stroke="currentColor"
								viewBox="0 0 24 24"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z"
								></path>
							</svg>
						</div>
					</div>
				</div>
			</div>
		</div>

		<!-- Charts Section -->
		<div
			class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-3 mb-4 items-stretch auto-rows-fr"
		>
			<!-- Last 7 Days Chart -->
			<div class="h-full min-h-[420px]"><Last7DaysChart /></div>

			<!-- Calendar Heatmap -->
			<div class="h-full min-h-[420px]"><CalendarHeatmap /></div>
		</div>

		<!-- Recent Activity & Quick Actions -->
		<div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
			<!-- Recent Entries -->
			<div class="card bg-base-100 shadow-lg">
				<div class="card-body">
					<h2 class="card-title mb-4">Recent Activity</h2>
					{#if recentEntries.length > 0}
						<div class="space-y-3">
							{#each recentEntries as entry}
								<div class="flex items-center justify-between p-3 bg-base-200 rounded-lg">
									<div class="flex-1">
										<h4 class="font-medium text-sm">{entry.title}</h4>
										<p class="text-xs text-base-content/60">
											{entry.project} • {formatDate(entry.start_time)}
										</p>
									</div>
									<div class="flex items-center space-x-2">
										<span
											class="badge {entry.is_active ? 'badge-success' : 'badge-neutral'} text-xs"
										>
											{entry.is_active ? 'Active' : 'Done'}
										</span>
									</div>
								</div>
							{/each}
						</div>
						<div class="card-actions mt-4">
							<button
								class="btn btn-outline btn-sm"
								use:preloadOnHover={'/entries'}
								on:preloadstart={() => setPreloading('/entries', true)}
								on:preloadend={() => setPreloading('/entries', false)}
								on:preloadcancel={() => setPreloading('/entries', false)}
								on:click={openTimeEntries}
							>
								{#if preloadingStates['/entries']}
									<span class="loading loading-spinner loading-xs mr-2"></span>
								{/if}
								<DebugPreloadIcon active={debugMode && preloadingStates['/entries']} />
								View All Entries
							</button>
						</div>
					{:else}
						<div class="text-center py-8 text-base-content/50">
							<svg
								class="w-16 h-16 mx-auto mb-4"
								fill="none"
								stroke="currentColor"
								viewBox="0 0 24 24"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
								></path>
							</svg>
							<p>No recent entries</p>
						</div>
					{/if}
				</div>
			</div>

			<!-- Quick Actions -->
			<div class="card bg-base-100 shadow-lg">
				<div class="card-body">
					<h2 class="card-title mb-4">Quick Actions</h2>
					<div class="space-y-3">
						<button
							class="btn btn-primary btn-block justify-start"
							use:preloadOnHover={'/timer'}
							on:preloadstart={() => setPreloading('/timer', true)}
							on:preloadend={() => setPreloading('/timer', false)}
							on:preloadcancel={() => setPreloading('/timer', false)}
							on:click={() => goto('/timer')}
						>
							{#if preloadingStates['/timer']}
								<span class="loading loading-spinner loading-xs mr-2"></span>
							{/if}
							<DebugPreloadIcon active={debugMode && preloadingStates['/timer']} />
							<svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M14.828 14.828a4 4 0 01-5.656 0M9 10h1.586a1 1 0 01.707.293l2.414 2.414a1 1 0 00.707.293H15M9 10V9a2 2 0 012-2h2a2 2 0 012 2v1"
								></path>
							</svg>
							Start New Timer
						</button>

						<button
							class="btn btn-outline btn-block justify-start"
							use:preloadOnHover={'/entries'}
							on:preloadstart={() => setPreloading('/entries', true)}
							on:preloadend={() => setPreloading('/entries', false)}
							on:preloadcancel={() => setPreloading('/entries', false)}
							on:click={openTimeEntries}
						>
							{#if preloadingStates['/entries']}
								<span class="loading loading-spinner loading-xs mr-2"></span>
							{/if}
							<DebugPreloadIcon active={debugMode && preloadingStates['/entries']} />
							<svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
								></path>
							</svg>
							View All Entries
						</button>

						<button
							class="btn btn-outline btn-block justify-start"
							use:preloadOnHover={'/settings'}
							on:preloadstart={() => setPreloading('/settings', true)}
							on:preloadend={() => setPreloading('/settings', false)}
							on:preloadcancel={() => setPreloading('/settings', false)}
							on:click={() => goto('/settings')}
						>
							{#if preloadingStates['/settings']}
								<span class="loading loading-spinner loading-xs mr-2"></span>
							{/if}
							<DebugPreloadIcon active={debugMode && preloadingStates['/settings']} />
							<svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
								></path>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
								></path>
							</svg>
							Settings
						</button>

						{#if !loadingFeatureFlags && showProcessMonitorButton}
							<button
								class="btn btn-outline btn-block justify-start"
								use:preloadOnHover={'/processes'}
								on:preloadstart={() => setPreloading('/processes', true)}
								on:preloadend={() => setPreloading('/processes', false)}
								on:preloadcancel={() => setPreloading('/processes', false)}
								on:click={openProcessMonitor}
							>
								{#if preloadingStates['/processes']}
									<span class="loading loading-spinner loading-xs mr-2"></span>
								{/if}
								<DebugPreloadIcon active={debugMode && preloadingStates['/processes']} />
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
				</div>
			</div>
		</div>

		<!-- Active Timer Card -->
		{#if activeEntry}
			<div class="card bg-primary text-primary-content mt-8">
				<div class="card-body">
					<h2 class="card-title">Currently Tracking</h2>
					<p class="text-lg">{activeEntry.title}</p>
					<p class="text-sm opacity-70">{activeEntry.project}</p>
					<div class="card-actions justify-end">
						<button
							class="btn btn-secondary"
							use:preloadOnHover={'/timer'}
							on:click={() => goto('/timer')}
						>
							<DebugPreloadIcon active={debugMode && preloadingStates['/timer']} />
							View in Timer
						</button>
					</div>
				</div>
			</div>
		{/if}
	{/if}

	{#if showTasksModal}
		<TasksModal on:close={() => (showTasksModal = false)} />
	{/if}
</div>

<style>
	.dashboard-button {
		position: relative;
		/* ... existing styles ... */
	}
	.loading-indicator {
		position: absolute;
		top: 5px;
		right: 5px;
	}
</style>
