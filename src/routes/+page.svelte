<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { gotoApp } from '$lib/navigation';
	import { getAuthContext } from '$lib/auth-context';
	import { auth, publicStatus } from '$lib/api';
	import { logoutAlert, minimizeToTray, closeToTray } from '$lib/stores';
	import LoginSettingsModal from '$lib/LoginSettingsModal.svelte';
	import { network } from '$lib/network';
	import BrandMark from '$lib/BrandMark.svelte';
	import { passkeysEnabled } from '$lib/passkeyGate';
	import {
		Clock,
		ChartColumn,
		ListChecks,
		Settings,
		UserRound,
		KeyRound,
		Eye,
		EyeOff,
		LogIn,
		ShieldCheck,
		Minus,
		Minimize,
		Maximize,
		X
	} from '@jis3r/icons';

	// Get auth context
	const authStore: any = getAuthContext();

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
	let registrationEnabled = $state(true);
	let registrationStatusLoaded = $state(false);

	// Form fields
	let username = $state('');
	let password = $state('');
	let firstName = $state('');
	let lastName = $state('');
	let confirmPassword = $state('');
	let email = $state(''); // Added for email validation support
	let passkeyLoading = $state(false);

	// TEMPORARY (custom-domain move): WebAuthn ceremonies fail in browsers
	// until the backend RP ID migration happens. Gray out passkey sign-in on
	// web; the Tauri desktop shell (sync __TAURI_* detection, no flash) keeps
	// it enabled. See src/lib/passkeyGate.ts to re-enable.
	const passkeysAvailable = passkeysEnabled();

	// Validation state
	let validationErrors = $state<{ [key: string]: string }>({});

	// --- Tauri window chrome (login page renders outside the app layout, so the
	// Navbar's drag region + window controls are not mounted here; on Windows the
	// window has no native decorations, so the login page must provide its own).
	let isTauri = $state(false);
	let useCustomTitlebar = $state(false);
	let appWindow: any = null;
	let isMaximized = $state(false);
	let unlistenResize: (() => void) | null = null;

	let minimizeToTrayValue = $state(false);
	let closeToTrayValue = $state(false);
	const unsubscribeMin = minimizeToTray.subscribe((v: boolean) => {
		minimizeToTrayValue = v;
	});
	const unsubscribeClose = closeToTray.subscribe((v: boolean) => {
		closeToTrayValue = v;
	});

	onDestroy(() => {
		unsubscribeMin();
		unsubscribeClose();
		if (unlistenResize) unlistenResize();
	});

	// Only Windows uses the frontend-drawn titlebar (decorations:false); macOS
	// and Linux keep the native OS-drawn chrome, so no custom controls there.
	async function initTauriWindowChrome() {
		try {
			if (!('__TAURI_INTERNALS__' in window)) return; // plain browser
			const { getCurrentWindow } = await import('@tauri-apps/api/window');
			appWindow = getCurrentWindow();
			isTauri = true;

			try {
				const os = await import('@tauri-apps/plugin-os');
				useCustomTitlebar = os.platform() === 'windows';
			} catch {
				useCustomTitlebar = true; // safe fallback: webview chrome was configured
			}

			if (useCustomTitlebar) {
				isMaximized = await appWindow.isMaximized();
				unlistenResize = await appWindow.listen('tauri://resize', async () => {
					isMaximized = await appWindow?.isMaximized();
				});
			}
		} catch (err) {
			console.error('Login: Tauri window init failed:', err);
			isTauri = false;
		}
	}

	function minimize() {
		if (minimizeToTrayValue) {
			appWindow?.hide();
		} else {
			appWindow?.minimize();
		}
	}

	async function toggleMaximize() {
		await appWindow?.toggleMaximize();
		isMaximized = await appWindow?.isMaximized();
	}

	function close() {
		if (closeToTrayValue) {
			appWindow?.hide();
		} else {
			appWindow?.close();
		}
	}

	// Drag: only when not grabbing an interactive element (buttons, inputs).
	async function handleBarMouseDown(event: MouseEvent) {
		if (!useCustomTitlebar) return;
		if (event.button !== 0) return;
		const target = event.target as HTMLElement;
		if (target.closest('button, a, input, select, [role="img"], .window-controls')) return;
		try {
			await appWindow?.startDragging();
		} catch (err) {
			console.error('Failed to start dragging:', err);
		}
	}

	async function handleBarDoubleClick(event: MouseEvent) {
		if (!useCustomTitlebar) return;
		const target = event.target as HTMLElement;
		if (target.closest('button, a, input, select, .window-controls')) return;
		try {
			await toggleMaximize();
		} catch (err) {
			console.error('Failed to toggle maximize:', err);
		}
	}

	onMount(async () => {
		authStore.clearError();

		// Window chrome must be up even while the auth check runs, so the user
		// can always move/minimize/close the window (Windows decorations:false).
		// Fire it in parallel — it resolves as soon as the platform is detected.
		const chromeInit = initTauriWindowChrome();

		await Promise.all([checkExistingAuth(), loadRegistrationAvailability()]);
		// Always reset isCheckingAuth when checkExistingAuth completes
		// The function handles all auth states internally
		isCheckingAuth = false;

		await chromeInit;
	});

	async function loadRegistrationAvailability() {
		try {
			const result = await publicStatus.getRegistrationStatus();
			registrationEnabled = result.public_registration;
		} catch (err: any) {
			// Keep signup available if the status can't be loaded; the backend still enforces the source of truth.
			console.warn('Failed to load public registration status:', err);
			registrationEnabled = true;
		} finally {
			registrationStatusLoaded = true;
			if (!registrationEnabled) {
				isLogin = true;
			}
		}
	}

	// Check for existing authentication token with offline support
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

			// Use the new offline-aware auth check
			return await authStore.checkAuthOffline();
		} catch (error: any) {
			console.log('Auth check failed:', error.message);
			return false;
		}
	}

	// Dismiss logout alert
	function dismissAlert() {
		logoutAlert.set({ show: false, message: '' });
	}

	// Validate form inputs
	function validateForm(): boolean {
		const errors: { [key: string]: string } = {};

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
			validationErrors = { ...validationErrors };
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
			let result;

			if (isLogin) {
				result = await authStore.login(username, password, rememberMe);
				if (result.success) {
					gotoApp('/dashboard');
				}
			} else {
				result = await authStore.register(username, password, firstName, lastName);
				if (result.success) {
					gotoApp('/dashboard');
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
		if (isLogin && !registrationEnabled) {
			return;
		}
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

	// Handle passkey login
	async function handlePasskeyLogin() {
		if (!passkeysAvailable) {
			error = 'Passkey sign-in is temporarily unavailable on web. Please sign in with your password.';
			return;
		}
		if (!username.trim()) {
			error = 'Please enter your username to sign in with a passkey';
			return;
		}

		passkeyLoading = true;
		error = '';

		try {
			const result = await authStore.loginWithPasskey(username, rememberMe);
			if (result.success) {
				gotoApp('/dashboard');
			} else if (!result.success) {
				error = result.error || 'Passkey login failed';
			}
		} catch (err: any) {
			error = 'Passkey authentication failed. Please try again.';
			console.error('Passkey auth error:', err);
		} finally {
			passkeyLoading = false;
		}
	}
</script>	{#if isCheckingAuth}
	<!-- Checking saved session -->
	<div class="flex min-h-screen items-center justify-center p-4 {useCustomTitlebar
		? 'pt-14'
		: ''}">
		<div
			class="w-full max-w-sm rounded-2xl border border-base-300/60 bg-base-100/70 p-10 text-center shadow-2xl backdrop-blur-xl"
		>
			<div class="mx-auto flex h-14 w-14 items-center justify-center">
				<BrandMark size={56} />
			</div>
			<div class="mt-6 flex items-center justify-center gap-2">
				<span class="loading loading-spinner loading-sm text-primary"></span>
				<p class="font-semibold">Checking authentication…</p>
			</div>
			<p class="mt-1 text-sm text-base-content/60">{authStatus}</p>
		</div>
	</div>	{:else if !$network.isOnline}
	<!-- No Internet Connection Screen -->
	<div class="flex min-h-screen items-center justify-center p-4 {useCustomTitlebar
		? 'pt-14'
		: ''}">
		<div
			class="w-full max-w-md rounded-2xl border border-base-300/60 bg-base-100/70 p-8 shadow-2xl backdrop-blur-xl"
		>
			<div class="flex flex-col items-center text-center">
				<!-- Offline Icon -->
				<div class="avatar placeholder">
					<div class="bg-warning text-warning-content rounded-2xl w-20 h-20">
						<svg class="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M18.364 5.636a9 9 0 010 12.728m0 0l-2.829-2.829m2.829 2.829L21 21M15.536 8.464a5 5 0 010 7.072m0 0l-2.829-2.829m-4.243 2.829a4.978 4.978 0 01-1.414-2.83m-1.414 5.658a9 9 0 01-2.167-9.238m7.824 2.167a1 1 0 111.414 1.414m-1.414-1.414L3 3m8.293 8.293l1.414 1.414"
							></path>
						</svg>
					</div>
				</div>

				<!-- Title -->
				<h2 class="text-2xl font-bold mt-5">No Internet Connection</h2>

				<!-- Check if we have cached data to continue offline -->
				{#if hasStoredToken}
					<!-- Message -->
					<p class="text-base-content/70 mt-2 text-sm">
						You're offline but have cached session data available.
					</p>

					<!-- Continue Offline Button -->
					<button class="btn btn-primary mt-6 w-full" onclick={() => authStore.checkAuthOffline()}>
						<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"
							></path>
						</svg>
						Continue Offline
					</button>

					<div class="divider">OR</div>
				{:else}
					<!-- Message -->
					<p class="text-base-content/70 mt-2 text-sm">
						It looks like you're offline. Please check your internet connection and try again.
					</p>
				{/if}

				<!-- Status Indicator -->
				<div
					class="flex w-full items-center gap-2 rounded-xl border border-info/20 bg-info/10 px-4 py-3 text-sm text-info-content"
				>
					<svg class="h-5 w-5 shrink-0 stroke-current" fill="none" viewBox="0 0 24 24">
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
						></path>
					</svg>
					<span>Waiting for connection...</span>
				</div>

				<!-- Retry Button -->
				<button class="btn btn-outline mt-4 w-full" onclick={() => window.location.reload()}>
					<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
						></path>
					</svg>
					Retry Connection
				</button>
			</div>
		</div>
	</div>	{:else}
	<!-- Authentication -->
	<div class="flex min-h-screen items-center justify-center p-4 lg:p-6 {useCustomTitlebar
		? 'pt-14'
		: ''}">
		<div
			class="w-full max-w-4xl overflow-hidden rounded-2xl border border-base-300/60 bg-base-100/70 shadow-2xl backdrop-blur-xl"
		>
			<div class="grid lg:grid-cols-2">
				<!-- Brand panel (desktop only) -->
				<div
					class="hidden flex-col justify-between border-r border-base-300/60 bg-base-200/40 p-10 lg:flex"
				>
					<!-- Brand -->
					<div class="flex items-center gap-3">
						<div class="flex h-11 w-11 shrink-0 items-center justify-center">
							<BrandMark size={44} />
						</div>
						<div>
							<p class="text-lg font-bold tracking-tight">Time Tracker</p>
							<p class="text-xs text-base-content/50">Know where your time goes</p>
						</div>
					</div>

					<!-- Pitch + features -->
					<div>
						<h2 class="text-3xl font-bold leading-tight">
							Every minute,
							<br />
							<span class="text-primary">counted.</span>
						</h2>
						<p class="mt-3 text-sm text-base-content/70">
							Track work, projects and tags — then turn it into insight.
						</p>

						<ul class="mt-8 space-y-5">
							<li class="flex items-start gap-3">
								<span
									class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"
								>
									<Clock size={18} />
								</span>
								<div>
									<p class="text-sm font-semibold">One-click tracking</p>
									<p class="text-xs text-base-content/50">
										Start, pause and resume without losing focus
									</p>
								</div>
							</li>
							<li class="flex items-start gap-3">
								<span
									class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"
								>
									<ChartColumn size={18} />
								</span>
								<div>
									<p class="text-sm font-semibold">Insightful reports</p>
									<p class="text-xs text-base-content/50">
										Charts and trends for every project and tag
									</p>
								</div>
							</li>
							<li class="flex items-start gap-3">
								<span
									class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"
								>
									<ListChecks size={18} />
								</span>
								<div>
									<p class="text-sm font-semibold">Tags & projects</p>
									<p class="text-xs text-base-content/50">
										Organize entries your way, find anything fast
									</p>
								</div>
							</li>
						</ul>
					</div>

					<!-- Footer note -->
					<div class="flex items-center gap-2 text-xs text-base-content/50">
						<ShieldCheck size={16} />
						Your data stays on your server.
					</div>
				</div>

				<!-- Auth form panel -->
				<div class="relative p-6 sm:p-10">
					<!-- Settings Gear Icon -->
					<div class="absolute right-4 top-4">
						<button
							class="btn btn-circle btn-ghost btn-sm bg-base-200/60 hover:bg-base-300/60"
							onclick={openSettingsModal}
							title="Settings"
							aria-label="Settings"
						>
							<Settings size={18} />
						</button>
					</div>

					<!-- Compact brand (mobile only) -->
					<div class="mb-6 flex items-center gap-3 lg:hidden">
						<div class="flex h-10 w-10 shrink-0 items-center justify-center">
							<BrandMark size={40} />
						</div>
						<p class="text-lg font-bold tracking-tight">Time Tracker</p>
					</div>

					<!-- Logout Alert (shown when user is automatically logged out) -->
					{#if $logoutAlert.show}
						<div
							role="alert"
							class="mb-5 flex items-start gap-2.5 rounded-xl border border-error/20 bg-error/10 px-4 py-3"
						>
							<svg
								class="h-5 w-5 shrink-0 stroke-current text-error"
								fill="none"
								viewBox="0 0 24 24"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
								></path>
							</svg>
							<span class="text-sm">{ $logoutAlert.message }</span>
							<button class="btn btn-ghost btn-xs ml-auto" onclick={dismissAlert}>Dismiss</button>
						</div>
					{/if}

					<!-- Mode toggle -->
					<div class="mb-6 grid grid-cols-2 gap-1 rounded-xl bg-base-200/60 p-1">
						<button
							type="button"
							class="rounded-lg py-2 text-sm font-medium transition-colors {isLogin
								? 'bg-base-100 text-primary shadow-sm'
								: 'text-base-content/60 hover:text-base-content'}"
							onclick={() => {
								if (!isLogin) toggleMode();
							}}
						>
							Sign in
						</button>
						<button
							type="button"
							class="rounded-lg py-2 text-sm font-medium transition-colors {!isLogin
								? 'bg-base-100 text-primary shadow-sm'
								: 'text-base-content/60 hover:text-base-content'}"
							onclick={() => {
								if (isLogin && registrationEnabled) toggleMode();
							}}
							disabled={!registrationEnabled}
						>
							Create account
						</button>
					</div>

					<!-- Header -->
					<div class="mb-6">
						<h2 class="text-2xl font-bold tracking-tight">
							{#if isLogin}
								Welcome back
							{:else}
								Create your account
							{/if}
						</h2>
						<p class="mt-1 text-sm text-base-content/70">
							{#if isLogin}
								Sign in to continue tracking your time
							{:else}
								Start tracking your time in minutes
							{/if}
						</p>
						{#if registrationStatusLoaded && !registrationEnabled}
							<p class="mt-2 text-xs text-base-content/60">
								New user registration is currently disabled by an administrator.
							</p>
						{/if}
					</div>

					<!-- Error Alert -->
					{#if error}
						<div
							class="mb-5 flex items-start gap-2.5 rounded-xl border border-error/20 bg-error/10 px-4 py-3"
						>
							<svg
								class="h-5 w-5 shrink-0 stroke-current text-error"
								fill="none"
								viewBox="0 0 24 24"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
								></path>
							</svg>
							<span class="text-sm">{error}</span>
						</div>
					{/if}

					<!-- Form -->
					<form class="space-y-4" {onsubmit}>
						<!-- Username Field -->
						<div class="form-control">
							<label class="label" for="username">
								<span class="label-text">Username</span>
							</label>
							<div class="relative">
								<span
									class="pointer-events-none absolute inset-y-0 left-0 flex w-11 items-center justify-center text-base-content/40"
								>
									<UserRound size={18} />
								</span>
								<input
									id="username"
									bind:value={username}
									oninput={() => clearValidationError('username')}
									type="text"
									placeholder="Enter your username"
									class="input input-bordered w-full bg-base-200/50 pl-11 {validationErrors.username
										? 'input-error'
										: ''}"
									required
								/>
							</div>
							{#if validationErrors.username}
								<div class="label">
									<span class="label-text-alt text-error">{validationErrors.username}</span>
								</div>
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
										class="input input-bordered bg-base-200/50 {validationErrors.firstName
											? 'input-error'
											: ''}"
										required
									/>
									{#if validationErrors.firstName}
										<div class="label">
											<span class="label-text-alt text-error">{validationErrors.firstName}</span>
										</div>
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
										class="input input-bordered bg-base-200/50 {validationErrors.lastName
											? 'input-error'
											: ''}"
										required
									/>
									{#if validationErrors.lastName}
										<div class="label">
											<span class="label-text-alt text-error">{validationErrors.lastName}</span>
										</div>
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
								<span
									class="pointer-events-none absolute inset-y-0 left-0 flex w-11 items-center justify-center text-base-content/40"
								>
									<KeyRound size={18} />
								</span>
								<input
									id="password"
									bind:value={password}
									oninput={() => clearValidationError('password')}
									type={showPassword ? 'text' : 'password'}
									placeholder="Enter your password"
									class="input input-bordered w-full bg-base-200/50 pl-11 pr-12 {validationErrors.password
										? 'input-error'
										: ''}"
									required
								/>
								<button
									type="button"
									class="btn btn-ghost btn-xs absolute right-2 top-1/2 -translate-y-1/2"
									onclick={togglePasswordVisibility}
									title={showPassword ? 'Hide password' : 'Show password'}
								>
									{#if showPassword}
										<EyeOff size={16} />
									{:else}
										<Eye size={16} />
									{/if}
								</button>
							</div>
							{#if validationErrors.password}
								<div class="label">
									<span class="label-text-alt text-error">{validationErrors.password}</span>
								</div>
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
									class="input input-bordered bg-base-200/50 {validationErrors.confirmPassword
										? 'input-error'
										: ''}"
									required
								/>
								{#if validationErrors.confirmPassword}
									<div class="label">
										<span class="label-text-alt text-error">{validationErrors.confirmPassword}</span>
									</div>
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
						<div class="form-control pt-2">
							<button
								type="submit"
								class="btn btn-primary w-full gap-2"
								disabled={loading || (!isLogin && !registrationEnabled)}
							>
								{#if loading}
									<span class="loading loading-spinner loading-sm"></span>
									Processing...
								{:else if isLogin}
									<LogIn size={18} />
									Sign In
								{:else}
									Create Account
								{/if}
							</button>
							{#if loading}
								<p class="mt-3 text-center text-sm text-base-content/60">
									Verifying credentials — this can take a few seconds…
								</p>
							{/if}
						</div>

						<!-- Passkey Login (Login only) -->
						{#if isLogin}
							<div class="form-control">
								<button
									type="button"
									class="btn btn-outline btn-primary w-full gap-2"
									disabled={passkeyLoading || loading || !passkeysAvailable}
									title={passkeysAvailable
										? 'Sign in with your passkey'
										: 'Passkey sign-in is temporarily unavailable on web — please use your password'}
									onclick={handlePasskeyLogin}
								>
									{#if passkeyLoading}
										<span class="loading loading-spinner loading-sm"></span>
										Authenticating...
									{:else}
										<KeyRound size={18} />
										Sign in with passkey
									{/if}
								</button>
							</div>
						{/if}
					</form>
				</div>
			</div>
		</div>
	</div>	<!-- Settings Modal -->
	{#if showSettingsModal}
		<LoginSettingsModal on:close={closeSettingsModal} />
	{/if}
{/if}

<!-- Tauri window chrome — the login page renders outside the app layout, so the
	 Navbar (which owns the drag region + window controls on Windows) is not
	 mounted here. Show a slim draggable bar with the window controls whenever
	 the window has no native decorations. The mousedown/dblclick listeners
	 drive window dragging and are deliberately not keyboard-operable — the
	 buttons inside provide the interactive surface. -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
{#if isTauri && useCustomTitlebar}
	<div
		class="fixed inset-x-0 top-0 z-[70] flex h-14 items-center justify-end gap-0.5 border-b border-base-300/60 bg-base-100/85 px-3 backdrop-blur-md"
		data-tauri-drag-region
		onmousedown={handleBarMouseDown}
		ondblclick={handleBarDoubleClick}
	>
		<div class="window-controls flex items-center gap-0.5">
			<button
				id="titlebar-minimize"
				class="flex h-8 w-8 items-center justify-center rounded-lg text-base-content/70 transition-colors hover:bg-base-200 hover:text-base-content"
				onclick={minimize}
				title="Minimize"
				aria-label="Minimize window"
			>
				<Minus size={16} />
			</button>
			<button
				id="titlebar-maximize"
				class="flex h-8 w-8 items-center justify-center rounded-lg text-base-content/70 transition-colors hover:bg-base-200 hover:text-base-content"
				onclick={toggleMaximize}
				title={isMaximized ? 'Restore' : 'Maximize'}
				aria-label={isMaximized ? 'Restore window' : 'Maximize window'}
			>
				{#if isMaximized}
					<Minimize size={16} />
				{:else}
					<Maximize size={16} />
				{/if}
			</button>
			<button
				id="titlebar-close"
				class="flex h-8 w-8 items-center justify-center rounded-lg text-base-content/70 transition-colors hover:bg-error hover:text-error-content"
				onclick={close}
				title="Close"
				aria-label="Close window"
			>
				<X size={16} />
			</button>
		</div>
	</div>
{/if}
