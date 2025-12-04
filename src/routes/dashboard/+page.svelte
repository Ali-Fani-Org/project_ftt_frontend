<script lang="ts">
  import { onMount } from 'svelte';
  import { get } from 'svelte/store';
  import { goto } from '$app/navigation';
  import { user, timeEntriesDisplayMode, featureFlagsStore } from '$lib/stores';
  import { projects, timeEntries, type Project, type TimeEntry } from '$lib/api';
  import TasksModal from '$lib/TasksModal.svelte';
  import Last7DaysChart from '$lib/Last7DaysChart.svelte';
  import CalendarHeatmap from '$lib/CalendarHeatmap.svelte';

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

  // Note: Authentication is now handled globally in the layout
  onMount(async () => {
    try {
      loading = true;
      loadingFeatureFlags = true;

      // Load feature flags
      await featureFlagsStore.loadFeatures();
      showProcessMonitorButton = await featureFlagsStore.isFeatureEnabled('process-monitor-ui');
      loadingFeatureFlags = false;

      // Load projects and entries in parallel
      const [projectsResult, entriesResult, activeResult] = await Promise.allSettled([
        projects.list(),
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

      if (entriesResult.status === 'fulfilled') {
        const data = entriesResult.value;
        recentEntries = data.results.slice(0, 5); // Get last 5 entries
        todayEntries = filterTodayEntries(data.results);
        calculateStats(todayEntries, activeResult.status === 'fulfilled' ? activeResult.value : null);
      }

      if (activeResult.status === 'fulfilled') {
        activeEntry = activeResult.value;
      }

      loading = false;
    } catch (err) {
      console.error('Dashboard loading error:', err);
      error = 'Failed to load dashboard data';
      loading = false;
    }
  });

  function filterTodayEntries(entries: TimeEntry[]): TimeEntry[] {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    return entries.filter(entry => {
      const entryDate = new Date(entry.start_time);
      return entryDate >= today && entryDate < tomorrow;
    });
  }

  function calculateStats(entries: TimeEntry[], active: TimeEntry | null) {
    // Calculate completed tasks today
    completedTasksToday = entries.filter(entry => !entry.is_active).length;

    // Calculate total hours today
    let totalSeconds = 0;
    for (const entry of entries) {
      if (entry.duration) {
        const duration = parseDuration(entry.duration);
        totalSeconds += duration;
      } else if (entry.is_active && active?.id === entry.id) {
        // For active entry, calculate from start time to now
        const startTime = new Date(entry.start_time).getTime();
        totalSeconds += Math.floor((Date.now() - startTime) / 1000);
      }
    }
    totalHoursToday = Math.floor(totalSeconds / 3600 * 10) / 10; // Round to 1 decimal

    // Get active project
    if (active) {
      const project = projectsList.find(p => p.title === active.project);
      activeProject = project?.title || active.project || 'Unknown';
    }
  }

  function parseDuration(duration: string): number {
    // Parse duration like "02:30:45" (HH:MM:SS)
    const parts = duration.split(':').map(Number);
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
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
        contentProtected: true,
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
</script>

<div class="container mx-auto p-4 lg:p-8">
  <!-- Header -->
  <div class="mb-8">
    <h1 class="text-3xl font-bold text-primary">Dashboard</h1>
    <p class="text-base-content/70">{getGreeting()}, {$user?.first_name || 'User'}!</p>
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
    <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
      <div class="card bg-base-100 shadow-lg">
        <div class="card-body">
          <div class="flex items-center justify-between">
            <div>
              <h3 class="card-title text-sm font-normal text-base-content/70">Hours Today</h3>
              <p class="text-3xl font-bold text-primary">{totalHoursToday}h</p>
            </div>
            <div class="avatar placeholder bg-primary/10 rounded-full p-4">
              <svg class="w-8 h-8 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
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
              <svg class="w-8 h-8 text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
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
              <svg class="w-8 h-8 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"></path>
              </svg>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Charts Section -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
      <!-- Last 7 Days Chart -->
      <div class="card shadow-lg">
        <div class="card-body"><Last7DaysChart /></div>
      </div>
      
      <!-- Calendar Heatmap -->
      <div class="card shadow-lg">
        <div class="card-body"><CalendarHeatmap /></div>
      </div>
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
                    <p class="text-xs text-base-content/60">{entry.project} • {formatDate(entry.start_time)}</p>
                  </div>
                  <div class="flex items-center space-x-2">
                    <span class="badge {entry.is_active ? 'badge-success' : 'badge-neutral'} text-xs">
                      {entry.is_active ? 'Active' : 'Done'}
                    </span>
                  </div>
                </div>
              {/each}
            </div>
            <div class="card-actions mt-4">
              <button class="btn btn-outline btn-sm" onclick={openTimeEntries}>
                View All Entries
              </button>
            </div>
          {:else}
            <div class="text-center py-8 text-base-content/50">
              <svg class="w-16 h-16 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
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
            <button class="btn btn-primary btn-block justify-start" onclick={() => goto('/timer')}>
              <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.828 14.828a4 4 0 01-5.656 0M9 10h1.586a1 1 0 01.707.293l2.414 2.414a1 1 0 00.707.293H15M9 10V9a2 2 0 012-2h2a2 2 0 012 2v1"></path>
              </svg>
              Start New Timer
            </button>

            <button class="btn btn-outline btn-block justify-start" onclick={openTimeEntries}>
              <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"></path>
              </svg>
              View All Entries
            </button>

            <button class="btn btn-outline btn-block justify-start" onclick={() => goto('/settings')}>
              <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path>
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path>
              </svg>
              Settings
            </button>

            {#if !loadingFeatureFlags && showProcessMonitorButton}
              <button class="btn btn-outline btn-block justify-start" onclick={openProcessMonitor}>
                <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z"></path>
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
            <button class="btn btn-secondary" onclick={() => goto('/timer')}>
              View in Timer
            </button>
          </div>
        </div>
      </div>
    {/if}
  {/if}

  {#if showTasksModal}
    <TasksModal on:close={() => showTasksModal = false} />
  {/if}
</div>