<script lang="ts">
	import {
		Clock,
		LayoutDashboard,
		ListChecks,
		Settings,
		ChevronLeft,
		ChevronRight,
		ChartColumn,
		Timer
	} from '@jis3r/icons';
	import { Heart, Shield } from '@lucide/svelte';
	import { user, theme, sidebarCollapsed } from '$lib/stores';
	import { page } from '$app/stores';
	import { gotoApp, appPath } from '$lib/navigation';
	import { get } from 'svelte/store';
	import { onMount } from 'svelte';
	import { generateDicebearAvatar } from './utils';
	import { prefetchRoute } from '$lib/queries/prefetch';
	import { useActiveTimer } from '$lib/queries/timeEntries';
	import { addToast } from '$lib/toast';

	interface User {
		username?: string;
		first_name?: string;
		last_name?: string;
		profile_image?: string | null;
	}

	// Sidebar state - using the persistent store
	let isCollapsed = $state(get(sidebarCollapsed));

	// Active timer — when a timer is running, the brand clock spins slowly.
	const activeTimerQuery = useActiveTimer();
	const isTimerRunning = $derived(!!activeTimerQuery.data);
	let isMobile = $state(typeof window !== 'undefined' ? window.innerWidth < 768 : false);
	let effectiveCollapsed = $derived(isMobile ? false : isCollapsed);

	// Easter egg cheat codes (GTA San Andreas style) — definitions live below
	let cheatProgress: Record<string, number> = {};
	let cheatTimer: ReturnType<typeof setTimeout> | undefined;

	interface ConfettiPiece {
		id: number;
		left: number;
		color: string;
		delay: number;
		size: number;
		drift: number;
		bx: number;
		by: number;
		burst: boolean;
		shape: 'rect' | 'circle' | 'triangle';
	}
	let confetti = $state<ConfettiPiece[]>([]);
	let confettiId = 0;
	let partyMode = $state(false);

	// HESOYAM splash state
	let hesoyamSplash = $state(false);
	let cashCount = $state(0);

	interface MoneyBill {
		id: number;
		left: number;
		delay: number;
		size: number;
		drift: number;
	}
	let moneyRain = $state<MoneyBill[]>([]);

	// Subscribe to sidebar collapsed state changes
	$effect(() => {
		const unsubscribe = sidebarCollapsed.subscribe((value: boolean) => {
			isCollapsed = value;
		});
		return unsubscribe;
	});

	onMount(() => {
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

		// Cheat code listener — tracks every code independently on each keystroke
		const handleKeyDown = (event: KeyboardEvent) => {
			// Lowercase letters so shift/caps-lock still match (arrows stay as-is)
			const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
			let fired: string | null = null;

			for (const name of Object.keys(CHEATS)) {
				const seq = CHEATS[name].keys;
				const progress = cheatProgress[name] || 0;
				if (key === seq[progress]) {
					cheatProgress[name] = progress + 1;
					if (cheatProgress[name] === seq.length) {
						cheatProgress[name] = 0;
						fired = name;
					}
				} else {
					cheatProgress[name] = key === seq[0] ? 1 : 0;
				}
			}

			if (fired) {
				if (CHEATS[fired].effect === 'hesoyam') {
					triggerHesoyam();
				} else {
					triggerParty(CHEATS[fired].message, CHEATS[fired].colors);
				}
			}

			clearTimeout(cheatTimer);
			cheatTimer = setTimeout(() => {
				cheatProgress = {};
			}, 3000);
		};

		document.addEventListener('keydown', handleKeyDown);

		return () => {
			window.removeEventListener('resize', checkMobile);
			document.removeEventListener('keydown', handleKeyDown);
			clearTimeout(cheatTimer);
		};
	});

	// Confetti burst for the Konami easter egg
	const CONFETTI_COLORS = [
		'#f43f5e',
		'#f97316',
		'#facc15',
		'#4ade80',
		'#22d3ee',
		'#60a5fa',
		'#a78bfa',
		'#f472b6'
	];

	// Money-themed palette for the HESOYAM cheat (greens + gold)
	const MONEY_COLORS = ['#16a34a', '#22c55e', '#4ade80', '#86efac', '#facc15', '#fbbf24'];

	// Cheat code definitions — each triggers its own party with a themed palette
	const CHEATS: Record<
		string,
		{ keys: string[]; message: string; colors: string[]; effect: 'party' | 'hesoyam' }
	> = {
		konami: {
			keys: [
				'ArrowUp',
				'ArrowUp',
				'ArrowDown',
				'ArrowDown',
				'ArrowLeft',
				'ArrowRight',
				'ArrowLeft',
				'ArrowRight',
				'b',
				'a'
			],
			message: '🎉 Party mode! You found the secret.',
			colors: CONFETTI_COLORS,
			effect: 'party'
		},
		hesoyam: {
			keys: ['h', 'e', 's', 'o', 'y', 'a', 'm'],
			message: '💵 HESOYAM! Health, armor & $250,000 restored. Respect +',
			colors: MONEY_COLORS,
			effect: 'hesoyam'
		}
	};

	const SHAPES = ['rect', 'rect', 'circle', 'triangle'] as const;

	// Party sounds. The Konami fanfare is synthesized with the Web Audio API; the
	// HESOYAM chime plays a bundled audio file (static/sounds/secret-chime.mp3)
	// with a synthesized fallback if the file can't load.
	let audioCtx: AudioContext | null = null;

	function getAudioCtx(): AudioContext | null {
		try {
			const Ctx =
				typeof window !== 'undefined'
					? window.AudioContext ||
						(window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
					: undefined;
			if (!Ctx) return null;
			if (!audioCtx) audioCtx = new Ctx();
			if (audioCtx.state === 'suspended') {
				void audioCtx.resume();
			}
			return audioCtx;
		} catch {
			return null;
		}
	}

	function playFanfare() {
		const ctx = getAudioCtx();
		if (!ctx) return;
		try {
			const now = ctx.currentTime;
			// Ascending "ta-da" arpeggio: C5 E5 G5 C6
			const melody = [523.25, 659.25, 783.99, 1046.5];
			melody.forEach((freq, i) => {
				const osc = ctx.createOscillator();
				const gain = ctx.createGain();
				const t = now + i * 0.09;
				osc.type = 'triangle';
				osc.frequency.setValueAtTime(freq, t);
				gain.gain.setValueAtTime(0.0001, t);
				gain.gain.exponentialRampToValueAtTime(0.22, t + 0.02);
				gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
				osc.connect(gain).connect(ctx.destination);
				osc.start(t);
				osc.stop(t + 0.4);
			});
			// Sparkle: two high blips layered on top
			[1567.98, 2093.0].forEach((freq, i) => {
				const osc = ctx.createOscillator();
				const gain = ctx.createGain();
				const t = now + 0.38 + i * 0.08;
				osc.type = 'sine';
				osc.frequency.setValueAtTime(freq, t);
				gain.gain.setValueAtTime(0.0001, t);
				gain.gain.exponentialRampToValueAtTime(0.1, t + 0.015);
				gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
				osc.connect(gain).connect(ctx.destination);
				osc.start(t);
				osc.stop(t + 0.3);
			});
		} catch {
			// Audio unavailable (some webviews) — confetti still works
		}
	}

	// Lazy-load the bundled HESOYAM chime audio
	let cheatAudio: HTMLAudioElement | null = null;

	function getCheatAudio(): HTMLAudioElement | null {
		if (cheatAudio) return cheatAudio;
		try {
			cheatAudio = new Audio('/sounds/secret-chime.mp3');
			cheatAudio.preload = 'auto';
			return cheatAudio;
		} catch {
			return null;
		}
	}

	// HESOYAM sound: plays the bundled chime, falling back to a synthesized
	// cheat-beep + cash-register cha-ching if the file can't load
	function playHesoyamSound() {
		const audio = getCheatAudio();
		if (audio) {
			audio.currentTime = 0;
			void audio.play().catch(() => playSynthHesoyam());
			return;
		}
		playSynthHesoyam();
	}

	function playSynthHesoyam() {
		const ctx = getAudioCtx();
		if (!ctx) return;
		const now = ctx.currentTime;

		const beep = (freq: number, t: number, dur: number, vol: number) => {
			const osc = ctx.createOscillator();
			const gain = ctx.createGain();
			osc.type = 'square';
			osc.frequency.setValueAtTime(freq, t);
			gain.gain.setValueAtTime(0.0001, t);
			gain.gain.exponentialRampToValueAtTime(vol, t + 0.015);
			gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
			osc.connect(gain).connect(ctx.destination);
			osc.start(t);
			osc.stop(t + dur + 0.05);
		};

		// Iconic two-tone rising cheat beep (inspired by the game's activation tone)
		beep(830.61, now, 0.13, 0.1);
		beep(1244.51, now + 0.14, 0.17, 0.1);

		// Cash register "cha-ching" bells (E6 then B5, with a metallic partial)
		const bell = (freq: number, t: number) => {
			[freq, freq * 2.76].forEach((f, i) => {
				const osc = ctx.createOscillator();
				const gain = ctx.createGain();
				osc.type = 'sine';
				osc.frequency.setValueAtTime(f, t);
				gain.gain.setValueAtTime(0.0001, t);
				gain.gain.exponentialRampToValueAtTime(i === 0 ? 0.16 : 0.05, t + 0.01);
				gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
				osc.connect(gain).connect(ctx.destination);
				osc.start(t);
				osc.stop(t + 0.6);
			});
		};
		bell(1318.51, now + 0.36);
		bell(987.77, now + 0.48);

		// Coin ticks on top
		[2093.0, 2637.02].forEach((f, i) => beep(f, now + 0.6 + i * 0.07, 0.05, 0.05));
	}

	// Build the confetti pieces (rain + center burst) for a given palette
	function spawnConfetti(colors: string[]) {
		confettiId += 1;
		const burst = confettiId;

		const pieces: ConfettiPiece[] = [];

		// Rain from the top with horizontal sway
		for (let i = 0; i < 60; i++) {
			pieces.push({
				id: burst * 1000 + i,
				left: Math.random() * 100,
				color: colors[Math.floor(Math.random() * colors.length)],
				delay: Math.random() * 0.6,
				size: 6 + Math.random() * 7,
				drift: -120 + Math.random() * 240,
				bx: 0,
				by: 0,
				burst: false,
				shape: SHAPES[Math.floor(Math.random() * SHAPES.length)]
			});
		}

		// Radial burst from the center
		for (let i = 0; i < 24; i++) {
			const angle = (i / 24) * Math.PI * 2;
			const dist = 140 + Math.random() * 220;
			pieces.push({
				id: burst * 1000 + 100 + i,
				left: 0,
				color: colors[Math.floor(Math.random() * colors.length)],
				delay: Math.random() * 0.15,
				size: 5 + Math.random() * 6,
				drift: 0,
				bx: Math.cos(angle) * dist,
				by: Math.sin(angle) * dist - 40,
				burst: true,
				shape: SHAPES[Math.floor(Math.random() * SHAPES.length)]
			});
		}

		confetti = pieces;
		return burst;
	}

	function triggerParty(message: string, colors: string[]) {
		const burst = spawnConfetti(colors);
		partyMode = true;
		playFanfare();
		addToast(message, 'success', 3500);

		setTimeout(() => {
			if (confettiId === burst) {
				confetti = [];
				partyMode = false;
			}
		}, 4200);
	}

	// HESOYAM: GTA-style "cheat activated" splash + $250,000 counter + money rain
	function triggerHesoyam() {
		const burst = spawnConfetti(MONEY_COLORS);
		partyMode = true;
		playHesoyamSound();
		hesoyamSplash = true;
		cashCount = 0;

		moneyRain = Array.from({ length: 50 }, (_, i) => ({
			id: burst * 1000 + 200 + i,
			left: Math.random() * 100,
			delay: Math.random() * 0.8,
			size: 18 + Math.random() * 14,
			drift: -120 + Math.random() * 240
		}));

		runCashCounter();

		setTimeout(() => {
			if (confettiId === burst) {
				confetti = [];
				moneyRain = [];
				partyMode = false;
			}
		}, 4200);
		setTimeout(() => {
			hesoyamSplash = false;
		}, 2900);
	}

	// Count $0 → $250,000 with an ease-out curve.
	// Driven by setInterval + performance.now() so every tick computes the correct
	// elapsed time even if frames are throttled; a single instance is guarded by the
	// interval handle, and p is clamped to avoid a negative blip on the first tick.
	let cashInterval: ReturnType<typeof setInterval> | undefined;

	function runCashCounter() {
		clearInterval(cashInterval);
		const start = performance.now();
		const duration = 1400;
		cashInterval = setInterval(() => {
			const p = Math.max(0, Math.min(1, (performance.now() - start) / duration));
			cashCount = Math.round(250000 * (1 - Math.pow(1 - p, 3)));
			if (p >= 1) {
				clearInterval(cashInterval);
				cashInterval = undefined;
			}
		}, 30);
	}

	// Sidebar toggle function
	function toggleSidebar() {
		if (isMobile) return;
		sidebarCollapsed.set(!isCollapsed);
	}

	// Navigation items
	const navItems = [
		{ name: 'Timer', href: '/timer', icon: Timer },
		{ name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
		{ name: 'Entries', href: '/entries', icon: ListChecks },
		{ name: 'Reports', href: '/reports', icon: ChartColumn }
	];

	let currentPath = $derived($page.url.pathname);

	// Return true if the current path represents or starts with the given href
	function normalizePath(path: string) {
		if (!path) return '/';
		return path.replace(/\/+$/, '') || '/';
	}

	function isActivePath(href: string) {
		const cp = normalizePath(currentPath || '');
		// currentPath includes the deployment base path (if any), so compare
		// against the base-prefixed href.
		const h = normalizePath(appPath(href));
		if (cp === h) return true;
		return h !== appPath('/') && cp.startsWith(h + '/');
	}

	function navigate(href: string) {
		if (isMobile && typeof document !== 'undefined') {
			const drawer = document.getElementById('app-drawer') as HTMLInputElement | null;
			if (drawer) drawer.checked = false;
		}
		gotoApp(href);
	}

	// Generate Dicebear avatar SVG for user with theme-aware background
	function getUserAvatar() {
		const currentUser = $user as User | null;
		const currentTheme = $theme;
		if (currentUser?.username) {
			return generateDicebearAvatar(currentUser.username, currentTheme);
		}
		return generateDicebearAvatar('user', currentTheme);
	}

	// Get separate first and last names for line-by-line display
	function getFirstName(): string {
		const currentUser = $user as User | null;
		return currentUser?.first_name || '';
	}

	function getLastName(): string {
		const currentUser = $user as User | null;
		return currentUser?.last_name || '';
	}

	// Get username for bottom section (always show username)
	function getUsername(): string {
		const currentUser = $user as User | null;
		return currentUser?.username || '';
	}

	function displayName(): string {
		const first = getFirstName();
		const last = getLastName();
		if (first && last) return `${first} ${last}`;
		if (first) return first;
		if (last) return last;
		return getUsername() || 'User';
	}

	function navigateToProfile() {
		if (isMobile && typeof document !== 'undefined') {
			const drawer = document.getElementById('app-drawer') as HTMLInputElement | null;
			if (drawer) drawer.checked = false;
		}
		gotoApp('/profile');
	}
</script>

<!-- Drawer side content -->
<div class="drawer-side">
	<!-- Overlay for closing drawer -->
	<label for="app-drawer" aria-label="close sidebar" class="drawer-overlay"></label>

	<!-- Sidebar content with dynamic width -->
	<div
		class="flex min-h-full flex-col items-stretch bg-base-200 transition-all duration-300 ease-in-out {effectiveCollapsed
			? 'w-[4.5rem]'
			: 'w-64'}"
	>
		<!-- Brand header -->
		<div
			class="flex w-full items-center pb-4 pt-5 transition-all duration-300 {effectiveCollapsed
				? 'justify-start pl-[18px] pr-4'
				: 'justify-between px-4'}"
		>
			<div class="flex min-w-0 items-center {effectiveCollapsed ? 'gap-0' : 'gap-2.5'}">
				{#if effectiveCollapsed}
					<button
						class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors hover:bg-primary/20 {partyMode
							? 'party-tile'
							: ''}"
						onclick={toggleSidebar}
						title="Expand sidebar"
						aria-label="Expand sidebar"
					>
						<span
							class="brand-clock inline-flex items-center {isTimerRunning
								? 'clock-hands-spin'
								: ''}"
							aria-hidden="true"
						>
							<Clock size={24} />
						</span>
					</button>
				{:else}
					<div
						class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary {partyMode
							? 'party-tile'
							: ''}"
						title="Time Tracker"
					>
						<span
							class="brand-clock inline-flex items-center {isTimerRunning
								? 'clock-hands-spin'
								: ''}"
							aria-hidden="true"
						>
							<Clock size={24} />
						</span>
					</div>
				{/if}
				<p
					class="truncate text-sm font-bold tracking-tight transition-all duration-200 {effectiveCollapsed
						? 'max-w-0 opacity-0'
						: 'max-w-full opacity-100'}"
					aria-hidden={effectiveCollapsed}
				>
					Time Tracker
				</p>
			</div>

			{#if !isMobile}
				<button
					class="btn btn-ghost btn-sm min-w-0 overflow-hidden transition-all duration-200 {effectiveCollapsed
						? 'w-0 p-0 opacity-0'
						: 'w-auto opacity-100'}"
					onclick={toggleSidebar}
					title={effectiveCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
					aria-label={effectiveCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
				>
					<ChevronLeft size={16} />
				</button>
			{/if}
		</div>

		<!-- Navigation -->
		<nav class="flex grow flex-col gap-1 overflow-y-auto px-3 py-2">
			<!-- Fixed-height section label: keeps nav icons aligned between collapsed/expanded -->
			<div class="flex h-7 shrink-0 items-center px-3">
				<p
					class="text-[10px] font-semibold uppercase tracking-widest text-base-content/60 transition-all duration-200 {effectiveCollapsed
						? 'opacity-0'
						: 'opacity-100'}"
					aria-hidden={effectiveCollapsed}
				>
					Menu
				</p>
			</div>

			{#each navItems as item}
				<div class="relative">
					{#if isActivePath(item.href)}
						<span
							class="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-primary"
							aria-hidden="true"
						></span>
					{/if}
					<button
						aria-current={isActivePath(item.href) ? 'page' : undefined}
						class="flex w-full items-center rounded-lg py-2.5 text-sm transition-all duration-200 {effectiveCollapsed
							? 'justify-start gap-0 px-3.5'
							: 'gap-3 px-3'} {isActivePath(item.href)
							? 'bg-primary/10 font-semibold text-primary'
							: 'text-base-content/70 hover:bg-base-300/60 hover:text-base-content'}"
						onclick={() => navigate(item.href)}
						onmouseenter={() => prefetchRoute(item.href)}
						onfocus={() => prefetchRoute(item.href)}
						onkeydown={(event) => {
							if (event.key === 'Enter' || event.key === ' ') prefetchRoute(item.href);
						}}
						title={effectiveCollapsed ? item.name : ''}
						aria-label={item.name}
					>
						<span class="shrink-0" aria-hidden="true">
							<item.icon size={20} />
						</span>
						<span
							class="truncate transition-all duration-200 {effectiveCollapsed
								? 'max-w-0 opacity-0'
								: 'max-w-full opacity-100'}"
							aria-hidden={effectiveCollapsed}
						>
							{item.name}
						</span>
					</button>
				</div>
			{/each}

			<!-- Divider + Settings pinned below the main pages -->
			<div class="my-1 border-t border-base-300/60"></div>
			<div class="relative">
				{#if isActivePath('/settings')}
					<span
						class="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-primary"
						aria-hidden="true"
					></span>
				{/if}
				<button
					aria-current={isActivePath('/settings') ? 'page' : undefined}
					class="flex w-full items-center rounded-lg py-2.5 text-sm transition-all duration-200 {effectiveCollapsed
						? 'justify-start gap-0 px-3.5'
						: 'gap-3 px-3'} {isActivePath('/settings')
						? 'bg-primary/10 font-semibold text-primary'
						: 'text-base-content/70 hover:bg-base-300/60 hover:text-base-content'}"
					onclick={() => navigate('/settings')}
					onmouseenter={() => prefetchRoute('/settings')}
					onfocus={() => prefetchRoute('/settings')}
					onkeydown={(event) => {
						if (event.key === 'Enter' || event.key === ' ') prefetchRoute('/settings');
					}}
					title={effectiveCollapsed ? 'Settings' : ''}
					aria-label="Settings"
				>
					<span class="shrink-0" aria-hidden="true">
						<Settings size={20} />
					</span>
					<span
						class="truncate transition-all duration-200 {effectiveCollapsed
							? 'max-w-0 opacity-0'
							: 'max-w-full opacity-100'}"
						aria-hidden={effectiveCollapsed}
					>
						Settings
					</span>
				</button>
			</div>
		</nav>

		<!-- Profile row -->
		<div class="w-full border-t border-base-300/60 p-3">
			<button
				type="button"
				class="flex w-full items-center rounded-xl py-2 transition-colors hover:bg-base-300/60 {effectiveCollapsed
					? 'justify-start gap-0 pl-1.5 pr-2'
					: 'gap-3 px-2'}"
				onclick={navigateToProfile}
				aria-label="Open profile"
				title={effectiveCollapsed ? getUsername() || 'Profile' : ''}
			>
				<div class="profile-avatar h-9 w-9 shrink-0 overflow-hidden rounded-full">
					{#if $user?.profile_image}
						<img
							src={$user.profile_image}
							alt="Profile"
							class="h-9 w-9 rounded-full object-cover"
						/>
					{:else}
						<div class="h-9 w-9" role="img" aria-hidden="true">
							{@html getUserAvatar()}
						</div>
					{/if}
				</div>
				<div
					class="min-w-0 flex-1 text-left transition-all duration-200 {effectiveCollapsed
						? 'max-w-0 flex-none opacity-0'
						: 'max-w-full opacity-100'}"
					aria-hidden={effectiveCollapsed}
				>
					<p class="truncate text-sm font-medium leading-tight">{displayName()}</p>
					<p class="truncate text-xs text-base-content/50">{getUsername()}</p>
				</div>
				<ChevronRight
					class="shrink-0 overflow-hidden text-base-content/30 transition-all duration-200 {effectiveCollapsed
						? 'w-0 opacity-0'
						: 'w-4 opacity-100'}"
					size={16}
				/>
			</button>
		</div>
	</div>
