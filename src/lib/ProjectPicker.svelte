<script lang="ts">
	import { ChevronDown, Search, Check, Briefcase } from '@jis3r/icons';
	import type { Project } from './api';

	interface Props {
		/** Selected project id, or null. (bindable) */
		value?: number | null;
		onChange?: (id: number | null) => void;
		projects?: Project[];
		/** Called when the picker opens (e.g. to trigger a projects refresh). */
		onOpen?: () => void;
		placeholder?: string;
		/** id forwarded to the trigger button, so an external <label for> can target it. */
		inputId?: string;
	}

	let {
		value = $bindable(null),
		onChange,
		projects = [],
		onOpen,
		placeholder = 'Select a project',
		inputId
	}: Props = $props();

	let open = $state(false);
	let search = $state('');

	const selected = $derived(projects.find((p) => p.id === value) ?? null);
	const filtered = $derived(
		search.trim()
			? projects.filter((p) => p.title.toLowerCase().includes(search.trim().toLowerCase()))
			: projects
	);

	function toggle(): void {
		open = !open;
		if (open) {
			search = '';
			onOpen?.();
		}
	}

	function choose(id: number): void {
		value = id;
		onChange?.(id);
		open = false;
	}

	function clear(): void {
		value = null;
		onChange?.(null);
	}

	// Close on outside click
	let rootEl = $state<HTMLDivElement | null>(null);
	$effect(() => {
		if (!open) return;
		const onDown = (e: MouseEvent) => {
			if (rootEl && !rootEl.contains(e.target as Node)) open = false;
		};
		window.addEventListener('mousedown', onDown);
		return () => window.removeEventListener('mousedown', onDown);
	});
</script>

<div bind:this={rootEl} class="relative">
	<button
		type="button"
		id={inputId}
		class="input input-bordered flex w-full items-center justify-between gap-2 cursor-pointer bg-base-100 text-left focus:outline-none"
		onclick={toggle}
		aria-haspopup="listbox"
		aria-expanded={open}
	>
		<span class="flex min-w-0 items-center gap-2 flex-1">
			{#if selected}
				<span class="flex items-center gap-2 text-base-content">
					<span class="shrink-0 text-primary" aria-hidden="true">
						<Briefcase size={16} />
					</span>
					<span class="truncate">{selected.title}</span>
				</span>
			{:else}
				<span class="text-base-content/50 truncate">{placeholder}</span>
			{/if}
		</span>
		<span
			class="shrink-0 text-base-content/50 transition-transform {open ? 'rotate-180' : ''}"
			aria-hidden="true"
		>
			<ChevronDown size={16} />
		</span>
	</button>

	<!-- Dropdown panel -->
	{#if open}
		<div
			class="absolute z-30 mt-1 w-full overflow-hidden rounded-xl border border-base-300 bg-base-100 shadow-xl"
			role="listbox"
		>
			<!-- Search -->
			<div class="relative border-b border-base-200 p-2">
				<Search
					size={16}
					class="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-base-content/40"
				/>
				<input
					type="text"
					bind:value={search}
					class="input input-bordered input-sm w-full pl-9"
					placeholder="Search projects…"
				/>
			</div>

			<div class="max-h-64 overflow-y-auto p-1.5">
				{#if filtered.length === 0}
					<p class="px-3 py-6 text-center text-sm text-base-content/50">No projects found.</p>
				{:else}
					{#each filtered as project (project.id)}
						{@const isSelected = project.id === value}
						<button
							type="button"
							class="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors {isSelected
								? 'bg-primary/10 text-primary font-medium'
								: 'hover:bg-base-200'}"
							onclick={() => choose(project.id)}
							role="option"
							aria-selected={isSelected}
						>
							<span class="shrink-0 text-base-content/40" aria-hidden="true">
								<Briefcase size={16} />
							</span>
							<span class="flex-1 truncate">{project.title}</span>
							{#if isSelected}
								<span class="shrink-0 text-primary" aria-hidden="true">
									<Check size={16} />
								</span>
							{/if}
						</button>
					{/each}
				{/if}
			</div>
		</div>
	{/if}
</div>
