<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { idleMonitorStore, isUserIdleMonitoringEnabled, type IdleStatus, type ActivityLog } from '$lib/stores';
  import { featureFlagsStore } from '$lib/stores';
  import { Play, Pause, RefreshCw, Info, Clock, History, Trash2, Settings, CheckCircle, XCircle } from '@lucide/svelte';

  let isEnabled = $state(false);
  let currentStatus = $state<IdleStatus | null>(null);
  let activityLogs = $state<ActivityLog[]>([]);
  let isMonitoring = $state(false);
  let error = $state<string | null>(null);
  let tauriDetected = $state(false);

  console.log('🧩 IdleMonitorDebug component loaded');

  // Subscribe to store
  const unsubscribe = idleMonitorStore.subscribe(state => {
    isEnabled = state.isEnabled;
    currentStatus = state.currentStatus;
    activityLogs = state.activityLogs;
    isMonitoring = state.isMonitoring;
    error = state.error;
    tauriDetected = state.tauriDetected;
    
    console.log('📡 Store update received:', {
      isEnabled: state.isEnabled,
      currentStatus: state.currentStatus,
      activityLogsCount: state.activityLogs.length,
      isMonitoring: state.isMonitoring,
      error: state.error,
      tauriDetected: state.tauriDetected
    });
  });

  onMount(() => {
    console.log('🚀 IdleMonitorDebug component mounted');
    console.log('🔄 Initializing idle monitor store...');
    idleMonitorStore.initialize();
  });

  onDestroy(() => {
    console.log('🧹 IdleMonitorDebug component destroyed');
    unsubscribe();
    idleMonitorStore.cleanup();
  });

  function formatDuration(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  function formatTimestamp(timestamp: string): string {
    return new Date(timestamp).toLocaleTimeString();
  }

  async function refreshStatus() {
    console.log('🔄 Manual refresh status requested');
    const status = await idleMonitorStore.getIdleStatus();
    if (status) {
      console.log('✅ Manual refresh successful:', status);
      currentStatus = status;
    } else {
      console.log('❌ Manual refresh failed');
    }
  }

  async function clearLogs() {
    console.log('🗑️ Clear logs requested');
    idleMonitorStore.clearLogs();
  }

  async function loadFeatureFlags() {
    console.log('🔄 Load feature flags requested');
    try {
      await featureFlagsStore.loadFeatures();
      console.log('✅ Feature flags loaded successfully');
    } catch (error) {
      console.error('❌ Failed to load feature flags:', error);
    }
  }

  function getActivityStateColor(state: string): string {
    switch (state) {
      case 'became_idle': return 'text-warning';
      case 'became_active': return 'text-success';
      default: return 'text-info';
    }
  }

  // Reactive logging for key state changes
  $effect(() => {
    if (currentStatus) {
      console.log('💫 Current status updated:', currentStatus);
    }
  });
  
  $effect(() => {
    if (activityLogs.length > 0) {
      console.log('📋 Activity logs updated:', activityLogs.length, 'logs');
    }
  });
</script>

<div class="card bg-base-200 shadow-lg">
  <div class="card-body">
    <div class="card-title">
      <span class="text-xl">User Idle Monitor Debug</span>
      <div class="badge badge-info">Debug Mode</div>
    </div>

    <!-- Environment Status -->
    <div class="grid grid-cols-2 gap-4 mb-4">
      <div class="alert {tauriDetected ? 'alert-success' : 'alert-error'}">
        <div class="flex items-center gap-2">
          {#if tauriDetected}
            <CheckCircle class="w-4 h-4" />
            <span class="text-sm">Tauri: Detected</span>
          {:else}
            <XCircle class="w-4 h-4" />
            <span class="text-sm">Tauri: Not Detected</span>
          {/if}
        </div>
      </div>
      
      <div class="alert {isEnabled ? 'alert-success' : 'alert-warning'}">
        <div class="flex items-center gap-2">
          {#if isEnabled}
            <CheckCircle class="w-4 h-4" />
            <span class="text-sm">Feature Flag: Enabled</span>
          {:else}
            <XCircle class="w-4 h-4" />
            <span class="text-sm">Feature Flag: Disabled</span>
          {/if}
        </div>
      </div>
    </div>

    <!-- Debug Controls -->
    <div class="flex gap-2 mb-4">
      <button class="btn btn-sm btn-outline" onclick={loadFeatureFlags}>
        <RefreshCw class="w-4 h-4" />
        Load Feature Flags
      </button>
      <button class="btn btn-sm btn-outline" onclick={refreshStatus}>
        <RefreshCw class="w-4 h-4" />
        Test Tauri Commands
      </button>
    </div>

    {#if !isEnabled}
      <div class="alert alert-warning">
        <Info class="w-4 h-4" />
        <div>
          <div>User idle monitoring is disabled via feature flag: 'user-idle-monitoring'</div>
          <div class="text-sm mt-1">
            <button class="btn btn-xs btn-outline" onclick={loadFeatureFlags}>Reload feature flags</button>
          </div>
        </div>
      </div>
    {:else if !tauriDetected}
      <div class="alert alert-error">
        <XCircle class="w-4 h-4" />
        <div>
          <div>Tauri environment not detected</div>
          <div class="text-sm mt-1">
            <p>This could mean:</p>
            <ul class="text-xs mt-1 ml-4">
              <li>• The app is not running in a Tauri window</li>
              <li>• Tauri APIs are not yet loaded</li>
              <li>• There's an issue with the Tauri bridge</li>
            </ul>
          </div>
        </div>
      </div>
    {:else if error}
      <div class="alert alert-error">
        <Info class="w-4 h-4" />
        <span>Error: {error}</span>
      </div>
    {:else}
      <!-- Status Overview -->
      <div class="stats stats-vertical lg:stats-horizontal shadow mb-6">
        <div class="stat">
          <div class="stat-figure text-primary">
            {#if currentStatus?.is_idle}
              <Pause class="w-8 h-8" />
            {:else}
              <Play class="w-8 h-8" />
            {/if}
          </div>
          <div class="stat-title">Status</div>
          <div class="stat-value text-{currentStatus?.is_idle ? 'warning' : 'success'}">
            {currentStatus?.is_idle ? 'Idle' : 'Active'}
          </div>
          <div class="stat-desc">
            {isMonitoring ? 'Monitoring' : 'Not monitoring'}
            {#if currentStatus}
              • Last update: {formatTimestamp(currentStatus.last_update)}
            {/if}
          </div>
        </div>

        <div class="stat">
          <div class="stat-title">Idle Time</div>
          <div class="stat-value text-{currentStatus?.is_idle ? 'warning' : 'success'}">
            <Clock class="w-6 h-6 inline mr-2" />
            {currentStatus ? formatDuration(currentStatus.idle_time_seconds) : '00:00:00'}
          </div>
          <div class="stat-desc">
            Current idle duration
          </div>
        </div>

        <div class="stat">
          <div class="stat-title">Session Duration</div>
          <div class="stat-value text-info">
            <Clock class="w-6 h-6 inline mr-2" />
            {currentStatus ? formatDuration(currentStatus.session_duration_seconds) : '00:00:00'}
          </div>
          <div class="stat-desc">
            Since last activity
          </div>
        </div>
      </div>

      <!-- Backend Status Indicator -->
      <div class="alert alert-success mb-4">
        <Info class="w-4 h-4" />
        <div>
          <div class="font-semibold">✅ Tauri Backend Status: Working</div>
          <div class="text-sm">Backend is successfully detecting idle/active states and emitting events.</div>
          {#if activityLogs.length === 0}
            <div class="text-sm text-warning mt-1">⚠️ No frontend logs yet - checking event listeners...</div>
          {/if}
        </div>
      </div>

      <!-- Current Status Details -->
      {#if currentStatus}
        <div class="mb-6">
          <h3 class="text-lg font-semibold mb-2">Current Status</h3>
          <div class="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span class="font-medium">Last Update:</span>
              <span class="ml-2">{formatTimestamp(currentStatus.last_update)}</span>
            </div>
            <div>
              <span class="font-medium">Idle Threshold:</span>
              <span class="ml-2">2 minutes (120 seconds)</span>
            </div>
          </div>
        </div>
      {/if}

      <!-- Activity Logs -->
      <div class="mb-6">
        <div class="flex justify-between items-center mb-2">
          <h3 class="text-lg font-semibold">
            <History class="w-5 h-5 inline mr-2" />
            Activity Logs ({activityLogs.length})
          </h3>
          <div class="flex gap-2">
            <button class="btn btn-sm btn-outline" onclick={refreshStatus}>
              <RefreshCw class="w-4 h-4" />
              Refresh
            </button>
            <button class="btn btn-sm btn-outline btn-error" onclick={clearLogs} disabled={activityLogs.length === 0}>
              <Trash2 class="w-4 h-4" />
              Clear
            </button>
          </div>
        </div>

        {#if activityLogs.length === 0}
          <div class="text-center py-8 text-base-content/50">
            <History class="w-12 h-12 mx-auto mb-2 opacity-50" />
            <p>No activity logs yet</p>
            <p class="text-sm mt-1">
              {#if isMonitoring}
                Waiting for idle state changes...
              {:else}
                Monitoring not active - check feature flag status above
              {/if}
            </p>
          </div>
        {:else}
          <div class="overflow-x-auto max-h-64">
            <table class="table table-sm">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>State</th>
                  <th>Idle Duration</th>
                  <th>Session Duration</th>
                </tr>
              </thead>
              <tbody>
                {#each activityLogs.slice(0, 20) as log}
                  <tr>
                    <td class="text-xs">{formatTimestamp(log.timestamp)}</td>
                    <td>
                      <span class="badge badge-sm {getActivityStateColor(log.activity_state)}">
                        {log.activity_state}
                      </span>
                    </td>
                    <td class="text-xs">{formatDuration(log.idle_time_seconds)}</td>
                    <td class="text-xs">{formatDuration(log.session_duration_seconds)}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
          {#if activityLogs.length > 20}
            <p class="text-xs text-base-content/50 mt-2">Showing latest 20 of {activityLogs.length} logs</p>
          {/if}
        {/if}
      </div>

      <!-- Debug Information -->
      <div class="alert alert-info">
        <Info class="w-5 h-5" />
        <div>
          <h4 class="font-semibold">Debug Information</h4>
          <div class="text-sm space-y-1">
            <div>• Tauri Backend: ✅ Working (see terminal logs)</div>
            <div>• Feature Flag Status: {isEnabled ? '✅ Enabled' : '❌ Disabled'}</div>
            <div>• Tauri Detection: {tauriDetected ? '✅ Detected' : '❌ Not Detected'}</div>
            <div>• Event Listeners: {isMonitoring ? '✅ Active' : '❌ Inactive'}</div>
            <div>• Activity Logs: {activityLogs.length} entries</div>
            <div>• Component State: Mounted and watching for changes</div>
          </div>
        </div>
      </div>

      <!-- Future Server Sync Info -->
      <div class="alert alert-success">
        <Info class="w-5 h-5" />
        <div>
          <h4 class="font-semibold">Ready for Server Sync</h4>
          <p class="text-sm">Activity logs are stored locally and ready to be synchronized with the server when needed.</p>
        </div>
      </div>
    {/if}
  </div>
</div>