</div>
<!-- HESOYAM "cheat activated" splash -->
{#if hesoyamSplash}
	<div class="hesoyam-splash" aria-hidden="true">
		<div class="hesoyam-box">
			<p class="hesoyam-title">Cheat activated</p>
			<p class="hesoyam-name">HESOYAM</p>
			<div class="hesoyam-stats">
				<span class="flex items-center gap-1"><Heart class="h-4 w-4" /> +Health</span>
				<span class="flex items-center gap-1"><Shield class="h-4 w-4" /> +Armor</span>
				<span class="hesoyam-cash">$ {Math.round(cashCount).toLocaleString()}</span>
			</div>
		</div>
	</div>
{/if}

<!-- Money rain overlay -->
{#if moneyRain.length > 0}
	<div class="confetti-layer" aria-hidden="true">
		{#each moneyRain as bill (bill.id)}
			<span
				class="money-bill"
				style="left: {bill.left}%; font-size: {bill.size}px; --drift: {bill.drift}px; --delay: {bill.delay}s"
				>$</span
			>
		{/each}
	</div>
{/if}

<!-- Easter egg confetti overlay -->
{#if confetti.length > 0}
	<div class="confetti-layer" aria-hidden="true">
		{#each confetti as piece (piece.id)}
			<span
				class="confetti-piece {piece.burst ? 'confetti-burst' : ''} {piece.shape === 'circle'
					? 'confetti-circle'
					: ''} {piece.shape === 'triangle' ? 'confetti-triangle' : ''}"
				style="left: {piece.burst
					? 50
					: piece.left}%; background: {piece.color}; width: {piece.size}px; height: {piece.shape ===
				'rect'
					? piece.size * 0.45
					: piece.size}px; --drift: {piece.drift}px; --bx: {piece.bx}px; --by: {piece.by}px; --delay: {piece.delay}s"
			></span>
		{/each}
	</div>
{/if}

<style>
	/* The icon component wraps its svg in an inline-block div; the inline svg
	sits on the text baseline and adds a descender gap below it, which pushes
	the glyph up inside the tile. Display block centers it properly. */
	.brand-clock :global(svg) {
		display: block;
	}

	/* While a timer runs, the brand clock's hands turn like a real clock: the
	long hand sweeps fast (seconds), the short hand turns slowly (hours),
	both pivoting around the clock center. */
	@keyframes clock-hand-slow {
		to {
			transform: rotate(360deg);
		}
	}
	@keyframes clock-hand-fast {
		to {
			transform: rotate(360deg);
		}
	}
	.clock-hands-spin :global(.minute-hand) {
		animation: clock-hand-fast 0.75s linear infinite;
	}
	.clock-hands-spin :global(.hour-hand) {
		animation: clock-hand-slow 9s linear infinite;
	}
	@media (prefers-reduced-motion: reduce) {
		.clock-hands-spin :global(.minute-hand),
		.clock-hands-spin :global(.hour-hand) {
			animation: none;
		}
	}

	/* Ensure drawer side is properly positioned */
	.drawer-side {
		z-index: 30;
	}

	/* Style the Dicebear SVG avatar */
	.profile-avatar :global(svg) {
		display: block;
		width: 100%;
		height: 100%;
		border-radius: 50%;
		overflow: hidden;
	}

	/* Konami confetti overlay */
	.confetti-layer {
		position: fixed;
		inset: 0;
		overflow: hidden;
		pointer-events: none;
		z-index: 9999;
	}

	.confetti-piece {
		position: absolute;
		top: -20px;
		border-radius: 2px;
		opacity: 0;
		animation-name: confetti-fall;
		animation-timing-function: cubic-bezier(0.25, 0.46, 0.45, 0.94);
		animation-duration: 2.8s;
		animation-fill-mode: forwards;
		animation-delay: var(--delay, 0s);
	}

	/* Center burst pieces */
	.confetti-burst {
		top: 42%;
		left: 50%;
		border-radius: 50%;
		animation-name: confetti-burst;
		animation-duration: 1.1s;
		animation-timing-function: cubic-bezier(0.16, 1, 0.3, 1);
	}

	/* Shape variants */
	.confetti-circle {
		border-radius: 50%;
	}

	.confetti-triangle {
		border-radius: 0;
		clip-path: polygon(50% 0, 0 100%, 100% 100%);
	}

	@keyframes confetti-fall {
		0% {
			opacity: 1;
			transform: translate3d(0, 0, 0) rotateZ(0deg) rotateX(0deg);
		}
		100% {
			opacity: 0;
			transform: translate3d(var(--drift, 0px), 110vh, 0) rotateZ(720deg) rotateX(540deg);
		}
	}

	@keyframes confetti-burst {
		0% {
			opacity: 1;
			transform: translate(0, 0) rotateZ(0deg);
		}
		100% {
			opacity: 0;
			transform: translate(var(--bx, 0px), var(--by, 0px)) rotateZ(720deg);
		}
	}

	/* Party mode: brand tile pulse + hue spin */
	.party-tile {
		animation: party-spin 1.2s ease-in-out infinite;
	}

	@keyframes party-spin {
		0%,
		100% {
			transform: scale(1) rotate(0deg);
			filter: hue-rotate(0deg);
		}
		50% {
			transform: scale(1.15) rotate(8deg);
			filter: hue-rotate(120deg);
		}
	}

	/* HESOYAM splash — GTA-style "cheat activated" overlay */
	.hesoyam-splash {
		position: fixed;
		inset: 0;
		z-index: 9998;
		display: flex;
		align-items: center;
		justify-content: center;
		pointer-events: none;
		background: radial-gradient(ellipse at center, rgba(22, 163, 74, 0.18), rgba(0, 0, 0, 0.45));
		animation: hesoyam-fade 2.8s ease-out forwards;
	}

	.hesoyam-box {
		text-align: center;
		transform: scale(0.9);
		animation: hesoyam-pop 2.8s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
	}

	.hesoyam-title {
		font-size: 1.25rem;
		font-weight: 800;
		letter-spacing: 0.4em;
		text-transform: uppercase;
		color: #4ade80;
		text-shadow:
			0 0 14px rgba(74, 222, 128, 0.8),
			0 2px 0 #052e16;
	}

	.hesoyam-name {
		font-size: 3.25rem;
		font-weight: 900;
		font-style: italic;
		letter-spacing: 0.15em;
		color: #86efac;
		text-shadow:
			0 0 26px rgba(74, 222, 128, 0.9),
			0 4px 0 #052e16;
	}

	.hesoyam-stats {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: 1.25rem;
		margin-top: 0.75rem;
		font-weight: 600;
		color: #bbf7d0;
	}

	.hesoyam-cash {
		color: #fde047;
		font-variant-numeric: tabular-nums;
		text-shadow: 0 0 10px rgba(253, 224, 71, 0.7);
	}

	@keyframes hesoyam-fade {
		0% {
			opacity: 0;
		}
		12% {
			opacity: 1;
		}
		82% {
			opacity: 1;
		}
		100% {
			opacity: 0;
		}
	}

	@keyframes hesoyam-pop {
		0% {
			transform: scale(0.85);
			opacity: 0;
		}
		12% {
			transform: scale(1.03);
			opacity: 1;
		}
		20% {
			transform: scale(1);
		}
		82% {
			transform: scale(1);
			opacity: 1;
		}
		100% {
			transform: scale(1.06);
			opacity: 0;
		}
	}

	/* Money rain — falling dollar signs */
	.money-bill {
		position: absolute;
		top: -30px;
		font-weight: 800;
		color: #4ade80;
		opacity: 0;
		text-shadow: 0 0 6px rgba(74, 222, 128, 0.6);
		animation-name: confetti-fall;
		animation-duration: 3s;
		animation-timing-function: cubic-bezier(0.25, 0.46, 0.45, 0.94);
		animation-fill-mode: forwards;
		animation-delay: var(--delay, 0s);
	}
</style>
