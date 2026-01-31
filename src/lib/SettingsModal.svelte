<script lang="ts">
	import {
		baseUrl,
		theme,
		customThemes,
		minimizeToTray,
		closeToTray,
		autostart,
		logout,
		backgroundAnimationEnabled
	} from './stores';

	import { enable, disable } from '@tauri-apps/plugin-autostart';
	import { createEventDispatcher } from 'svelte';
	import { onMount } from 'svelte';
	import { getVersion } from '@tauri-apps/api/app';

	const dispatch = createEventDispatcher();

	let localBaseUrl = $state($baseUrl);
	let localTheme = $state($theme);
	let customTheme = $state('');
	let enablePreview = $state(false);
	let localMinimizeToTray = $state($minimizeToTray);
	let localCloseToTray = $state($closeToTray);
	let localAutostart = $state($autostart);
	let localBackgroundAnimation = $state($backgroundAnimationEnabled);

	let appVersion = $state('');
	let showLogoutConfirm = $state(false);

	onMount(async () => {
		appVersion = await getVersion();
		// no-op: devtools feature is managed elsewhere
	});

	const builtInThemes = [
		'light',
		'dark',
		'cupcake',
		'bumblebee',
		'emerald',
		'corporate',
		'synthwave',
		'retro',
		'cyberpunk',
		'valentine',
		'halloween',
		'garden',
		'forest',
		'aqua',
		'lofi',
		'pastel',
		'fantasy',
		'wireframe',
		'black',
		'luxury',
		'dracula',
		'cmyk',
		'autumn',
		'business',
		'acid',
		'lemonade',
		'night',
		'coffee',
		'winter',
		'dim',
		'nord',
		'sunset',
		'caramellatte',
		'abyss',
		'silk',
		'web3hub'
	];

	let themes = $derived([...builtInThemes, ...Object.keys($customThemes), 'custom']);

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
		// Reset inline vars before applying a theme
		document.documentElement.style.cssText = '';
		if (themeName in $customThemes) {
			document.documentElement.setAttribute('data-theme', '');
			const vars = $customThemes[themeName];
			console.log('Applying custom vars:', vars);
			for (const [key, value] of Object.entries(vars as Record<string, string>)) {
				document.documentElement.style.setProperty(key, value);
			}

			if (typeof localStorage !== 'undefined') {
				localStorage.setItem('theme', themeName);
			}
		} else {
			// Let theme-change handle applying and persisting the theme
			if (typeof localStorage !== 'undefined') {
				localStorage.setItem('theme', themeName);
			}
			document.documentElement.setAttribute('data-theme', themeName);
			import('theme-change').then(({ themeChange }) => themeChange(false));
		}
	}

	async function save() {
		baseUrl.set(localBaseUrl);
		minimizeToTray.set(localMinimizeToTray);
		closeToTray.set(localCloseToTray);
		autostart.set(localAutostart);
		backgroundAnimationEnabled.set(localBackgroundAnimation);
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
			customThemes.update((ct: Record<string, Record<string, string>>) => ({
				...ct,
				[displayName]: vars
			}));
			theme.set(displayName);
		} else {
			theme.set(localTheme);
		}
		dispatch('close');
	}

	function cancel() {
		dispatch('close');
	}

	function confirmLogout() {
		logout();
		dispatch('close');
	}

	function cancelLogout() {
		showLogoutConfirm = false;
	}

	function saveBackgroundAnimation() {
		backgroundAnimationEnabled.set(localBackgroundAnimation);
	}
</script>

