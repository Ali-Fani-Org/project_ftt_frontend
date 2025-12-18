<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { getAuthContext } from '$lib/auth-context';
  import { auth } from '$lib/api';
  import { logoutAlert } from '$lib/stores';
  import LoginSettingsModal from '$lib/LoginSettingsModal.svelte';

  // Form state
  let isLogin = $state(true);
  let loading = $state(false);
  let error = $state('');
  let showPassword = $state(false);
  let rememberMe = $state(true);
  let showSettingsModal = $state(false);
  let isCheckingAuth = $state(true);
  let authStatus = $state('Checking saved session...');
  let hasStoredToken = $state(false);

  // Form fields
  let username = $state('');
  let password = $state('');
  let firstName = $state('');
  let lastName = $state('');
  let confirmPassword = $state('');
  let email = $state(''); // Added for email validation support

  // Validation state
  let validationErrors = $state<{[key: string]: string}>({});

  onMount(async () => {
    getAuthContext().clearError();
    const redirected = await checkExistingAuth();
    if (!redirected) {
      isCheckingAuth = false;
    }
  });

  // Check for existing authentication token
  async function checkExistingAuth(): Promise<boolean> {
    try {
      authStatus = 'Checking saved session...';
      hasStoredToken =
        typeof localStorage !== 'undefined' &&
        !!(localStorage.getItem('authToken') || sessionStorage.getItem('auth_token'));

      if (!hasStoredToken) {
        authStatus = 'No saved session found';
        return false;
      }

      authStatus = 'Validating token...';

      // Race auth check against a short timeout to avoid long hangs
      const userData = await Promise.race([
        auth.getUser(),
        new Promise<null>((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000)),
      ]);

      if (userData) {
        authStatus = 'Authenticated, redirecting...';
        goto('/dashboard');
        return true;
      }

      authStatus = 'Session invalid, please sign in';
      return false;
    } catch (error: any) {
      if (error.message === 'timeout') {
        authStatus = 'Auth check timed out, please sign in';
      } else if (error.response?.status === 401) {
        getAuthContext().logout();
        authStatus = 'Session expired, please sign in';
      } else {
        authStatus = 'Auth check failed, please sign in';
      }
      console.log('Auth check failed:', error.message);
      return false;
    }
  }

  // Dismiss logout alert
  function dismissAlert() {
    logoutAlert.set({show: false, message: ''});
  }

  // Validate form inputs
  function validateForm(): boolean {
    const errors: {[key: string]: string} = {};

    if (!username.trim()) {
      errors.username = 'Username is required';
    } else if (username.length < 3) {
      errors.username = 'Username must be at least 3 characters';
    }

    if (!password) {
      errors.password = 'Password is required';
    }

    if (!isLogin) {
      if (!firstName.trim()) {
        errors.firstName = 'First name is required';
      }
      if (!lastName.trim()) {
        errors.lastName = 'Last name is required';
      }
      if (!confirmPassword) {
        errors.confirmPassword = 'Please confirm your password';
      } else if (password !== confirmPassword) {
        errors.confirmPassword = 'Passwords do not match';
      }
    }

    validationErrors = errors;
    return Object.keys(errors).length === 0;
  }

  // Clear validation errors when user types
  function clearValidationError(field: string) {
    if (validationErrors[field]) {
      validationErrors = {...validationErrors};
      delete validationErrors[field];
    }
  }

  // Handle form submission
  const onsubmit = async (event: Event) => {
    event.preventDefault();

    if (!validateForm()) {
      return;
    }

    loading = true;
    error = '';
    validationErrors = {}; // Clear any previous validation errors

    try {
      let result:
        | { success: true }
        | { success: false; error?: string; validationErrors?: Record<string, string> };

      if (isLogin) {
        result = await getAuthContext().login(username, password, rememberMe);
        if (result.success) {
          goto('/dashboard');
        }
      } else {
        result = await getAuthContext().register(username, password, firstName, lastName);
        if (result.success) {
          goto('/dashboard');
        }
      }

      if (!result.success) {
        // Handle server-side validation errors
        if (result.validationErrors) {
          validationErrors = result.validationErrors;
        } else {
          error = result.error || 'Authentication failed';
        }
      }
    } catch (err: any) {
      error = 'An unexpected error occurred. Please try again.';
      console.error('Auth error:', err);
    } finally {
      loading = false;
    }
  };

  // Toggle between login and register
  function toggleMode() {
    isLogin = !isLogin;
    error = '';
    validationErrors = {};
    // Clear form fields when switching modes
    password = '';
    confirmPassword = '';
  }

  // Toggle password visibility
  function togglePasswordVisibility() {
    showPassword = !showPassword;
  }

  // Open settings modal
  function openSettingsModal() {
    showSettingsModal = true;
  }

  // Close settings modal
  function closeSettingsModal() {
    showSettingsModal = false;
  }
