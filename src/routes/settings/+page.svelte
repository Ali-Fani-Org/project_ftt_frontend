<script lang="ts">
  import { baseUrl, theme, customThemes, minimizeToTray, closeToTray, autostart } from '$lib/stores';
  import { enable, disable } from '@tauri-apps/plugin-autostart';
  import IdleMonitorDebug from '$lib/IdleMonitorDebug.svelte';
  import { isUserIdleMonitoringEnabled, isUserIdleMonitorDebugEnabled } from '$lib/stores';
  import { featureFlagsStore } from '$lib/stores';
  import { onMount } from 'svelte';
  import { getVersion } from '@tauri-apps/api/app';
  import { goto } from '$app/navigation';

  let localBaseUrl = $state($baseUrl);
  let localTheme = $state($theme);
  let customTheme = $state('');
  let enablePreview = $state(false);
  let localMinimizeToTray = $state($minimizeToTray);
  let localCloseToTray = $state($closeToTray);
  let localAutostart = $state($autostart);
  let appVersion = $state('');
  let showLogoutConfirm = $state(false);
  let showIdleDebug = $state(false);

  onMount(async () => {
    appVersion = await getVersion();
    // Load feature flags and check if debug is enabled
    try {
      await featureFlagsStore.loadFeatures();
      showIdleDebug = await isUserIdleMonitorDebugEnabled();
      console.log('🔍 Debug feature flag check result:', showIdleDebug);
    } catch (error) {
      console.error('Failed to load feature flags for debug check:', error);
      showIdleDebug = false;
    }
  });

  const builtInThemes = [
       "light", "dark", "cupcake", "bumblebee", "emerald", "corporate",
       "synthwave", "retro", "cyberpunk", "valentine", "halloween", "garden",
       "forest", "aqua", "lofi", "pastel", "fantasy", "wireframe", "black",
       "luxury", "dracula", "cmyk", "autumn", "business", "acid", "lemonade",
       "night", "coffee", "winter","dark-futuristic"
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
  }

  async function saveAutostart() {
    autostart.set(localAutostart);
    if (localAutostart) {
      await enable();
    } else {
      await disable();
    }
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
    <h1 class="text-3xl font-bold text-primary">Settings</h1>
    <p class="text-base-content/70">Version {appVersion}</p>
  </div>

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
            <button class="btn btn-primary join-item" onclick={saveBaseUrl}>
              Save
            </button>
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
            <button class="btn btn-primary join-item" onclick={addCustomTheme}>
              Add
            </button>
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
        
        <button class="btn btn-error" onclick={confirmLogout}>
          Logout
        </button>
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