<script lang="ts">
  import { onMount } from 'svelte';
  import { invoke } from '@tauri-apps/api/core';
  import TitleBar from '$lib/TitleBar.svelte';
  import { featureFlagsStore } from '$lib/stores';

  interface ProcessInfo {
    pid: number;
    name: string;
    cpu_usage: number;
    memory_usage: number;
  }

  let processes = $state<ProcessInfo[]>([]);
  let loading = $state(true);
  let error = $state('');
  let isTauri = $state(false);
  let backendAccessAllowed = $state(false);
  let loadingFeatureFlags = $state(true);
  let currentWindow = $state<any>();
  let refreshInterval: NodeJS.Timeout | null = null;

  async function loadProcesses() {
    // Check if backend feature is enabled before loading processes
    if (!backendAccessAllowed) {
      error = 'Process monitoring backend is not enabled for your account';
      loading = false;
      return;
    }

    try {
      loading = true;
      error = '';
      processes = await invoke('get_processes');
    } catch (err) {
      error = 'Failed to load processes';
      console.error(err);
    } finally {
      loading = false;
    }
  }

  function formatMemory(bytes: number): string {
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(1)} MB`;
  }

  function formatCpu(cpu: number): string {
    return `${cpu.toFixed(1)}%`;
  }

  onMount(() => {
    let cleanup = () => {};

    // Check if running in Tauri
    (async () => {
      try {
        const { getCurrentWindow } = await import('@tauri-apps/api/window');
        currentWindow = getCurrentWindow();
        console.log('Processes page: Detected Tauri environment, window:', currentWindow);
        isTauri = true;
      } catch (error) {
        console.log('Processes page: Not in Tauri environment:', error);
        isTauri = false;
      }
    })();

    // Load feature flags and setup process monitoring
    (async () => {
      try {
        loadingFeatureFlags = true;
        await featureFlagsStore.loadFeatures();
        backendAccessAllowed = await featureFlagsStore.isFeatureEnabled('process-monitor-backend');
        loadingFeatureFlags = false;

        // Log access to both UI and backend features
        try {
          await featureFlagsStore.logFeatureAccess('process-monitor-ui');
          if (backendAccessAllowed) {
            await featureFlagsStore.logFeatureAccess('process-monitor-backend');
          }
        } catch (logError) {
          console.warn('Failed to log feature access:', logError);
        }

        // Only load processes if backend is enabled
        if (backendAccessAllowed) {
          await loadProcesses();

          // Auto-refresh every 2 seconds
          refreshInterval = setInterval(loadProcesses, 2000);

          cleanup = () => {
            if (refreshInterval) {
              clearInterval(refreshInterval);
              refreshInterval = null;
            }
          };
        }
      } catch (error) {
        console.error('Failed to load feature flags:', error);
        loadingFeatureFlags = false;
        backendAccessAllowed = false;
      }
    })();

    return cleanup;
  });
</script>

{#if isTauri}
  <TitleBar window={currentWindow} />
{/if}

<div class="container mx-auto p-4" class:with-titlebar={isTauri}>
  <h1 class="text-2xl font-bold mb-4">System Processes</h1>

  {#if loadingFeatureFlags}
    <div class="flex justify-center">
      <span class="loading loading-spinner loading-lg"></span>
      <span class="ml-2">Checking feature access...</span>
    </div>
  {:else if !backendAccessAllowed}
    <div class="alert alert-warning">
      <svg class="w-6 h-6 stroke-current shrink-0 stroke-2" fill="none" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path>
      </svg>
      <div>
        <h3 class="font-bold">Process Monitoring Disabled</h3>
        <div class="text-xs">The process monitoring backend feature is not enabled for your account. Please contact your administrator to request access.</div>
      </div>
    </div>
  {:else if loading && processes.length === 0}
    <div class="flex justify-center">
      <span class="loading loading-spinner loading-lg"></span>
    </div>
  {:else if error}
    <div class="alert alert-error">
      <span>{error}</span>
    </div>
  {:else}
    <div class="overflow-x-auto">
      <table class="table table-zebra w-full">
        <thead>
          <tr>
            <th>PID</th>
            <th>Name</th>
            <th>CPU Usage</th>
            <th>Memory Usage</th>
          </tr>
        </thead>
        <tbody>
          {#each processes as process (process.pid)}
            <tr>
              <td>{process.pid}</td>
              <td>{process.name}</td>
              <td>{formatCpu(process.cpu_usage)}</td>
              <td>{formatMemory(process.memory_usage)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>

    {#if loading}
      <div class="text-center mt-4">
        <span class="text-sm text-gray-500">Refreshing...</span>
      </div>
    {/if}
  {/if}
</div>

<style>
  .with-titlebar {
    padding-top: 30px;
  }
</style>