</script>

{#if isCheckingAuth}
  <div class="hero bg-base-200 min-h-screen">
    <div class="hero-content">
      <div class="text-center space-y-4">
        <span class="loading loading-spinner loading-lg text-primary"></span>
        <div>
          <p class="font-semibold">Checking authentication…</p>
          <p class="text-sm text-base-content/70">{authStatus}</p>
        </div>
      </div>
    </div>
  </div>
{:else}
  <div class="hero bg-base-200 min-h-screen">
    <div class="hero-content flex-col lg:flex-row-reverse">
      <div class="text-center lg:text-left">
        <h1 class="text-5xl font-bold text-primary">Time Tracker</h1>
        <p class="py-6 text-lg">Track your time efficiently and boost your productivity.</p>

        {#if isLogin}
          <div class="hidden lg:block">
            <div class="stats shadow bg-base-100">
              <div class="stat">
                <div class="stat-figure text-primary">
                  <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                  </svg>
                </div>
                <div class="stat-title">Track Time</div>
                <div class="stat-value text-primary">Efficiently</div>
                <div class="stat-desc">Organize your daily activities</div>
              </div>

              <div class="stat">
                <div class="stat-figure text-secondary">
                  <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path>
                  </svg>
                </div>
                <div class="stat-title">Analytics</div>
                <div class="stat-value text-secondary">Insights</div>
                <div class="stat-desc">Understand your patterns</div>
              </div>
            </div>
          </div>
        {:else}
          <div class="hidden lg:block text-center">
            <div class="avatar placeholder mb-4">
              <div class="bg-primary text-primary-content rounded-full w-24">
                <svg class="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"></path>
                </svg>
              </div>
            </div>
            <p class="text-lg">Join us and start tracking your productivity today!</p>
          </div>
        {/if}
      </div>

      <!-- Authentication Card -->
      <div class="card bg-base-100 w-full max-w-md shadow-2xl relative">
        <!-- Settings Gear Icon -->
        <div class="absolute top-4 right-4">
          <button
            class="btn btn-ghost btn-sm"
            onclick={openSettingsModal}
            title="Settings"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path>
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path>
            </svg>
          </button>
        </div>

        <div class="card-body">
          <!-- Logout Alert (shown when user is automatically logged out) -->
          {#if $logoutAlert.show}
            <div role="alert" class="alert alert-error mb-4">
              <svg class="h-6 w-6 shrink-0 stroke-current" fill="none" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
              </svg>
              <span>{$logoutAlert.message}</span>
              <button class="btn btn-sm btn-ghost" onclick={dismissAlert}>Dismiss</button>
            </div>
          {/if}

          <!-- Header -->
          <div class="text-center mb-6">
            <h2 class="card-title justify-center text-2xl">
              {#if isLogin}
                Welcome Back
              {:else}
                Create Account
              {/if}
            </h2>
            <p class="text-base-content/70">
              {#if isLogin}
                Sign in to your account to continue
              {:else}
                Create a new account to get started
              {/if}
            </p>
          </div>

          <!-- Error Alert -->
          {#if error}
            <div class="alert alert-error">
              <svg class="w-6 h-6 stroke-current shrink-0" fill="none" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
              </svg>
              <span>{error}</span>
            </div>
          {/if}

          <!-- Form -->
          <form class="space-y-4" {onsubmit}>
            <!-- Username Field -->
            <div class="form-control">
              <label class="label" for="username">
                <span class="label-text">Username</span>
              </label>
              <input
                id="username"
                bind:value={username}
                oninput={() => clearValidationError('username')}
                type="text"
                placeholder="Enter your username"
                class="input input-bordered {validationErrors.username ? 'input-error' : ''}"
                required
              />
              {#if validationErrors.username}
                <label class="label">
                  <span class="label-text-alt text-error">{validationErrors.username}</span>
                </label>
              {/if}
            </div>

            <!-- Name Fields (Register only) -->
            {#if !isLogin}
              <div class="grid grid-cols-2 gap-4">
                <div class="form-control">
                  <label class="label" for="firstName">
                    <span class="label-text">First Name</span>
                  </label>
                  <input
                    id="firstName"
                    bind:value={firstName}
                    oninput={() => clearValidationError('firstName')}
                    type="text"
                    placeholder="First name"
                    class="input input-bordered {validationErrors.firstName ? 'input-error' : ''}"
                    required
                  />
                  {#if validationErrors.firstName}
                    <label class="label">
                      <span class="label-text-alt text-error">{validationErrors.firstName}</span>
                    </label>
                  {/if}
                </div>

                <div class="form-control">
                  <label class="label" for="lastName">
                    <span class="label-text">Last Name</span>
                  </label>
                  <input
                    id="lastName"
                    bind:value={lastName}
                    oninput={() => clearValidationError('lastName')}
                    type="text"
                    placeholder="Last name"
                    class="input input-bordered {validationErrors.lastName ? 'input-error' : ''}"
                    required
                  />
                  {#if validationErrors.lastName}
                    <label class="label">
                      <span class="label-text-alt text-error">{validationErrors.lastName}</span>
                    </label>
                  {/if}
                </div>
              </div>
            {/if}

            <!-- Password Field -->
            <div class="form-control">
              <label class="label" for="password">
                <span class="label-text">Password</span>
              </label>
              <div class="relative">
                <input
                  id="password"
                  bind:value={password}
                  oninput={() => clearValidationError('password')}
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Enter your password"
                  class="input input-bordered w-full pr-12 {validationErrors.password ? 'input-error' : ''}"
                  required
                />
                <button
                  type="button"
                  class="absolute right-3 top-1/2 transform -translate-y-1/2 btn btn-ghost btn-xs"
                  onclick={togglePasswordVisibility}
                >
                  {#if showPassword}
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21"></path>
                    </svg>
                  {:else}
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path>
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path>
                    </svg>
                  {/if}
                </button>
              </div>
              {#if validationErrors.password}
                <label class="label">
                  <span class="label-text-alt text-error">{validationErrors.password}</span>
                </label>
              {/if}
            </div>

            <!-- Confirm Password Field (Register only) -->
            {#if !isLogin}
              <div class="form-control">
                <label class="label" for="confirmPassword">
                  <span class="label-text">Confirm Password</span>
                </label>
                <input
                  id="confirmPassword"
                  bind:value={confirmPassword}
                  oninput={() => clearValidationError('confirmPassword')}
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Confirm your password"
                  class="input input-bordered {validationErrors.confirmPassword ? 'input-error' : ''}"
                  required
                />
                {#if validationErrors.confirmPassword}
                  <label class="label">
                    <span class="label-text-alt text-error">{validationErrors.confirmPassword}</span>
                  </label>
                {/if}
              </div>
            {/if}

            <!-- Remember Me (Login only) -->
            {#if isLogin}
              <div class="form-control">
                <label class="label cursor-pointer justify-start">
                  <input
                    type="checkbox"
                    bind:checked={rememberMe}
                    class="checkbox checkbox-primary mr-3"
                  />
                  <span class="label-text">Remember me</span>
                </label>
              </div>
            {/if}

            <!-- Submit Button -->
            <div class="form-control mt-6">
              <button
                type="submit"
                class="btn btn-primary"
                disabled={loading}
              >
                {#if loading}
                  <span class="loading loading-spinner"></span>
                  Processing...
                {:else if isLogin}
                  Sign In
                {:else}
                  Create Account
                {/if}
              </button>
            </div>
          </form>

          <!-- Toggle Mode -->
          <div class="divider">OR</div>

          <div class="text-center">
            <p class="text-sm text-base-content/70">
              {#if isLogin}
                Don't have an account?
              {:else}
                Already have an account?
              {/if}
            </p>
            <button
              type="button"
              class="btn btn-ghost btn-sm mt-2"
              onclick={toggleMode}
              disabled={loading}
            >
              {#if isLogin}
                Create new account
              {:else}
                Sign in instead
              {/if}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- Settings Modal -->
  {#if showSettingsModal}
    <LoginSettingsModal on:close={closeSettingsModal} />
  {/if}
{/if}
