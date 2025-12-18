<script lang="ts">
  import { onMount } from 'svelte';
  import { get } from 'svelte/store';
  import { goto } from '$app/navigation';
  import { authToken, user, timeEntriesDisplayMode, featureFlagsStore } from '$lib/stores';
  import { projects, timeEntries, type Project, type TimeEntry } from '$lib/api';
  import { preventDefault } from '$lib/commands.svelte';
  
  // Add logging to debug the invoke issue
  console.log('🔍 Timer page loading, checking Tauri environment...');
  console.log('🔍 Window object exists:', typeof window !== 'undefined');
  console.log('🔍 Tauri flag:', typeof window !== 'undefined' ? (window as any).__TAURI__ : 'N/A');
  import TasksModal from '$lib/TasksModal.svelte';
  import type { PageData } from './$types';

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
          if (activeEntry) startTimer();
          console.log('Active entry loaded at', new Date().toISOString(), activeEntry ? 'with active entry' : 'no active entry');
        } catch (err: unknown) {
          // 404 is expected when no active timer, so we don't treat it as an error
          const status = (err as { response?: { status?: number } })?.response?.status;
          if (status !== 404) {
            console.error('Error loading active entry:', err);
            error = 'Failed to load active timer';
          }
          activeEntry = null;
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
    } catch (err) {
      console.error('Error loading data at', new Date().toISOString(), err);
      error = 'Failed to load data';
      loadingProjects = false;
      loadingActiveEntry = false;
      loadingFeatureFlags = false;
      loadingTodaySessions = false;
    }

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
        const timerState = activeEntry ? {
          active: true,
          title: activeEntry.title,
          start_time: activeEntry.start_time
        } : {
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
        emit('test-event', 'hello from frontend').then(() => {
          console.log('Test event emitted successfully');
        }).catch(err => {
          console.error('Failed to emit test event:', err);
        });
      }, 1000);
    }
  });

  function startTimer() {
    if (activeEntry) {
      const startTime = new Date(activeEntry.start_time).getTime();
      elapsed = Math.floor((Date.now() - startTime) / 1000)
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

      console.log('Loading today\'s sessions for date (Asia/Tehran):', dateStr);

      // Load time entries for today that are not active (finished sessions)
      // Using the listWithFilters function with timezone-aware parameters
      const response = await timeEntries.listWithFilters({
        start_date_after_tz: dateStr,
        start_date_before_tz: dateStr,
        ordering: '-start_time' // Most recent first
      });

      // Filter to only include completed sessions (not active) and limit to 5
      const completedSessions = response.results
        .filter((entry: TimeEntry) => !entry.is_active)
        .slice(0, 5);

      todaySessions = completedSessions;
    } catch (err) {
      console.error('Error loading today\'s sessions:', err);
      error = 'Failed to load today\'s sessions';
    } finally {
      loadingTodaySessions = false;
    }
  }

  const onStartTimer = preventDefault(async () => {
    if (!selectedProject || !title) return;

    try {
      isStartingTimer = true;
      activeEntry = await timeEntries.start({
        title,
        description,
        project: selectedProject,
      });
      startTimer();
      
      // Emit event to Tauri
      if (typeof window !== 'undefined' && (window as any).__TAURI__) {
        const { emit } = await import('@tauri-apps/api/event');
        console.log('Emitting timer-started event:', activeEntry.title);
        await emit('timer-started', { title: activeEntry.title, start_time: activeEntry.start_time });
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
        contentProtected: true,
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
        contentProtected: true,
      });
      console.log('Process monitor WebviewWindow created:', webview);
    } catch {
      console.log('Web environment, opening new tab');
      window.open('/processes', '_blank');
    }
  };

  // DevTools control removed from dashboard. Use Settings to inspect the
  // feature flag and the backend will only open devtools when allowed.

</script>

<div class="container mx-auto p-4 lg:p-8 max-w-7xl">
  <!-- Page Header -->
  <div class="mb-8">
    <h1 class="text-3xl font-bold text-primary">Timer</h1>
    <p class="text-base-content/70">Track your time with precision</p>
  </div>

  {#if loadingProjects}
     <div class="flex justify-center items-center min-h-[50vh]">
       <span class="loading loading-spinner loading-lg"></span>
     </div>
  {:else}
     {#if error}
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
                     <h1 class="text-5xl lg:text-6xl font-bold tracking-tighter leading-tight text-base-content">
                       {formatTime(elapsed)}
                     </h1>
                   </div>
                   
                   <!-- Big Stop Button at the bottom -->
                   <div class="flex justify-center mt-4">
                     <button class="btn btn-lg rounded-full bg-red-500 hover:bg-red-600 text-white border-none text-lg font-bold" onclick={onStopTimer}>
                       <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                         <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                         <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z"></path>
                       </svg>
                       Stop
                     </button>
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
                     <select id="project" bind:value={selectedProject} class="select select-bordered" required>
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
                       onclick={() => showAdvancedOptions = !showAdvancedOptions}
                     >
                       <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                         <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
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
                   <div class="flex justify-center">
                     <button class="btn btn-primary btn-lg rounded-full text-xl px-8" type="submit">
                       <svg class="w-6 h-6 mr-2" fill="currentColor" viewBox="0 0 24 24">
                         <path d="M8 5v14l11-7z"/>
                       </svg>
                       Start Timer
                     </button>
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
                     <div class="border border-base-300 rounded-lg p-4 hover:bg-base-200 transition-colors">
                       <div class="flex justify-between items-start">
                         <div class="flex-1 min-w-0">
                           <h4 class="font-medium text-base-content truncate">{session.title}</h4>
                           <p class="text-sm text-base-content/70 truncate">{session.project}</p>
                           {#if session.description}
                             <p class="text-sm text-base-content/60 mt-1 truncate">{session.description}</p>
                           {/if}
                         </div>
                         <div class="text-right ml-4">
                           <div class="text-sm text-base-content/90 font-mono">{session.duration || '00:00:00'}</div>
                           <div class="text-xs text-base-content/60 mt-1">
                             {new Date(session.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} -
                             {session.end_time ? new Date(session.end_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Active'}
                           </div>
                         </div>
                       </div>
                     </div>
                   {/each}
                 </div>
               {:else}
                 <div class="text-center py-8">
                   <p class="text-base-content/70">No completed sessions today</p>
                   <p class="text-sm text-base-content/50 mt-2">Your completed timer sessions will appear here</p>
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
               <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z"></path>
             </svg>
             Process Monitor
           </button>
         {/if}
       </div>
     {/if}
   {/if}

   {#if showTasksModal}
     <TasksModal on:close={() => showTasksModal = false} />
   {/if}
</div>