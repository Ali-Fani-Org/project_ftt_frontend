<script lang="ts">
  import { baseUrl, theme, customThemes, minimizeToTray, closeToTray, autostart, timeEntriesDisplayMode } from '$lib/stores';
  import { enable, disable } from '@tauri-apps/plugin-autostart';
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
  let localTimeEntriesDisplayMode = $state($timeEntriesDisplayMode);
  let appVersion = $state('');
  let showLogoutConfirm = $state(false);

  onMount(async () => {
    appVersion = await getVersion();
    // no-op: devtools feature is managed elsewhere
  });

  const builtInThemes = [
       "light",
       "dark",
       "cupcake",
       "bumblebee",
       "emerald",
       "corporate",
       "synthwave",
       "retro",
       "cyberpunk",
       "valentine",
       "halloween",
       "garden",
       "forest",
       "aqua",
       "lofi",
       "pastel",
       "fantasy",
       "wireframe",
       "black",
       "luxury",
       "dracula",
       "cmyk",
       "autumn",
       "business",
       "acid",
       "lemonade",
       "night",
       "coffee",
       "winter",
       "dim",
       "nord",
       "sunset",
       "caramellatte",
       "abyss",
       "silk"
  ];

  let themes = $derived([...builtInThemes, ...Object.keys($customThemes), 'custom']);

  const timeEntriesDisplayModes = [
    { value: 'window', label: 'New Window/Tab' },
    { value: 'modal', label: 'Modal Dialog' },
    // Future options can be added here
  ];

  // Preview theme
  $effect(() => {
    if (enablePreview && localTheme && localTheme !== $theme) {
      console.log('Previewing theme:', localTheme);
      applyTheme(localTheme);
    } else if (!enablePreview) {
      // Reset to current theme
      applyTheme($theme);
    }
  });

  function applyTheme(themeName: string) {
    // Clear previous custom theme styles
    document.documentElement.removeAttribute('data-theme');
    const previousVars = document.documentElement.style.cssText.split(';').filter(prop => prop.trim());
    previousVars.forEach(() => {}); // Clear all inline styles
    
    if (themeName in $customThemes) {
      // Apply custom theme
      document.documentElement.setAttribute('data-theme', '');
      const vars = $customThemes[themeName];
      console.log('Applying custom vars:', vars);
      for (const [key, value] of Object.entries(vars)) {
        document.documentElement.style.setProperty(key, value);
      }
    } else {
      // Apply built-in theme
      document.documentElement.setAttribute('data-theme', themeName);
    }
  }

  async function save() {
    baseUrl.set(localBaseUrl);
    minimizeToTray.set(localMinimizeToTray);
    closeToTray.set(localCloseToTray);
    autostart.set(localAutostart);
    timeEntriesDisplayMode.set(localTimeEntriesDisplayMode);
    try {
      if (localAutostart) {
        await enable();
      } else {
        await disable();
      }
    } catch (error) {
      console.error('Failed to update autostart:', error);
    }
    if (localTheme === 'custom') {
      // Parse the custom theme
      const themeNameMatch = customTheme.match(/\[data-theme="([^"]+)"\]/);
      const originalName = themeNameMatch ? themeNameMatch[1] : 'custom';
      const displayName = `Custom(${originalName})`;
      const vars: Record<string, string> = {};

      // Parse CSS variables from the theme definition
      const varMatches = customTheme.matchAll(/--([a-z0-9-]+):\s*([^;]+);/g);
      for (const match of varMatches) {
        vars[`--${match[1]}`] = match[2].trim();
      }

      console.log('Parsed custom theme:', { originalName, displayName, vars });
      customThemes.update(ct => ({ ...ct, [displayName]: vars }));
      theme.set(displayName);
    } else {
      theme.set(localTheme);
    }
    // Optional: Show success message or redirect
    goto('/dashboard');
  }

  function cancel() {
    goto('/dashboard');
  }

  function confirmLogout() {
    // Import logout here to avoid circular dependency
    import('$lib/stores').then(({ logout }) => {
      logout();
    });
  }

  function cancelLogout() {
    showLogoutConfirm = false;
  }
</script>

