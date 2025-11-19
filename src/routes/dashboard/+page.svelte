<script lang="ts">
   import { onMount } from 'svelte';
   import { get } from 'svelte/store';
   import { goto } from '$app/navigation';
   import { authToken, user, showSettings, timeEntriesDisplayMode, logout, featureFlagsStore, isDevtoolsEnabled } from '$lib/stores';
   import { projects, timeEntries, type Project, type TimeEntry } from '$lib/api';
   import { preventDefault } from '$lib/commands.svelte';
   import TasksModal from '$lib/TasksModal.svelte';

  let activeEntry = $state<TimeEntry | null>(null);
  let projectsList = $state<Project[]>([]);
  let loadingProjects = $state(true);
  let loadingActiveEntry = $state(false);
  let error = $state('');

  // Form data
  let title = $state('');
  let description = $state('');
  let selectedProject = $state<number | null>(null);

  // Timer
  let elapsed = $state(0);
  let timerInterval = $state<any>(null);

  // Mobile menu
  let menuOpen = $state(false);

  // Tasks modal
  let showTasksModal = $state(false);

  // Feature flags state
  let showProcessMonitorButton = $state(false);
  let showDevtoolsButton = $state(false);
  let loadingFeatureFlags = $state(true);


  onMount(async () => {
      console.log('Dashboard onMount started at', new Date().toISOString());
      const token = get(authToken);
      if (!token) {
        goto('/');
        return;
      }

      try {
        loadingProjects = true;
        loadingActiveEntry = true;
        loadingFeatureFlags = true;

        // Load feature flags first
        await featureFlagsStore.loadFeatures();
        showProcessMonitorButton = await featureFlagsStore.isFeatureEnabled('process-monitor-ui');
        showDevtoolsButton = await featureFlagsStore.isFeatureEnabled('devtools');
        console.log('Feature flags loaded:', {
          processMonitorUI: showProcessMonitorButton,
          devtools: showDevtoolsButton
        });
        // Temporary: Always show devtools button for testing
        showDevtoolsButton = true;
        console.log('Devtools button will be shown:', showDevtoolsButton);
        loadingFeatureFlags = false;

        // Load both projects and active entry in parallel
        const [projectsResult, activeResult] = await Promise.allSettled([
          projects.list(),
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
          console.log('Projects loaded at', new Date().toISOString());
        } else {
          throw projectsResult.reason;
        }

        loadingProjects = false;

        if (activeResult.status === 'fulfilled') {
          activeEntry = activeResult.value;
          if (activeEntry) startTimer();
          console.log('Active entry loaded at', new Date().toISOString(), activeEntry ? 'with active entry' : 'no active entry');
        } else {
          activeEntry = null;
          console.log('Active entry failed at', new Date().toISOString());
        }

        loadingActiveEntry = false;
      } catch (err) {
        console.log('Error loading data at', new Date().toISOString(), err);
        error = 'Failed to load data';
        loadingProjects = false;
        loadingActiveEntry = false;
        loadingFeatureFlags = false;
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

  const onStartTimer = preventDefault(async () => {
    if (!selectedProject || !title) return;

    try {
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
      // Reset form
      title = '';
      description = '';
      selectedProject = null;
    } catch (err) {
      error = 'Failed to start timer';
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
        url: `${window.location.origin}/tasks`,
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
      window.open('/tasks', '_blank');
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

  const openDevtools = async () => {
    // Log feature access
    try {
      await featureFlagsStore.logFeatureAccess('devtools');
    } catch (error) {
      console.error('Failed to log devtools access:', error);
    }

    // Try Tauri first, fallback to web browser
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('toggle_devtools');
    } catch {
      // Web browser fallback - F12 toggle
      const event = new KeyboardEvent('keydown', {
        key: 'F12',
        code: 'F12',
        keyCode: 123,
        which: 123,
        bubbles: true,
        cancelable: true
      });
      window.dispatchEvent(event);
    }
  };

</script>

{#if loadingProjects}
   <div class="flex justify-center items-center min-h-screen">
     <span class="loading loading-spinner loading-lg"></span>
   </div>
{:else}
   <div class="container mx-auto p-4">
     <div class="navbar bg-base-100">
       <div class="navbar-start">
         <h1 class="text-xl font-bold">Time Tracker</h1>
       </div>
       <div class="navbar-end md:hidden">
         <details class="dropdown dropdown-end">
           <summary class="btn btn-ghost">
             <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
               <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"></path>
             </svg>
           </summary>
           <ul class="menu menu-sm dropdown-content mt-3 z-[1] p-2 shadow bg-base-100 rounded-box w-52">
             <li><span>Welcome, {get(user)?.first_name}!</span></li>
             <li><button onclick={() => showSettings.set(true)}>Settings</button></li>
           </ul>
         </details>
       </div>
       <div class="navbar-end hidden md:flex">
         <span class="mr-4">Welcome, {get(user)?.first_name}!</span>
         <button class="btn btn-ghost" onclick={openTimeEntries}>
           <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
             <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"></path>
           </svg>
           Time Entries
         </button>
         {#if !loadingFeatureFlags && showProcessMonitorButton}
           <button class="btn btn-ghost" onclick={openProcessMonitor}>
             <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
               <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z"></path>
             </svg>
             Process Monitor
           </button>
         {/if}
         {#if !loadingFeatureFlags && showDevtoolsButton}
           <button class="btn btn-ghost" onclick={openDevtools} title="Toggle Developer Tools">
             <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
               <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"></path>
             </svg>
             DevTools
           </button>
         {/if}
         <button class="btn btn-ghost" onclick={() => showSettings.set(true)}>
           <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
             <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path>
             <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path>
           </svg>
           Settings
         </button>
       </div>
     </div>

     {#if error}
       <div class="alert alert-error mt-4">
         <span>{error}</span>
       </div>
     {:else}
       {#if loadingActiveEntry}
         <div class="card bg-base-200 shadow-xl mt-8">
           <div class="card-body">
             <h2 class="card-title">Checking for active timer...</h2>
             <div class="flex justify-center">
               <span class="loading loading-spinner loading-lg"></span>
             </div>
           </div>
         </div>
       {:else if activeEntry}
         <div class="card bg-primary text-primary-content mt-8">
           <div class="card-body">
             <h2 class="card-title">Active Timer</h2>
             <p>{activeEntry.title}</p>
             <p class="text-4xl font-mono">{formatTime(elapsed)}</p>
             <div class="card-actions justify-end">
               <button class="btn btn-secondary" onclick={onStopTimer}>Stop Timer</button>
             </div>
           </div>
         </div>
       {:else}
         <div class="card bg-base-100 shadow-xl mt-8">
           <div class="card-body">
             <h2 class="card-title">Start New Timer</h2>
             <form onsubmit={onStartTimer}>
               <div class="form-control">
                 <label class="label" for="title">
                   <span class="label-text">Title</span>
                 </label>
                 <input
                   id="title"
                   bind:value={title}
                   type="text"
                   placeholder="Task title"
                   class="input input-bordered"
                   required
                 />
               </div>
               <div class="form-control">
                 <label class="label" for="description">
                   <span class="label-text">Description (optional)</span>
                 </label>
                 <textarea
                   id="description"
                   bind:value={description}
                   placeholder="Task description"
                   class="textarea textarea-bordered"
                 ></textarea>
               </div>
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
               <div class="form-control mt-6">
                 <button class="btn btn-primary" type="submit">Start Timer</button>
               </div>
             </form>
           </div>
         </div>
       {/if}
     {/if}
   </div>
 {/if}

 {#if showTasksModal}
   <TasksModal on:close={() => showTasksModal = false} />
 {/if}