<div class="modal modal-open">
	<div class="modal-box modal-lg">
		<h3 class="font-bold text-lg">Settings</h3>

		<div class="form-control">
			<label class="label" for="baseUrl">
				<span class="label-text">Base URL</span>
			</label>
			<input
				id="baseUrl"
				bind:value={localBaseUrl}
				type="text"
				placeholder="http://localhost:8000"
				class="input input-bordered"
			/>
		</div>

		<div class="form-control">
			<label class="label" for="theme">
				<span class="label-text">Theme</span>
			</label>
			<select id="theme" bind:value={localTheme} class="select select-bordered">
				{#each themes as t}
					<option value={t}>{t}</option>
				{/each}
			</select>
			<label class="label cursor-pointer">
				<span class="label-text">Enable Preview</span>
				<input type="checkbox" bind:checked={enablePreview} class="checkbox" />
			</label>
		</div>

		<div class="form-control">
			<h4 class="label-text font-semibold mb-2">Tray Behavior</h4>
			<div class="space-y-2">
				<label class="label cursor-pointer">
					<span class="label-text">Minimize to tray</span>
					<input type="checkbox" bind:checked={localMinimizeToTray} class="checkbox" />
				</label>
				<label class="label cursor-pointer">
					<span class="label-text">Close to tray</span>
					<input type="checkbox" bind:checked={localCloseToTray} class="checkbox" />
				</label>
				<label class="label cursor-pointer">
					<span class="label-text">Autostart on boot</span>
					<input type="checkbox" bind:checked={localAutostart} class="checkbox" />
				</label>
			</div>
		</div>

		<div class="form-control mt-4">
			<label class="label cursor-pointer">
				<span class="label-text">Show animated background</span>
				<input
					type="checkbox"
					bind:checked={localBackgroundAnimation}
					onchange={saveBackgroundAnimation}
					class="checkbox"
				/>
			</label>
		</div>

		{#if Object.keys($customThemes).length > 0}
			<div class="form-control">
				<h4 class="label-text font-semibold mb-2">Saved Custom Themes</h4>
				<div class="space-y-2">
					{#each Object.keys($customThemes) as ct}
						<div class="flex justify-between items-center bg-base-200 p-2 rounded">
							<span>{ct}</span>
							<button
								class="btn btn-sm btn-error"
								onclick={() =>
									customThemes.update((cts: Record<string, Record<string, string>>) => {
										const newCts = { ...cts };
										delete newCts[ct];
										return newCts;
									})}
							>
								Remove
							</button>
						</div>
					{/each}
				</div>
			</div>
		{/if}

		<div class="form-control">
			<label class="label" for="customTheme">
				<span class="label-text">Custom Theme Definition</span>
			</label>
			<textarea
				id="customTheme"
				bind:value={customTheme}
				placeholder="Paste the full custom theme definition from DaisyUI website"
				class="textarea textarea-bordered"
				rows="10"
			></textarea>
		</div>

		{#if enablePreview}
			<div class="form-control">
				<h4 class="label-text font-semibold mb-2">Theme Preview</h4>
				<div class="bg-base-100 p-4 rounded-box border">
					<div class="flex gap-2 mb-4">
						<button class="btn btn-primary">Primary</button>
						<button class="btn btn-secondary">Secondary</button>
						<button class="btn btn-accent">Accent</button>
					</div>
					<div class="card bg-base-200 shadow">
						<div class="card-body">
							<h3 class="card-title">Preview Card</h3>
							<p>This is how the theme looks.</p>
							<div class="card-actions">
								<button class="btn btn-outline">Outline</button>
								<button class="btn btn-ghost">Ghost</button>
							</div>
						</div>
					</div>
				</div>
			</div>
		{/if}

		<div class="text-center text-sm text-base-content/70 mt-4">
			Version: {appVersion} | Build: {appVersion}
		</div>

		<div class="modal-action justify-between">
			<button class="btn btn-error" onclick={() => (showLogoutConfirm = true)}>Logout</button>
			<div>
				<button class="btn" onclick={cancel}>Cancel</button>
				<button class="btn btn-primary" onclick={save}>Save</button>
			</div>
		</div>

		{#if showLogoutConfirm}
			<div class="modal modal-open">
				<div class="modal-box max-w-sm">
					<h3 class="font-bold text-lg">Confirm Logout</h3>
					<p class="py-4">
						This will end your current session and require you to log in again. Are you sure you
						want to logout?
					</p>
					<div class="modal-action">
						<button class="btn" onclick={cancelLogout}>Cancel</button>
						<button class="btn btn-error" onclick={confirmLogout}>Logout</button>
					</div>
				</div>
			</div>
		{/if}
	</div>
</div>
