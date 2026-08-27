<script lang="ts">
	import { useTagsQuery, useCreateTagMutation } from './queries/tags';
	import type { Tag } from './api';
	import { isAdmin } from './stores';
	import { TAG_ICONS, getTagIcon, getTagIconLabel, inferTagStyle } from './tagIcons';

	interface Props {
		/** Selected tag ids (bindable). */
		value?: number[];
		onChange?: (ids: number[]) => void;
		/** Whether to show the inline "create tag" flow. Defaults to admin status. */
		allowCreate?: boolean;
	}

	let { value = $bindable([]), onChange, allowCreate }: Props = $props();

	// Only staff may extend the team-shared tag catalog; everyone can pick tags.
	const canCreate = $derived(allowCreate ?? $isAdmin);

	const tagsQuery = useTagsQuery();
	const createMutation = useCreateTagMutation();
	const allTags = $derived(tagsQuery.data ?? []);

	let search = $state('');
	let creating = $state(false);
	let newTitle = $state('');
	let newIcon = $state('tag');
	let newColor = $state('#3B82F6');
	let createError = $state('');
	let iconTouched = $state(false);
	let colorTouched = $state(false);

	// Auto-suggest a relevant icon/color as the title is typed (until the user
	// explicitly picks one).
	$effect(() => {
		if (!creating) return;
		const title = newTitle;
		if (!title.trim()) return;
		if (!iconTouched || !colorTouched) {
			const s = inferTagStyle(title);
			if (!iconTouched) newIcon = s.icon;
			if (!colorTouched) newColor = s.color;
		}
	});

	const iconOptions = $derived(Object.keys(TAG_ICONS));
	const colorOptions = $derived([
		'#EF4444',
		'#F97316',
		'#F59E0B',
		'#22C55E',
		'#84CC16',
		'#14B8A6',
		'#06B6D4',
		'#3B82F6',
		'#6366F1',
		'#8B5CF6',
		'#EC4899',
		'#A16207',
		'#0EA5E9',
		'#64748B'
	]);

	const filteredTags = $derived(
		search.trim()
			? allTags.filter((t) => t.title.toLowerCase().includes(search.trim().toLowerCase()))
			: allTags
	);

	const selectedTags = $derived(allTags.filter((t: Tag) => value.includes(t.id)));

	function isSelected(id: number): boolean {
		return value.includes(id);
	}

	function toggle(tag: Tag): void {
		value = isSelected(tag.id) ? value.filter((v) => v !== tag.id) : [...value, tag.id];
		onChange?.(value);
	}

	function startCreate(): void {
		creating = true;
		newTitle = '';
		newIcon = 'tag';
		newColor = '#3B82F6';
		createError = '';
		iconTouched = false;
		colorTouched = false;
	}

	async function submitCreate(): Promise<void> {
		if (!newTitle.trim() || createMutation.isPending) return;
		createError = '';
		try {
			const created = await createMutation.mutateAsync({
				title: newTitle.trim(),
				icon: newIcon,
				color: newColor
			});
			value = [...value, created.id];
			onChange?.(value);
			creating = false;
		} catch (err: any) {
			const data = err?.response?._data;
			createError = data?.title?.[0] ?? data?.detail ?? 'Could not create tag';
		}
	}
</script>