<div class="container mx-auto p-4 lg:p-8 max-w-4xl">
  <div class="mb-8">
    <h1 class="text-3xl font-bold text-primary">Settings</h1>
    <p class="text-base-content/70">Customize your time tracking experience</p>
  </div>

  <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
    <!-- Main Settings -->
    <div class="card bg-base-100 shadow-lg">
      <div class="card-body">
        <h2 class="card-title mb-6">General Settings</h2>

        <div class="form-control mb-6">
          <label class="label" for="baseUrl">
            <span class="label-text font-semibold">Server URL</span>
            <span class="label-text-alt">Connect to your time tracker backend</span>
          </label>
          <input
            id="baseUrl"
            bind:value={localBaseUrl}
            type="text"
            placeholder="http://localhost:8000"
            class="input input-bordered"
          />
        </div>

        <div class="form-control mb-6">
          <label class="label" for="theme">
            <span class="label-text font-semibold">Theme</span>
            <span class="label-text-alt">Choose your preferred color scheme</span>
          </label>
          <select id="theme" bind:value={localTheme} class="select select-bordered">
            {#each themes as t}
              <option value={t}>{t}</option>
            {/each}
          </select>
          <label class="label cursor-pointer mt-2">
            <span class="label-text">Enable Preview</span>
            <input type="checkbox" bind:checked={enablePreview} class="checkbox checkbox-primary" />
          </label>
        </div>

        <div class="form-control mb-6">
          <label class="label" for="timeEntriesDisplayMode">
            <span class="label-text font-semibold">Time Entries Display</span>
            <span class="label-text-alt">How to show time entries when opened</span>
          </label>
          <select id="timeEntriesDisplayMode" bind:value={localTimeEntriesDisplayMode} class="select select-bordered">
            {#each timeEntriesDisplayModes as mode}
              <option value={mode.value}>{mode.label}</option>
            {/each}
          </select>
        </div>
      </div>
    </div>

    <!-- Application Behavior -->
    <div class="card bg-base-100 shadow-lg">
      <div class="card-body">
        <h2 class="card-title mb-6">Application Behavior</h2>

        <div class="space-y-4">
          <h3 class="font-semibold text-base-content/80">Tray Settings</h3>
          <div class="space-y-3 pl-4 border-l-2 border-primary/20">
            <label class="label cursor-pointer justify-start">
              <input type="checkbox" bind:checked={localMinimizeToTray} class="checkbox checkbox-primary mr-3" />
              <div>
                <span class="label-text">Minimize to tray</span>
                <div class="text-xs text-base-content/60">Hide window in system tray when minimized</div>
              </div>
            </label>
            <label class="label cursor-pointer justify-start">
              <input type="checkbox" bind:checked={localCloseToTray} class="checkbox checkbox-primary mr-3" />
              <div>
                <span class="label-text">Close to tray</span>
                <div class="text-xs text-base-content/60">Hide window in system tray when closed</div>
              </div>
            </label>
          </div>

          <h3 class="font-semibold text-base-content/80 mt-6">Startup</h3>
          <div class="space-y-3 pl-4 border-l-2 border-secondary/20">
            <label class="label cursor-pointer justify-start">
              <input type="checkbox" bind:checked={localAutostart} class="checkbox checkbox-secondary mr-3" />
              <div>
                <span class="label-text">Autostart on boot</span>
                <div class="text-xs text-base-content/60">Automatically start when system boots</div>
              </div>
            </label>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- Custom Themes Section -->
  {#if Object.keys($customThemes).length > 0}
    <div class="card bg-base-100 shadow-lg mt-8">
      <div class="card-body">
        <h2 class="card-title mb-6">Saved Custom Themes</h2>
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {#each Object.keys($customThemes) as ct}
            <div class="bg-base-200 p-4 rounded-lg border">
              <div class="flex justify-between items-center mb-2">
                <h4 class="font-medium text-sm">{ct}</h4>
                <button 
                  class="btn btn-xs btn-error" 
                  onclick={() => customThemes.update(cts => { const newCts = { ...cts }; delete newCts[ct]; return newCts; })}
                >
                  Remove
                </button>
              </div>
              <div class="text-xs text-base-content/60">Custom theme variables</div>
            </div>
          {/each}
        </div>
      </div>
    </div>
  {/if}

  <!-- Custom Theme Editor -->
  {#if localTheme === 'custom'}
    <div class="card bg-base-100 shadow-lg mt-8">
      <div class="card-body">
        <h2 class="card-title mb-6">Custom Theme Editor</h2>
        <div class="form-control">
          <label class="label" for="customTheme">
            <span class="label-text font-semibold">Theme Definition</span>
            <span class="label-text-alt">Paste your custom DaisyUI theme CSS</span>
          </label>
          <textarea
            id="customTheme"
            bind:value={customTheme}
            placeholder="Paste the full custom theme definition from DaisyUI website"
            class="textarea textarea-bordered font-mono text-sm"
            rows="12"
          ></textarea>
        </div>
      </div>
    </div>
  {/if}

  <!-- Theme Preview -->
  {#if enablePreview}
    <div class="card bg-base-100 shadow-lg mt-8">
      <div class="card-body">
        <h2 class="card-title mb-6">Theme Preview</h2>
        <div class="bg-base-100 p-6 rounded-lg border-2 border-dashed border-base-300">
          <div class="flex flex-wrap gap-3 mb-6">
            <button class="btn btn-primary">Primary</button>
            <button class="btn btn-secondary">Secondary</button>
            <button class="btn btn-accent">Accent</button>
            <button class="btn btn-neutral">Neutral</button>
          </div>
          <div class="card bg-base-200 shadow">
            <div class="card-body">
              <h3 class="card-title">Preview Card</h3>
              <p>This is how your theme looks with various components.</p>
              <div class="card-actions">
                <button class="btn btn-outline">Outline</button>
                <button class="btn btn-ghost">Ghost</button>
                <button class="btn btn-disabled">Disabled</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  {/if}

  <!-- App Info and Actions -->
  <div class="card bg-base-100 shadow-lg mt-8">
    <div class="card-body">
      <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center space-y-4 sm:space-y-0">
        <div>
          <h2 class="card-title">Application Info</h2>
          <p class="text-sm text-base-content/60">Version: {appVersion} | Build: {appVersion}</p>
        </div>
        
        <div class="flex space-x-3">
          <button class="btn btn-error btn-outline" onclick={() => showLogoutConfirm = true}>
            Logout
          </button>
          <button class="btn btn-ghost" onclick={cancel}>
            Cancel
          </button>
          <button class="btn btn-primary" onclick={save}>
            Save Settings
          </button>
        </div>
      </div>
    </div>
  </div>

  <!-- Logout Confirmation Modal -->
  {#if showLogoutConfirm}
    <div class="modal modal-open">
      <div class="modal-box max-w-sm">
        <h3 class="font-bold text-lg mb-4">Confirm Logout</h3>
        <p class="py-4">This will end your current session and require you to log in again. Are you sure you want to logout?</p>
        <div class="modal-action">
          <button class="btn" onclick={cancelLogout}>Cancel</button>
          <button class="btn btn-error" onclick={confirmLogout}>Logout</button>
        </div>
      </div>
    </div>
  {/if}
</div>