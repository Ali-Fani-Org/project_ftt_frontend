<script lang="ts">
  import { Clock, BarChart3, FileText, Settings, Sun, Moon, LogOut } from '@lucide/svelte';
  import { user, logout, theme } from '$lib/stores';
  import { getAuthContext } from './auth-context';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { get } from 'svelte/store';
  import { onMount } from 'svelte';
  import { generateDicebearAvatar } from './utils';

  // Get auth context
  const authStore: any = getAuthContext();

  // Date/time state
  let currentTime = $state(new Date());
  let currentDate = $state('');

  // Easter egg state
  let isAltPressed = $state(false);
  let isHoveringAvatar = $state(false);
  let showEasterEgg = $state(false);

  // Update time every second
  onMount(() => {
    const updateDateTime = () => {
      const now = new Date();
      currentTime = now;
      
      // Format date for Iran timezone
      const dateOptions: Intl.DateTimeFormatOptions = {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        timeZone: 'Asia/Tehran'
      };
      
      currentDate = now.toLocaleDateString('en-US', dateOptions);
    };

    updateDateTime();
    const timer = setInterval(updateDateTime, 1000);
    
    // Keyboard event listeners for Alt key easter egg
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Alt') {
        isAltPressed = true;
        updateEasterEggState();
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.key === 'Alt') {
        isAltPressed = false;
        updateEasterEggState();
      }
    };

    // Add event listeners
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('keyup', handleKeyUp);
    
    return () => {
      clearInterval(timer);
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('keyup', handleKeyUp);
    };
  });

  // Update easter egg visibility based on Alt key and hover state
  function updateEasterEggState() {
    showEasterEgg = isAltPressed && isHoveringAvatar;
  }

  // Theme toggle function
  function toggleTheme() {
    const currentTheme = get(theme);
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    theme.set(newTheme);
  }

  // Format time for Iran timezone
  function formatTime(date: Date): string {
    const timeOptions: Intl.DateTimeFormatOptions = {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
      timeZone: 'Asia/Tehran'
    };
    
    return date.toLocaleTimeString('en-US', timeOptions);
  }

  // Get timezone abbreviation
  function getTimezoneAbbr(): string {
    const now = new Date();
    return now.toLocaleTimeString('en-US', { timeZoneName: 'short', timeZone: 'Asia/Tehran' }).split(' ').pop() || 'IRST';
  }

  // Navigation items
  const navItems = [
    { 
      name: 'Timer', 
      href: '/timer', 
      icon: Clock 
    },
    { 
      name: 'Dashboard', 
      href: '/dashboard', 
      icon: BarChart3 
    },
    { 
      name: 'Entries', 
      href: '/entries', 
      icon: FileText 
    },
    { 
      name: 'Settings', 
      href: '/settings', 
      icon: Settings 
    }
  ];

  let currentPath = $derived($page.url.pathname);

  function navigate(href: string) {
    goto(href);
    // Drawer will automatically close on mobile after navigation due to the overlay click
  }

  function handleLogout() {
    authStore.logout();
  }

  // Generate Dicebear avatar SVG for user with theme-aware background
  function getUserAvatar() {
    const currentUser = get(user);
    const currentTheme = get(theme);
    if (currentUser?.username) {
      return generateDicebearAvatar(currentUser.username, currentTheme);
    }
    return generateDicebearAvatar('user', currentTheme);
  }

  // Handle avatar hover events for easter egg
  function handleAvatarMouseEnter() {
    isHoveringAvatar = true;
    updateEasterEggState();
  }

  function handleAvatarMouseLeave() {
    isHoveringAvatar = false;
    updateEasterEggState();
  }

  // Get user display name for upper section (first + last, or username if missing)
  function getUserDisplayName() {
    const currentUser = get(user);
    if (currentUser?.first_name && currentUser?.last_name) {
      return `${currentUser.first_name} ${currentUser.last_name}`;
    }
    return currentUser?.username || 'User';
  }

  // Get username for bottom section
  function getUsername() {
    const currentUser = get(user);
    return currentUser?.username || 'user@example.com';
  }
</script>