<div class="space-y-2.5">
	<!-- Selected summary -->
	{#if selectedTags.length > 0}
		<div class="flex flex-wrap gap-1.5">
			{#each selectedTags as tag (tag.id)}
				{@const Icon = getTagIcon(tag.icon)}
				<button
					type="button"
					onclick={() => toggle(tag)}
					class="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium"
					style="background:{tag.color}33;color:{tag.color};border:1px solid {tag.color}55;"
					title="Remove tag"
				>
					<Icon size={11} />
					{tag.title}
					<span class="opacity-70">×</span>
				</button>
			{/each}
		</div>
	{/if}

	<!-- Search -->
	<input
		type="text"
		bind:value={search}
		class="input input-bordered input-sm w-full"
		placeholder="Search tags…"
	/>

	<!-- Tag grid -->
	<div class="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto">
		{#each filteredTags as tag (tag.id)}
			{@const Icon = getTagIcon(tag.icon)}
			<button
				type="button"
				onclick={() => toggle(tag)}
				class="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-colors"
				style="background:{tag.color}{isSelected(tag.id)
					? '4d'
					: '1f'};color:{tag.color};border:1px solid {tag.color}55;"
			>
				<Icon size={12} />
				{tag.title}
			</button>
		{/each}
		{#if !tagsQuery.isLoading && filteredTags.length === 0}
			<span class="text-xs italic text-base-content/50">No tags match.</span>
		{/if}
	</div>

	<!-- Create new tag -->
	{#if canCreate}
		{#if creating}
			{@const PreviewIcon = getTagIcon(newIcon)}
			<div class="space-y-3 rounded-xl border border-base-300 bg-base-200/50 p-3">
				<!-- Live preview -->
				<div class="flex items-center gap-2">
					<span
						class="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium"
						style="background:{newColor}1f;color:{newColor};border:1px solid {newColor}55;"
					>
						<PreviewIcon size={12} />
						{newTitle.trim() || getTagIconLabel(newIcon)}
					</span>
					<span class="text-xs text-base-content/50">Preview</span>
				</div>

				<!-- Title -->
				<div>
					<label class="label px-0 pb-1" for="tag-picker-title">
						<span class="label-text text-xs font-semibold">Title</span>
					</label>
					<input
						id="tag-picker-title"
						type="text"
						bind:value={newTitle}
						class="input input-bordered input-sm w-full"
						placeholder="e.g. Bug Fix"
						onkeydown={(e) => {
							if (e.key === 'Enter') submitCreate();
						}}
					/>
				</div>

				<!-- Icon (visual glyph grid) -->
				<div>
					<span class="label px-0 pb-1">
						<span class="label-text text-xs font-semibold">Icon</span>
					</span>
					<div class="flex max-h-28 flex-wrap gap-1 overflow-y-auto pr-1">
						{#each iconOptions as name (name)}
							{@const Icon = getTagIcon(name)}
							<button
								type="button"
								class="flex h-8 w-8 items-center justify-center rounded-lg border {newIcon === name
									? 'border-primary bg-primary/15 text-primary'
									: 'border-base-300 hover:border-base-content/40'} bg-base-100"
								title={getTagIconLabel(name)}
								aria-label={getTagIconLabel(name)}
								onclick={() => {
									iconTouched = true;
									newIcon = name;
								}}
							>
								<Icon size={16} />
							</button>
						{/each}
					</div>
				</div>

				<!-- Color swatches -->
				<div>
					<span class="label px-0 pb-1">
						<span class="label-text text-xs font-semibold">Color</span>
					</span>
					<div class="flex flex-wrap items-center gap-1.5">
						{#each colorOptions as c (c)}
							<button
								type="button"
								class="h-6 w-6 rounded-full border-2 transition-transform {newColor === c
									? 'scale-110 border-base-content'
									: 'border-transparent'}"
								style="background:{c}"
								aria-label={`Color ${c}`}
								onclick={() => {
									colorTouched = true;
									newColor = c;
								}}
							></button>
						{/each}
					</div>
				</div>

				{#if createError}
					<p class="text-xs text-error">{createError}</p>
				{/if}
				<div class="flex justify-end gap-2">
					<button class="btn btn-ghost btn-sm" onclick={() => (creating = false)}>Cancel</button>
					<button
						class="btn btn-primary btn-sm"
						onclick={submitCreate}
						disabled={!newTitle.trim() || createMutation.isPending}
					>
						{#if createMutation.isPending}
							<span class="loading loading-spinner loading-xs"></span>
						{/if}
						Create tag
					</button>
				</div>
			</div>
		{:else}
			<button class="btn btn-ghost btn-sm btn-outline" onclick={startCreate}>
				<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"
					></path>
				</svg>
				New tag
			</button>
		{/if}
	{/if}
</div>
