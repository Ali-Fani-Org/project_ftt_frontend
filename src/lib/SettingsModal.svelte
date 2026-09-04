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

	import { createEventDispatcher } from 'svelte';
	import { onMount } from 'svelte';
	import { createForm } from '@tanstack/svelte-form';

	const dispatch = createEventDispatcher();

	// TanStack Form owns the modal's field state + validation; the submit
	// handler runs the previous `save()` logic.
	const form = createForm(() => ({
		defaultValues: {
			baseUrl: $baseUrl,
			theme: $theme,
			customTheme: '',
			enablePreview: false,
			minimizeToTray: $minimizeToTray,
			closeToTray: $closeToTray,
			autostart: $autostart,
			backgroundAnimation: $backgroundAnimationEnabled
		},
		onSubmit: async ({ value }) => {
			await saveValues(value);
		}
	}));

	let appVersion = $state('');
	let showLogoutConfirm = $state(false);
	let isTauriApp = $state(false);

	const formValues = form.useSelector((state) => state.values);

	function checkIsTauri(): boolean {
		return (
			typeof window !== 'undefined' &&
			Boolean((window as any).__TAURI__ || (window as any).__TAURI_INTERNALS__)
		);
	}

	onMount(async () => {
		isTauriApp = checkIsTauri();
		if (isTauriApp) {
			try {
				const { getVersion } = await import('@tauri-apps/api/app');
				appVersion = await getVersion();
			} catch {
				appVersion = __APP_VERSION__;
			}
		} else {
			// Web (PWA) build: show the bundled web app version.
			appVersion = __APP_VERSION__;
		}
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

	// Preview theme (driven by form values)
	$effect(() => {
		const v = formValues.current;
		if (v.enablePreview && v.theme && v.theme !== $theme) {
			applyTheme(v.theme);
		} else if (!v.enablePreview) {
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

	async function saveValues(v: {
		baseUrl: string;
		theme: string;
		customTheme: string;
		enablePreview: boolean;
		minimizeToTray: boolean;
		closeToTray: boolean;
		autostart: boolean;
		backgroundAnimation: boolean;
	}) {
		baseUrl.set(v.baseUrl);
		minimizeToTray.set(v.minimizeToTray);
		closeToTray.set(v.closeToTray);
		autostart.set(v.autostart);
		backgroundAnimationEnabled.set(v.backgroundAnimation);
		try {
			if (!isTauriApp) {
				// Web (PWA) build: autostart is a desktop-only feature; persist the
				// preference in the store and skip the native call.
				return;
			}
			const { enable, disable } = await import('@tauri-apps/plugin-autostart');
			if (v.autostart) {
				await enable();
			} else {
				await disable();
			}
		} catch (error) {
			console.error('Failed to update autostart:', error);
		}
		if (v.theme === 'custom') {
			// Parse the custom theme
			const themeNameMatch = v.customTheme.match(/\[data-theme="([^"]+)"\]/);
			const originalName = themeNameMatch ? themeNameMatch[1] : 'custom';
			const displayName = `Custom(${originalName})`;
			const vars: Record<string, string> = {};

			// Parse CSS variables from the theme definition
			const varMatches = v.customTheme.matchAll(/--([a-z0-9-]+):\s*([^;]+);/g);
			for (const match of varMatches) {
				vars[`--${match[1]}`] = match[2].trim();
			}

			customThemes.update((ct: Record<string, Record<string, string>>) => ({
				...ct,
				[displayName]: vars
			}));
			theme.set(displayName);
		} else {
			theme.set(v.theme);
		}
		dispatch('close');
	}

	async function save() {
		await form.handleSubmit();
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

</script>

<div class="modal modal-open">
	<div class="modal-box modal-lg">
		<h3 class="font-bold text-lg">Settings</h3>

		<div class="form-control">
			<label class="label" for="baseUrl">
				<span class="label-text">Base URL</span>
			</label>
			<form.Field name="baseUrl">
				{#snippet children(field)}
					<input
						id="baseUrl"
						type="text"
						placeholder="https://hr.alpharency.com"
						class="input input-bordered"
						name={field.name}
						value={field.state.value}
						onblur={field.handleBlur}
						oninput={(e) => field.handleChange(e.currentTarget.value)}
					/>
				{/snippet}
			</form.Field>
		</div>

		<div class="form-control">
			<label class="label" for="theme">
				<span class="label-text">Theme</span>
			</label>
			<form.Field name="theme">
				{#snippet children(field)}
					<select
						id="theme"
						class="select select-bordered"
						name={field.name}
						value={field.state.value}
						onchange={(e) => field.handleChange(e.currentTarget.value)}
					>
						{#each themes as t}
							<option value={t}>{t}</option>
						{/each}
					</select>
				{/snippet}
			</form.Field>
			<form.Field name="enablePreview">
				{#snippet children(field)}
					<label class="label cursor-pointer">
						<span class="label-text">Enable Preview</span>
						<input
							type="checkbox"
							class="checkbox"
							checked={field.state.value}
							onchange={(e) => field.handleChange(e.currentTarget.checked)}
						/>
					</label>
				{/snippet}
			</form.Field>
		</div>

		<div class="form-control">
			<h4 class="label-text font-semibold mb-2">Tray Behavior</h4>
			<div class="space-y-2">
				<form.Field name="minimizeToTray">
					{#snippet children(field)}
						<label class="label cursor-pointer">
							<span class="label-text">Minimize to tray</span>
							<input
								type="checkbox"
								class="checkbox"
								checked={field.state.value}
								onchange={(e) => field.handleChange(e.currentTarget.checked)}
							/>
						</label>
					{/snippet}
				</form.Field>
				<form.Field name="closeToTray">
					{#snippet children(field)}
						<label class="label cursor-pointer">
							<span class="label-text">Close to tray</span>
							<input
								type="checkbox"
								class="checkbox"
								checked={field.state.value}
								onchange={(e) => field.handleChange(e.currentTarget.checked)}
							/>
						</label>
					{/snippet}
				</form.Field>
				<form.Field name="autostart">
					{#snippet children(field)}
						<label class="label cursor-pointer" title={isTauriApp ? '' : 'Desktop app only'}>
							<span class="label-text"
								>Autostart on boot{#if !isTauriApp} <span class="opacity-60">(desktop only)</span
									>{/if}</span
							>
							<input
								type="checkbox"
								class="checkbox"
								checked={field.state.value}
								disabled={!isTauriApp}
								onchange={(e) => field.handleChange(e.currentTarget.checked)}
							/>
						</label>
					{/snippet}
				</form.Field>
			</div>
		</div>

		<div class="form-control mt-4">
			<form.Field name="backgroundAnimation">
				{#snippet children(field)}
					<label class="label cursor-pointer">
						<span class="label-text">Show animated background</span>
						<input
							type="checkbox"
							class="checkbox"
							checked={field.state.value}
							onchange={(e) => field.handleChange(e.currentTarget.checked)}
						/>
					</label>
				{/snippet}
			</form.Field>
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
			<form.Field name="customTheme">
				{#snippet children(field)}
					<textarea
						id="customTheme"
						placeholder="Paste the full custom theme definition from DaisyUI website"
						class="textarea textarea-bordered"
						rows="10"
						name={field.name}
						value={field.state.value}
						oninput={(e) => field.handleChange(e.currentTarget.value)}
					></textarea>
				{/snippet}
			</form.Field>
		</div>

		{#if formValues.current.enablePreview}
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
