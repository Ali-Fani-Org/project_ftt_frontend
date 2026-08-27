<script lang="ts">
	import { theme, customThemes } from '$lib/stores';
	import { Check, Plus, Sun, Moon, X } from '@lucide/svelte';
	import { addToast } from '$lib/toast';

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
		'web3hub'
	];

	const DARK_THEMES = new Set([
		'dark',
		'synthwave',
		'halloween',
		'forest',
		'black',
		'luxury',
		'dracula',
		'business',
		'night',
		'coffee',
		'cyberpunk',
		'web3hub'
	]);

	type Tone = 'all' | 'light' | 'dark';
	let filter = $state<Tone>('all');
	let newCustomName = $state('');

	const customNames = $derived(Object.keys($customThemes));
	const visibleBuiltIn = $derived(
		builtInThemes.filter(
			(name) => filter === 'all' || (DARK_THEMES.has(name) ? 'dark' : 'light') === filter
		)
	);
	const visibleCustom = $derived(filter === 'all' ? customNames : []);

	function select(name: string) {
		if (name !== $theme) {
			theme.set(name);
		}
	}

	function addCustom() {
		const name = newCustomName.trim();
		if (!name) return;
		const themes = { ...$customThemes };
		if (name in themes) {
			addToast(`Theme "${name}" already exists.`, 'info', 2500);
			return;
		}
		themes[name] = {};
		customThemes.set(themes);
		newCustomName = '';
		addToast(`Added custom theme "${name}".`, 'success', 2500);
	}

	function removeCustom(name: string) {
		const themes = { ...$customThemes };
		delete themes[name];
		customThemes.set(themes);
		if ($theme === name) {
			theme.set('light');
		}
		addToast(`Removed custom theme "${name}".`, 'info', 2000);
	}

	function inlineVars(name: string): string {
		const vars = $customThemes[name];
		if (!vars) return '';
		return Object.entries(vars)
			.map(([key, value]) => `${key}:${value}`)
			.join(';');
	}
</script>

