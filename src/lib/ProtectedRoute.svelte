<script lang="ts">
  import { onMount } from 'svelte';
  import { authToken } from './stores';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';

  interface Props {
    children: import('svelte').Snippet;
    fallback?: import('svelte').Snippet;
    redirectTo?: string;
  }

  let { 
    children, 
    fallback, 
    redirectTo = '/' 
  }: Props = $props();

  // Get current authentication state
  let isAuthenticated = $state(false);
  let isChecking = $state(true);

  onMount(() => {
    // Subscribe to auth token changes
    const unsubscribe = authToken.subscribe(token => {
      isAuthenticated = !!token;
      isChecking = false;
      
      // Redirect if not authenticated and we're on a protected route
      if (!isAuthenticated && $page.url.pathname !== redirectTo) {
        goto(redirectTo);
      }
    });

    return unsubscribe;
  });
</script>

{#if isChecking}
  <!-- Show loading while checking auth status -->
  <div class="min-h-screen flex items-center justify-center bg-base-200">
    <div class="text-center">
      <span class="loading loading-spinner loading-lg text-primary"></span>
      <p class="mt-4 text-base-content/70">Checking authentication...</p>
    </div>
  </div>
{:else if isAuthenticated}
  <!-- Show content if authenticated -->
  {@render children()}
{:else if fallback}
  <!-- Show fallback if provided -->
  {@render fallback()}
{:else}
  <!-- Default: redirect will be handled by goto in onMount -->
  <div class="min-h-screen flex items-center justify-center bg-base-200">
    <div class="text-center">
      <p class="text-base-content/70">Redirecting to login...</p>
    </div>
  </div>
{/if}