<!-- Drawer side content -->
<div class="drawer-side">
  <!-- Overlay for closing drawer -->
  <label for="app-drawer" aria-label="close sidebar" class="drawer-overlay"></label>
  
  <!-- Sidebar content with proper width -->
  <div class="flex min-h-full w-80 flex-col items-start bg-base-200 transition-all duration-300">
    <!-- Sidebar header with app name -->
    <div class="p-4 border-b border-base-300 w-full">
      <h2 class="text-xl font-bold text-primary">Time Tracker</h2>
    </div>
    
    <!-- Navigation -->
    <ul class="menu w-full grow p-2 space-y-1">
      {#each navItems as item}
        <li>
          <button
            class="flex items-center space-x-3 rounded-lg transition-colors {currentPath === item.href ? 'bg-primary text-primary-content' : 'hover:bg-base-300'}"
            onclick={() => navigate(item.href)}
            title={currentPath === item.href ? '' : item.name}
          >
            <svelte:component this={item.icon} class="w-5 h-5 flex-shrink-0" />
            <span class="font-medium">{item.name}</span>
          </button>
        </li>
      {/each}
    </ul>

    <!-- User profile section at bottom -->
    <div class="p-4 border-t border-base-300 bg-base-200 w-full">
      <!-- Date/Time widget -->
      <div class="mb-3 flex flex-col items-start text-xs text-base-content/70">
        <span class="font-medium">{currentDate}</span>
        <span class="font-mono">{formatTime(currentTime)} {getTimezoneAbbr()}</span>
      </div>

      <div class="flex items-center space-x-3 mb-3">
        <!-- User Avatar with Easter Egg -->
        <div class="avatar placeholder relative">
          {#if $user?.profile_image}
            <div class="bg-neutral text-neutral-content rounded-full w-10 h-10">
              <img 
                src={$user.profile_image} 
                alt="Profile" 
                class="rounded-full w-10 h-10 object-cover transition-all duration-200 {showEasterEgg ? 'scale-[2.5] translate-x-32 -translate-y-32 z-50' : 'scale-100 translate-x-0 translate-y-0'}" 
                onmouseenter={handleAvatarMouseEnter}
                onmouseleave={handleAvatarMouseLeave}
              />
            </div>
          {:else}
            <!-- Theme-aware Dicebear Avatar with Easter Egg -->
            <div 
              class="w-10 h-10 transition-all duration-200 {showEasterEgg ? 'scale-[2.5] translate-x-32 -translate-y-32 z-50' : 'scale-100 translate-x-0 translate-y-0'}"
              onmouseenter={handleAvatarMouseEnter}
              onmouseleave={handleAvatarMouseLeave}
            >
              {@html getUserAvatar()}
            </div>
          {/if}
        </div>
        
        <!-- User Info -->
        <div class="flex-1 min-w-0">
          <div class="font-medium text-sm truncate">{getUserDisplayName()}</div>
          <div class="text-xs text-base-content/60 truncate">{getUsername()}</div>
        </div>
      </div>
      
      <!-- Theme toggle and Logout -->
      <div class="flex space-x-2">
        <button 
          class="btn btn-square btn-ghost flex-1" 
          onclick={toggleTheme}
          aria-label="Toggle theme"
          title="Toggle {get(theme) === 'dark' ? 'light' : 'dark'} mode"
        >
          {#if $theme === 'dark'}
            <Sun class="w-5 h-5" />
          {:else}
            <Moon class="w-5 h-5" />
          {/if}
        </button>

        <!-- Logout Button -->
        <button 
          class="btn btn-ghost btn-sm flex-1 justify-start text-error hover:bg-error hover:text-error-content"
          onclick={handleLogout}
        >
          <LogOut class="w-4 h-4 mr-2" />
          Logout
        </button>
      </div>
    </div>
  </div>
</div>

<style>
  /* Ensure drawer side is properly positioned */
  .drawer-side {
    z-index: 30;
  }
  
  /* Style the Dicebear SVG avatar */
  .avatar :global(svg) {
    border-radius: 50%;
    overflow: hidden;
  }

  /* Easter egg styling - bigger scale with much more dramatic movement */
  .scale-\[2\.5\] {
    transform: scale(2.5);
    z-index: 50;
  }

  /* Smooth transitions for easter egg including movement */
  .transition-all {
    transition-property: transform;
    transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
    transition-duration: 200ms;
  }
</style>