<div class="space-y-5">
	<!-- Tone filter -->
	<div class="flex items-center gap-1.5" role="group" aria-label="Filter themes by tone">
		<button
			type="button"
			class="btn btn-sm btn-ghost px-3 {filter === 'all'
				? 'btn-active bg-base-content text-base-100'
				: 'text-base-content/60'}"
			aria-pressed={filter === 'all'}
			onclick={() => (filter = 'all')}
		>
			<Sun size={14} class="sm:hidden" />
			All
		</button>
		<button
			type="button"
			class="btn btn-sm btn-ghost px-3 {filter === 'light'
				? 'btn-active bg-base-content text-base-100'
				: 'text-base-content/60'}"
			aria-pressed={filter === 'light'}
			onclick={() => (filter = 'light')}
		>
			<Sun size={14} />
			Light
		</button>
		<button
			type="button"
			class="btn btn-sm btn-ghost px-3 {filter === 'dark'
				? 'btn-active bg-base-content text-base-100'
				: 'text-base-content/60'}"
			aria-pressed={filter === 'dark'}
			onclick={() => (filter = 'dark')}
		>
			<Moon size={14} />
			Dark
		</button>
	</div>

	<!-- Swatch grid -->
	<div class="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
		{#each visibleBuiltIn as name (name)}
			{@const active = $theme === name}
			<button
				type="button"
				class="group relative rounded-2xl border p-1.5 text-left transition-all hover:-translate-y-0.5 hover:shadow-md {active
					? 'border-primary ring-2 ring-primary/25'
					: 'border-base-300 hover:border-base-content/30'}"
				title={name}
				aria-label={`Apply ${name} theme`}
				aria-pressed={active}
				onclick={() => select(name)}
			>
				<div
					class="pointer-events-none h-14 overflow-hidden rounded-xl border border-base-content/10 bg-base-100"
					data-theme={name}
				>
					<div class="bg-base-200 p-1.5">
						<div class="mb-1 h-1.5 w-3/4 rounded-full bg-base-content/70"></div>
						<div class="mb-1.5 h-1.5 w-1/2 rounded-full bg-base-content/40"></div>
						<div class="flex items-center gap-1">
							<span class="h-3 w-3 rounded-full bg-primary"></span>
							<span class="h-3 w-3 rounded-full bg-secondary"></span>
							<span class="h-3 w-3 rounded-full bg-accent"></span>
							<span class="ml-auto h-3 w-6 rounded-full bg-base-100"></span>
						</div>
					</div>
				</div>
				<div class="mt-1.5 flex items-center justify-between gap-1 px-0.5">
					<span class="truncate text-xs font-medium text-base-content/80">{name}</span>
					{#if active}
						<span
							class="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary text-primary-content"
						>
							<Check size={10} />
						</span>
					{/if}
				</div>
			</button>
		{/each}

		{#each visibleCustom as name (name)}
			{@const active = $theme === name}
			<button
				type="button"
				class="group relative rounded-2xl border p-1.5 text-left transition-all hover:-translate-y-0.5 hover:shadow-md {active
					? 'border-primary ring-2 ring-primary/25'
					: 'border-base-300 hover:border-base-content/30'}"
				title={name}
				aria-label={`Apply ${name} theme`}
				aria-pressed={active}
				onclick={() => select(name)}
			>
				<div
					class="pointer-events-none h-14 overflow-hidden rounded-xl border border-base-content/10 bg-base-100"
					style={inlineVars(name)}
				>
					<div class="bg-base-200 p-1.5">
						<div class="mb-1 h-1.5 w-3/4 rounded-full bg-base-content/70"></div>
						<div class="mb-1.5 h-1.5 w-1/2 rounded-full bg-base-content/40"></div>
						<div class="flex items-center gap-1">
							<span class="h-3 w-3 rounded-full bg-primary"></span>
							<span class="h-3 w-3 rounded-full bg-secondary"></span>
							<span class="h-3 w-3 rounded-full bg-accent"></span>
							<span class="ml-auto h-3 w-6 rounded-full bg-base-100"></span>
						</div>
					</div>
				</div>
				<div class="mt-1.5 flex items-center justify-between gap-1 px-0.5">
					<span class="truncate text-xs font-medium text-base-content/80">{name}</span>
					{#if active}
						<span
							class="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary text-primary-content"
						>
							<Check size={10} />
						</span>
					{/if}
				</div>
			</button>
		{/each}
	</div>

	{#if visibleBuiltIn.length === 0 && visibleCustom.length === 0}
		<p class="text-sm text-base-content/50">No themes in this category.</p>
	{/if}

	<!-- Custom themes -->
	<div class="rounded-xl border border-dashed border-base-300 p-3.5">
		<p class="mb-2 text-xs font-semibold uppercase tracking-wide text-base-content/50">
			Custom themes
		</p>
		<div class="flex flex-wrap items-center gap-2">
			<div class="join flex-1 sm:flex-none">
				<input
					type="text"
					bind:value={newCustomName}
					placeholder="Theme name"
					class="input input-bordered input-sm join-item w-full sm:w-44"
					onkeydown={(e) => {
						if (e.key === 'Enter') addCustom();
					}}
				/>
				<button class="btn btn-primary btn-sm join-item" onclick={addCustom}>
					<Plus size={14} />
					Add
				</button>
			</div>
			{#if customNames.length > 0}
				<div class="flex flex-wrap items-center gap-1.5">
					{#each customNames as name (name)}
						<span class="badge badge-outline gap-1 py-2">
							{name}
							<button
								class="btn btn-ghost btn-xs -mr-1 p-0.5"
								title={`Remove ${name}`}
								aria-label={`Remove ${name}`}
								onclick={() => removeCustom(name)}
							>
								<X size={11} />
							</button>
						</span>
					{/each}
				</div>
			{/if}
		</div>
	</div>
</div>
