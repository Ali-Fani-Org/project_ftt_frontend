<script lang="ts">
  import { onMount } from 'svelte';
  import { testNotification, debugNotificationSystem } from './notification-channels';
  
  let debugLogs: string[] = [];
  let isDebugging = false;
  
  function addLog(message: string) {
    const timestamp = new Date().toLocaleTimeString();
    debugLogs = [`[${timestamp}] ${message}`, ...debugLogs].slice(0, 50); // Keep last 50 logs
  }
  
  async function runFullDebug() {
    isDebugging = true;
    addLog('🚀 Starting full notification system debug...');
    
    try {
      await debugNotificationSystem();
      addLog('✅ Full debug completed successfully');
    } catch (error) {
      addLog(`❌ Debug failed: ${error}`);
    }
    
    isDebugging = false;
  }
  
  async function testSpecificType(type: 'INFO' | 'WARNING' | 'ERROR' | 'SUCCESS' | 'CRITICAL') {
    addLog(`🧪 Testing ${type} notification...`);
    
    try {
      await testNotification(type);
      addLog(`✅ ${type} test completed`);
    } catch (error) {
      addLog(`❌ ${type} test failed: ${error}`);
    }
  }
  
  async function testLegacySystem() {
    addLog('🧪 Testing legacy notification system...');
    
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      
      await invoke('test_notification_sound', {
        notificationType: 'INFO'
      });
      
      addLog('✅ Legacy test completed');
    } catch (error) {
      addLog(`❌ Legacy test failed: ${error}`);
    }
  }
  
  onMount(() => {
    addLog('🔧 Notification Debug Component loaded');
  });
</script>

<div class="notification-debug p-4 border rounded-lg bg-gray-50 max-w-4xl">
  <h3 class="text-lg font-semibold mb-4">🔍 Notification Sound Debug Panel</h3>
  
  <!-- Control Buttons -->
  <div class="flex flex-wrap gap-2 mb-4">
    <button 
      on:click={runFullDebug}
      disabled={isDebugging}
      class="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
    >
      {isDebugging ? 'Debugging...' : '🧪 Run Full Debug'}
    </button>
    
    <button 
      on:click={testLegacySystem}
      class="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600"
    >
      🔊 Test Legacy Sound System
    </button>
    
    <button 
      on:click={() => debugLogs = []}
      class="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600"
    >
      🗑️ Clear Logs
    </button>
  </div>
  
  <!-- Individual Type Tests -->
  <div class="mb-4">
    <h4 class="font-medium mb-2">🧪 Test Individual Notification Types:</h4>
    <div class="flex flex-wrap gap-2">
      <button on:click={() => testSpecificType('INFO')} class="px-3 py-1 bg-blue-100 text-blue-800 rounded hover:bg-blue-200">
        ℹ️ Info
      </button>
      <button on:click={() => testSpecificType('WARNING')} class="px-3 py-1 bg-yellow-100 text-yellow-800 rounded hover:bg-yellow-200">
        ⚠️ Warning
      </button>
      <button on:click={() => testSpecificType('ERROR')} class="px-3 py-1 bg-red-100 text-red-800 rounded hover:bg-red-200">
        ❌ Error
      </button>
      <button on:click={() => testSpecificType('SUCCESS')} class="px-3 py-1 bg-green-100 text-green-800 rounded hover:bg-green-200">
        ✅ Success
      </button>
      <button on:click={() => testSpecificType('CRITICAL')} class="px-3 py-1 bg-purple-100 text-purple-800 rounded hover:bg-purple-200">
        🚨 Critical
      </button>
    </div>
  </div>
  
  <!-- Debug Logs -->
  <div class="bg-black text-green-400 p-3 rounded font-mono text-sm max-h-60 overflow-y-auto">
    <h4 class="text-white mb-2">📋 Debug Logs:</h4>
    {#if debugLogs.length === 0}
      <div class="text-gray-500">No logs yet. Run a test to see debug output.</div>
    {:else}
      {#each debugLogs as log}
        <div class="mb-1">{log}</div>
      {/each}
    {/if}
  </div>
  
  <!-- Instructions -->
  <div class="mt-4 p-3 bg-blue-50 border border-blue-200 rounded text-sm">
    <h5 class="font-medium text-blue-800 mb-1">🔧 How to Test:</h5>
    <ol class="list-decimal list-inside text-blue-700 space-y-1">
      <li>Check that notification permissions are granted in your system settings</li>
      <li>Make sure system volume is not muted</li>
      <li>Run "Full Debug" to test the entire notification system</li>
      <li>Check the logs above for any error messages</li>
      <li>Try individual notification types to isolate issues</li>
      <li>Test the legacy system as a fallback verification</li>
    </ol>
  </div>
</div>

<style>
  .notification-debug {
    font-family: system-ui, sans-serif;
  }
</style>