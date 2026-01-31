<script lang="ts">
	import {
		Clock,
		BarChart3,
		FileText,
		Settings,
		Sun,
		Moon,
		LogOut,
		ChevronLeft,
		ChevronRight,
		Menu
	} from '@lucide/svelte';
	import { user, logout, theme, sidebarCollapsed } from '$lib/stores';
	import { getAuthContext, createAuthStore } from './auth-context';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { get } from 'svelte/store';
	import { onMount } from 'svelte';
	import { generateDicebearAvatar } from './utils';

	// Get auth context
	interface User {
		username?: string;
		first_name?: string;
		last_name?: string;
		profile_image?: string | null;
	}

	interface AuthStore {
		logout: () => void;
		initialize: () => void;
		login: (
			username: string,
			password: string,
			rememberMe?: boolean
		) => Promise<{ success: boolean; error?: string }>;
		// Add other methods as needed
	}

	const authStore = getAuthContext() as AuthStore;

	// Date/time state
	let currentTime = $state(new Date());
	let currentDate = $state('');

	// Easter egg state
	let isAltPressed = $state(false);
	let isHoveringAvatar = $state(false);
	let showEasterEgg = $state(false);

	// Sidebar state - using the new persistent store
	let isCollapsed = $state(get(sidebarCollapsed));
	let isMobile = $state(typeof window !== 'undefined' ? window.innerWidth < 768 : false);
	let effectiveCollapsed = $derived(isMobile ? false : isCollapsed);

	// Subscribe to sidebar collapsed state changes
	$effect(() => {
		const unsubscribe = sidebarCollapsed.subscribe((value: boolean) => {
			isCollapsed = value;
		});
		return unsubscribe;
	});

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

		// Check if mobile
		const checkMobile = () => {
			isMobile = window.innerWidth < 768; // md breakpoint
			// Auto-expand on mobile if collapsed
			if (isMobile && isCollapsed) {
				sidebarCollapsed.set(false);
			}
		};

		// Initial check
		checkMobile();
		window.addEventListener('resize', checkMobile);

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
			window.removeEventListener('resize', checkMobile);
			document.removeEventListener('keydown', handleKeyDown);
			document.removeEventListener('keyup', handleKeyUp);
		};
	});

	// Update easter egg visibility based on Alt key and hover state
	function updateEasterEggState() {
		showEasterEgg = isAltPressed && isHoveringAvatar;
	}

	// Sidebar toggle function
	function toggleSidebar() {
		if (isMobile) return;
		sidebarCollapsed.set(!isCollapsed);
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
		return (
			now
				.toLocaleTimeString('en-US', { timeZoneName: 'short', timeZone: 'Asia/Tehran' })
				.split(' ')
				.pop() || 'IRST'
		);
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

	// Return true if the current path represents or starts with the given href
	function normalizePath(path: string) {
		if (!path) return '/';
		return path.replace(/\/+$/, '') || '/';
	}

	function isActivePath(href: string) {
		const cp = normalizePath(currentPath || '');
		const h = normalizePath(href);
		if (cp === h) return true;
		return h !== '/' && cp.startsWith(h + '/');
	}

	function navigate(href: string) {
		if (isMobile && typeof document !== 'undefined') {
			const drawer = document.getElementById('app-drawer') as HTMLInputElement | null;
			if (drawer) drawer.checked = false;
		}
		goto(href);
		// Drawer will automatically close on mobile after navigation due to the overlay click
	}

	function handleLogout() {
		authStore.logout();
	}

	// Generate Dicebear avatar SVG for user with theme-aware background
	function getUserAvatar() {
		const currentUser = get(user) as User | null;
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

	// Get separate first and last names for line-by-line display
	function getFirstName(): string {
		const currentUser = get(user) as User | null;
		return currentUser?.first_name || '';
	}

	function getLastName(): string {
		const currentUser = get(user) as User | null;
		return currentUser?.last_name || '';
	}

	// Get username for bottom section (always show username)
	function getUsername(): string {
		const currentUser = get(user) as User | null;
		return currentUser?.username || '';
	}

	function navigateToProfile() {
		if (isMobile && typeof document !== 'undefined') {
			const drawer = document.getElementById('app-drawer') as HTMLInputElement | null;
			if (drawer) drawer.checked = false;
		}
		goto('/profile');
	}
</script>

<!-- Drawer side content -->
<div class="drawer-side">
	<!-- Overlay for closing drawer -->
	<label for="app-drawer" aria-label="close sidebar" class="drawer-overlay"></label>

	<!-- Sidebar content with dynamic width -->
	<div
		class="flex min-h-full flex-col items-start bg-base-200 transition-all duration-300 ease-in-out {effectiveCollapsed
			? 'w-16'
			: 'w-80'}"
	>
		<!-- Sidebar header with app name and toggle button -->
		<div
			class="p-4 border-b border-base-300 w-full flex items-center {effectiveCollapsed
				? 'justify-center'
				: 'justify-between'}"
		>
			{#if !effectiveCollapsed}
				<h2 class="text-xl font-bold text-primary truncate">Time Tracker</h2>
			{/if}

			<!-- Toggle button (hidden on mobile) -->
			{#if !isMobile}
				<button
					class="btn btn-ghost {effectiveCollapsed ? 'mx-auto' : ''}"
					onclick={toggleSidebar}
					title={effectiveCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
					aria-label={effectiveCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
				>
					{#if effectiveCollapsed}
						<Menu class="w-4 h-4" />
					{:else}
						<ChevronLeft class="w-4 h-4" />
					{/if}
				</button>
			{/if}
		</div>

		<!-- Navigation -->
		<ul class="menu w-full grow p-2 space-y-1">
			{#each navItems as item}
				<li class="{isActivePath(item.href) ? 'active' : ''} hover:bg-transparent">
					<!--
            Important: don't set hover styles on already-selected nav items.
            When an item is selected we apply `bg-primary text-primary-content`,
            and hover classes like `hover:bg-base-300` will override that on hover
            and break the visual theme. We only apply the hover effect for
            non-selected items below.
          -->
					<button
						aria-current={isActivePath(item.href) ? 'page' : undefined}
						class="flex items-center rounded-lg transition-all duration-200 {isActivePath(item.href)
							? 'bg-primary text-primary-content hover:bg-primary hover:text-primary-content'
							: 'hover:bg-base-300'} {effectiveCollapsed
							? 'justify-center px-2 w-full'
							: 'px-3 space-x-3'}"
						onclick={() => navigate(item.href)}
						title={effectiveCollapsed ? item.name : isActivePath(item.href) ? '' : item.name}
						aria-label={item.name}
					>
						<item.icon class="w-5 h-5 flex-shrink-0" />
						{#if !effectiveCollapsed}
							<span class="font-medium truncate">{item.name}</span>
						{/if}
					</button>
				</li>
			{/each}
		</ul>

		<!-- User profile section at bottom -->
		<div class="p-4 border-t border-base-300 bg-base-200 w-full">
			{#if !effectiveCollapsed}
				<!-- User section using DaisyUI card with image on side -->
				<button
					type="button"
					class="card card-side bg-base-100 shadow-xl w-full mb-3 bg-transparent border-0 p-0"
					onclick={navigateToProfile}
					aria-label="Open profile"
				>
					<!-- User Avatar -->
					<figure>
						{#if $user?.profile_image}
							<img
								src={$user.profile_image}
								alt="Profile"
								class="rounded-full w-20 h-20 object-cover"
							/>
						{:else}
							<div class="w-20 h-20 rounded-full overflow-hidden">
								{@html getUserAvatar()}
							</div>
						{/if}
					</figure>

					<!-- User Info -->
					<div class="card-body">
						{#if getFirstName() && getLastName()}
							<h2 class="card-title text-sm font-medium">{getFirstName()} {getLastName()}</h2>
						{:else if getFirstName()}
							<h2 class="card-title text-sm font-medium">{getFirstName()}</h2>
						{:else if getLastName()}
							<h2 class="card-title text-sm font-medium">{getLastName()}</h2>
						{:else}
							<h2 class="card-title text-sm font-medium">User</h2>
						{/if}
						{#if getUsername()}
							<p class="card-title text-xs text-base-content/60">{getUsername()}</p>
						{/if}
					</div>
				</button>

				<!-- Expanded: Horizontal layout -->
				<!-- Removed duplicated theme/logout buttons per UX request -->
				<!-- User section -->

				<!-- Expanded: Horizontal layout -->
				<!-- Removed duplicated theme/logout buttons per UX request -->
				<!-- Date/Time widget - hidden when collapsed -->
				<!-- <div class="mb-3 flex flex-col items-start text-xs text-base-content/70">
          <span class="font-medium">{currentDate}</span>
          <span class="font-mono">{formatTime(currentTime)} {getTimezoneAbbr()}</span>
        </div> -->
			{:else}
				<!-- Collapsed: Compact vertical layout -->
				<button
					type="button"
					class="flex flex-col items-center space-y-3 w-full bg-transparent border-0 p-0"
					onclick={navigateToProfile}
					aria-label="Open profile"
				>
					<!-- User Avatar with Easter Egg - Smaller when collapsed -->
					<div class="avatar placeholder relative">
						{#if $user?.profile_image}
							<div class="bg-neutral text-neutral-content rounded-full w-5 h-5">
								<img
									src={$user.profile_image}
									alt="Profile"
									class="rounded-full object-cover transition-all duration-200 {showEasterEgg
										? 'scale-[3] translate-x-16 -translate-y-16 z-50'
										: 'scale-100 translate-x-0 translate-y-0'} w-5 h-5"
									onmouseenter={handleAvatarMouseEnter}
									onmouseleave={handleAvatarMouseLeave}
								/>
							</div>
						{:else}
							<!-- Theme-aware Dicebear Avatar with Easter Egg -->
							<div
								class="transition-all duration-200 {showEasterEgg
									? 'scale-[3] translate-x-16 -translate-y-16 z-50'
									: 'scale-100 translate-x-0 translate-y-0'} w-5 h-5"
								role="img"
								aria-hidden="true"
								onmouseenter={handleAvatarMouseEnter}
								onmouseleave={handleAvatarMouseLeave}
							>
								{@html getUserAvatar()}
							</div>
						{/if}
					</div>
					<!-- Duplicated theme/logout buttons removed per UX request -->
				</button>
			{/if}
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

	.scale-\[3\] {
		transform: scale(3);
		z-index: 50;
	}

	/* Smooth transitions for easter egg including movement */
	.transition-all {
		transition-property: transform;
		transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
		transition-duration: 200ms;
	}

	/* Custom width transitions */
	.transition-all.duration-300 {
		transition-property: width, transform;
		transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
		transition-duration: 300ms;
	}

	/* Ensure smooth text transitions */
	.transition-all {
		transition-property: transform, width, opacity, margin, padding;
		transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
		transition-duration: 200ms;
	}

	/* Fix navigation items alignment in collapsed state */
	.menu li button {
		display: flex;
		align-items: center;
		width: 100%;
	}

	/* Spacing/alignment handled by vendor utilities (Tailwind/daisyUI) */

	/* Ensure avatars maintain proper aspect ratio */
	.avatar > div {
		display: flex;
		align-items: center;
		justify-content: center;
	}

	/* Force perfectly square buttons in collapsed state */
	/* `.btn-square` is no longer needed in this component - kept globally by daisyUI */

	/* Ensure icons are perfectly centered */
	.flex.items-center.justify-center {
		display: flex;
		align-items: center;
		justify-content: center;
	}
</style>
