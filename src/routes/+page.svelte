<script lang="ts">
   import { onMount } from 'svelte';
   import { get } from 'svelte/store';
   import { goto } from '$app/navigation';
   import { authToken, user, showSettings } from '$lib/stores';
   import { auth } from '$lib/api';
   import { preventDefault } from '$lib/commands.svelte';

  let username = '';
  let password = '';
  let loading = false;
  let error = '';

  onMount(() => {
    const token = get(authToken);
    if (token) {
      goto('/dashboard');
    }
  });

  const onsubmit = preventDefault(async () => {
    loading = true;
    error = '';
    try {
      const token = await auth.login(username, password);
      authToken.set(token);
      const userData = await auth.getUser();
      user.set(userData);
      goto('/dashboard');
    } catch (err) {
      error = 'Login failed. Please check your credentials.';
    } finally {
      loading = false;
    }
  });
</script>

<div class="hero bg-base-200 min-h-screen relative">
   <button class="btn btn-ghost absolute top-4 right-4" onclick={() => showSettings.set(true)} aria-label="Settings">
     <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
       <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path>
       <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path>
     </svg>
   </button>
   <div class="hero-content flex-col lg:flex-row-reverse">
     <div class="text-center lg:text-left">
       <h1 class="text-5xl font-bold">Time Tracker</h1>
       <p class="py-6">Login to start tracking your time.</p>
     </div>
    <div class="card bg-base-100 w-full max-w-sm shrink-0 shadow-2xl">
      <form class="card-body" {onsubmit}>
        {#if error}
          <div class="alert alert-error">
            <span>{error}</span>
          </div>
        {/if}
        <div class="form-control">
          <label class="label" for="username">
            <span class="label-text">Username</span>
          </label>
          <input
            id="username"
            bind:value={username}
            type="text"
            placeholder="username"
            class="input input-bordered"
            required
          />
        </div>
        <div class="form-control">
          <label class="label" for="password">
            <span class="label-text">Password</span>
          </label>
          <input
            id="password"
            bind:value={password}
            type="password"
            placeholder="password"
            class="input input-bordered"
            required
          />
        </div>
        <div class="form-control mt-6">
          <button class="btn btn-primary" disabled={loading}>
            {#if loading}
              <span class="loading loading-spinner"></span>
            {/if}
            Login
          </button>
        </div>
      </form>
    </div>
  </div>
</div>
