<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { Bell, Wifi, WifiOff, Loader2, AlertCircle } from '@lucide/svelte';
  import { authToken } from '$lib/stores';
  import { getNotificationService, type NotificationService } from '$lib/notifications';

  // Notification service states
  type NotificationState = 'disconnected' | 'connecting' | 'connected' | 'error';

  let notificationService: NotificationService | null = null;
  let state: NotificationState = 'disconnected';
  let isTauri = false;
  let showDetails = false;
  let authTokenValue: string | null = null;

  // Subscribe to auth token changes
  const unsubscribeAuth = authToken.subscribe(value => {
    authTokenValue = value;
    updateState();
  });

  let pollingInterval: number | null = null;

  onMount(async () => {
    try {
      // Check if we're in Tauri environment
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      getCurrentWindow();
      isTauri = true;
      
      // Get notification service
      notificationService = getNotificationService();
      updateState();
      
      // Start polling to check connection status every 2 seconds
      pollingInterval = setInterval(() => {
        updateState();
      }, 2000) as unknown as number;
      
    } catch {
      isTauri = false;
      notificationService = null;
      updateState();
    }
  });

  onDestroy(() => {
    unsubscribeAuth();
    if (pollingInterval) {
      clearInterval(pollingInterval);
      pollingInterval = null;
    }
  });

  function updateState() {
    if (!isTauri || !notificationService || !authTokenValue) {
      state = 'disconnected';
      return;
    }

    try {
      const serviceConnected = notificationService.isConnected();
      const isConnecting = (notificationService as any).isConnecting;
      
      // Determine state based on both connected and connecting status
      if (serviceConnected === true) {
        state = 'connected';
      } else if (isConnecting === true) {
        state = 'connecting';
      } else if (serviceConnected === false && isConnecting === false) {
        state = 'disconnected';
      } else {
        state = 'error';
      }
    } catch {
      state = 'error';
    }
  }

  function getStateInfo(state: NotificationState) {
    switch (state) {
      case 'connected':
        return {
          icon: Bell,
          color: 'text-success',
          bgColor: 'bg-success',
          borderColor: 'border-success',
          label: 'Connected',
          description: 'Notification service is active'
        };
      case 'connecting':
        return {
          icon: Loader2,
          color: 'text-warning',
          bgColor: 'bg-warning',
          borderColor: 'border-warning',
          label: 'Connecting',
          description: 'Connecting to notification service...'
        };
      case 'error':
        return {
          icon: AlertCircle,
          color: 'text-error',
          bgColor: 'bg-error',
          borderColor: 'border-error',
          label: 'Error',
          description: 'Failed to connect to notification service'
        };
      case 'disconnected':
      default:
        return {
          icon: WifiOff,
          color: 'text-neutral',
          bgColor: 'bg-neutral',
          borderColor: 'border-neutral',
          label: 'Disconnected',
          description: 'Not connected to notification service'
        };
    }
  }

  async function toggleDetails() {
    showDetails = !showDetails;
  }

  function handleManualReconnect() {
    if (notificationService && authTokenValue) {
      try {
        notificationService.connect();
        state = 'connecting';
        
        // Update state after a short delay to see if connection succeeds
        setTimeout(() => {
          updateState();
        }, 3000);
      } catch {
        state = 'error';
      }
    }
    showDetails = false;
  }

  $: stateInfo = getStateInfo(state);
  $: IconComponent = stateInfo.icon;
</script>

<!-- Notification Status Indicator -->
<div class="indicator">
  <span class="indicator-item indicator-start">
    <button
      class="btn btn-ghost btn-xs relative"
      onclick={toggleDetails}
      title={`Notification Service: ${stateInfo.label}`}
      aria-label={`Notification service status: ${stateInfo.label}`}
    >
      <div class="relative">
        <IconComponent 
          size={16} 
          class={`${stateInfo.color} transition-all duration-200 ${state === 'connecting' ? 'animate-spin' : ''}`} 
        />
        
        <!-- Connection status indicator dot -->
        <div 
          class={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border border-base-100 ${stateInfo.bgColor} transition-all duration-200 ${
            state === 'connected' ? 'animate-pulse' : ''
          }`}
        ></div>
      </div>
    </button>
  </span>
</div>

<!-- Details Dropdown -->
{#if showDetails}
  <!-- Overlay to close dropdown -->
  <div 
    class="fixed inset-0 z-40" 
    onclick={() => showDetails = false}
    role="button"
    tabindex="0"
    onkeydown={(e) => e.key === 'Escape' && (showDetails = false)}
    aria-hidden="true"
  ></div>
  
  <!-- Dropdown content -->
  <div class="absolute top-full right-0 mt-2 w-80 bg-base-100 rounded-lg shadow-lg border border-base-300 z-50">
    <div class="p-4">
      <div class="flex items-center gap-3 mb-3">
        <div class="relative">
          <IconComponent 
            size={20} 
            class={`${stateInfo.color} ${state === 'connecting' ? 'animate-spin' : ''}`} 
          />
          <div 
            class={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border border-base-100 ${stateInfo.bgColor} ${
              state === 'connected' ? 'animate-pulse' : ''
            }`}
          ></div>
        </div>
        
        <div class="flex-1">
          <h3 class="font-medium text-base-content">{stateInfo.label}</h3>
          <p class="text-sm text-base-content/70">{stateInfo.description}</p>
        </div>
        
        <button
          class="btn btn-xs btn-ghost"
          onclick={() => showDetails = false}
          aria-label="Close details"
        >
          ✕
        </button>
      </div>
      
      <div class="text-xs text-base-content/60 space-y-1">
        <div class="flex justify-between">
          <span>Environment:</span>
          <span class={isTauri ? 'text-success' : 'text-error'}>
            {isTauri ? 'Tauri Desktop' : 'Browser'}
          </span>
        </div>
        <div class="flex justify-between">
          <span>Authentication:</span>
          <span class={authTokenValue ? 'text-success' : 'text-error'}>
            {authTokenValue ? 'Authenticated' : 'Not Authenticated'}
          </span>
        </div>
        <div class="flex justify-between">
          <span>Service:</span>
          <span class={notificationService ? 'text-success' : 'text-error'}>
            {notificationService ? 'Available' : 'Not Available'}
          </span>
        </div>
      </div>
      
      <div class="mt-3 pt-3 border-t border-base-300 flex gap-2">
        <button
          class="btn btn-sm btn-ghost flex-1"
          onclick={() => updateState()}
          title="Refresh status"
        >
          🔄 Refresh
        </button>
        
        {#if state === 'error' || state === 'disconnected'}
          <button
            class="btn btn-sm btn-primary flex-1"
            onclick={handleManualReconnect}
            disabled={!authTokenValue || !isTauri}
          >
            <Wifi size={14} class="mr-2" />
            Reconnect
          </button>
        {/if}
      </div>
      
      {#if !authTokenValue}
        <p class="text-xs text-base-content/60 mt-2 text-center">
          Please log in to enable notifications
        </p>
      {:else if !isTauri}
        <p class="text-xs text-base-content/60 mt-2 text-center">
          Notifications only work in desktop app
        </p>
      {/if}
    </div>
  </div>
{/if}

<style>
  .indicator {
    position: relative;
    display: inline-block;
  }
  
  .indicator-item {
    position: absolute;
  }
  
  .indicator-start {
    bottom: 2px;
    left: 2px;
  }
</style>