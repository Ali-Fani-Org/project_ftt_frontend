<script lang="ts">
	import { useTagsQuery, useCreateTagMutation, useUpdateTagMutation, useDeleteTagMutation } from './queries/tags';
	import type { Tag } from './api';
	import TagChip from './TagChip.svelte';
	import { TAG_ICONS, getTagIcon, getTagIconLabel, inferTagStyle } from './tagIcons';

	const tagsQuery = useTagsQuery();
	const createMutation = useCreateTagMutation();
	const updateMutation = useUpdateTagMutation();
	const deleteMutation = useDeleteTagMutation();

	const tags = $derived(tagsQuery.data ?? []);
	const iconOptions = $derived(Object.keys(TAG_ICONS));
	const colorOptions = $derived([
		'#EF4444', '#F97316', '#F59E0B', '#22C55E', '#84CC16', '#14B8A6',
		'#06B6D4', '#3B82F6', '#6366F1', '#8B5CF6', '#EC4899', '#A16207',
		'#0EA5E9', '#64748B'
	]);

	// Create form
	let showCreate = $state(false);
	let newTitle = $state('');
	let newIcon = $state('tag');
	let newColor = $state('#3B82F6');
	let createError = $state('');
	let createIconTouched = $state(false);
	let createColorTouched = $state(false);

	// Auto-suggest a relevant icon/color as the title is typed (until the user
	// explicitly picks one).
	$effect(() => {
		if (!showCreate) return;
		const title = newTitle;
		if (!title.trim()) return;
		if (!createIconTouched || !createColorTouched) {
			const s = inferTagStyle(title);
			if (!createIconTouched) newIcon = s.icon;
			if (!createColorTouched) newColor = s.color;
		}
	});

	// Edit state (single row at a time)
	let editingId = $state<number | null>(null);
	let editTitle = $state('');
	let editIcon = $state('tag');
	let editColor = $state('#3B82F6');
	let editError = $state('');

	// Delete confirm
	let deleteId = $state<number | null>(null);
	let deleteTitle = $state('');

	async function submitCreate(): Promise<void> {
		if (!newTitle.trim() || createMutation.isPending) return;
		createError = '';
		try {
			await createMutation.mutateAsync({ title: newTitle.trim(), icon: newIcon, color: newColor });
			newTitle = '';
			newIcon = 'tag';
			newColor = '#3B82F6';
			showCreate = false;
		} catch (err: any) {
			const data = err?.response?._data;
			createError = data?.title?.[0] ?? data?.detail ?? 'Could not create tag';
		}
	}

	function startEdit(tag: Tag): void {
		editingId = tag.id;
		editTitle = tag.title;
		editIcon = tag.icon;
		editColor = tag.color;
		editError = '';
	}

	async function submitEdit(): Promise<void> {
		if (editingId == null || !editTitle.trim() || updateMutation.isPending) return;
		editError = '';
		try {
			await updateMutation.mutateAsync({
				id: editingId,
				data: { title: editTitle.trim(), icon: editIcon, color: editColor }
			});
			editingId = null;
		} catch (err: any) {
			const data = err?.response?._data;
			editError = data?.title?.[0] ?? data?.detail ?? 'Could not update tag';
		}
	}

	function cancelEdit(): void {
		editingId = null;
		editError = '';
	}

	function openCreate(): void {
		showCreate = true;
		newTitle = '';
		newIcon = 'tag';
		newColor = '#3B82F6';
		createError = '';
		createIconTouched = false;
		createColorTouched = false;
	}

	function askDelete(tag: Tag): void {
		deleteId = tag.id;
		deleteTitle = tag.title;
	}

	async function confirmDelete(): Promise<void> {
		if (deleteId == null || deleteMutation.isPending) return;
		await deleteMutation.mutateAsync(deleteId);
		deleteId = null;
	}
</script>

<div class="space-y-6">
	<!-- Create -->
	<div>
		{#if showCreate}
			{@const PreviewIcon = getTagIcon(newIcon)}
			<div class="space-y-3 rounded-xl border border-base-300 bg-base-200/50 p-3">
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

				<div>
					<label class="label px-0 pb-1" for="tag-manager-title">
						<span class="label-text text-xs font-semibold">Title</span>
					</label>
					<input
						id="tag-manager-title"
						type="text"
						bind:value={newTitle}
						class="input input-bordered input-sm w-full"
						placeholder="e.g. Bug Fix"
						onkeydown={(e) => {
							if (e.key === 'Enter') submitCreate();
						}}
					/>
				</div>

				<div>
					<span class="label px-0 pb-1">
						<span class="label-text text-xs font-semibold">Icon</span>
					</span>
					<div class="flex max-h-28 flex-wrap gap-1 overflow-y-auto pr-1">
						{#each iconOptions as name (name)}
							{@const Icon = getTagIcon(name)}
							<button
								type="button"
								class="flex h-8 w-8 items-center justify-center rounded-lg border {newIcon === name ? 'border-primary bg-primary/15 text-primary' : 'border-base-300 hover:border-base-content/40'} bg-base-100"
								title={getTagIconLabel(name)}
								aria-label={getTagIconLabel(name)}
								onclick={() => {
									createIconTouched = true;
									newIcon = name;
								}}
						>
							<Icon size={16} />
						</button>
						{/each}
					</div>
				</div>

				<div>
					<span class="label px-0 pb-1">
						<span class="label-text text-xs font-semibold">Color</span>
					</span>
					<div class="flex flex-wrap items-center gap-1.5">
						{#each colorOptions as c (c)}
							<button
								type="button"
							class="h-6 w-6 rounded-full border-2 transition-transform {newColor === c ? 'scale-110 border-base-content' : 'border-transparent'}"
							style="background:{c}"
							aria-label={`Color ${c}`}
							onclick={() => {
								createColorTouched = true;
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
					<button class="btn btn-ghost btn-sm" onclick={() => (showCreate = false)}>Cancel</button>
					<button class="btn btn-primary btn-sm" onclick={submitCreate} disabled={!newTitle.trim() || createMutation.isPending}>
						{#if createMutation.isPending}<span class="loading loading-spinner loading-xs"></span>{/if}
						Create tag
					</button>
				</div>
			</div>
		{:else}
			<button class="btn btn-primary btn-sm" onclick={openCreate}>+ New tag</button>
		{/if}
	</div>

	<!-- List -->
	{#if tagsQuery.isLoading}
		<div class="flex justify-center py-8">
			<span class="loading loading-spinner loading-lg"></span>
		</div>
	{:else if tags.length === 0}
		<p class="text-sm italic text-base-content/50">No tags yet.</p>
	{:else}
		<ul class="space-y-2">
			{#each tags as tag (tag.id)}
				<li class="rounded-xl border border-base-300 p-3">
					{#if editingId === tag.id}
						<div class="space-y-2">
							<div>
								<label class="label px-0 pb-1" for="tag-manager-edit-title">
									<span class="label-text text-xs font-semibold">Title</span>
								</label>
								<input
									id="tag-manager-edit-title"
									type="text"
									bind:value={editTitle}
									class="input input-bordered input-sm w-full"
								/>
							</div>
							<div>
								<span class="label px-0 pb-1">
									<span class="label-text text-xs font-semibold">Icon</span>
								</span>
								<div class="flex max-h-24 flex-wrap gap-1 overflow-y-auto pr-1">
									{#each iconOptions as name (name)}
										{@const Icon = getTagIcon(name)}
										<button
											type="button"
											onclick={() => (editIcon = name)}
											class="flex h-7 w-7 items-center justify-center rounded-lg border {editIcon === name ? 'border-primary bg-primary/15 text-primary' : 'border-base-300 hover:border-base-content/40'} bg-base-100"
											title={getTagIconLabel(name)}
											aria-label={getTagIconLabel(name)}
										>
											<Icon size={14} />
										</button>
									{/each}
								</div>
							</div>
							<div>
								<span class="label px-0 pb-1">
									<span class="label-text text-xs font-semibold">Color</span>
								</span>
								<div class="flex flex-wrap items-center gap-1.5">
									{#each colorOptions as c (c)}
										<button
											type="button"
											class="h-5 w-5 rounded-full border-2 transition-transform {editColor === c ? 'scale-110 border-base-content' : 'border-transparent'}"
											style="background:{c}"
											aria-label={`Color ${c}`}
											onclick={() => (editColor = c)}
										></button>
									{/each}
								</div>
							</div>
							{#if editError}
								<p class="text-xs text-error">{editError}</p>
							{/if}
							<div class="flex justify-end gap-2">
								<button class="btn btn-ghost btn-sm" onclick={cancelEdit}>Cancel</button>
								<button class="btn btn-primary btn-sm" onclick={submitEdit} disabled={!editTitle.trim() || updateMutation.isPending}>
									{#if updateMutation.isPending}<span class="loading loading-spinner loading-xs"></span>{/if}
									Save
								</button>
							</div>
						</div>
					{:else}
						<div class="flex items-center justify-between gap-3">
							<div class="flex items-center gap-2 min-w-0">
								<TagChip tag={tag} size="sm" />
								<span class="text-xs text-base-content/50 font-mono">{tag.tag}</span>
							</div>
							<div class="flex items-center gap-1">
								<button class="btn btn-ghost btn-xs" onclick={() => startEdit(tag)}>Edit</button>
								<button class="btn btn-ghost btn-xs text-error" onclick={() => askDelete(tag)}>Delete</button>
							</div>
						</div>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
</div>

<!-- Delete confirmation -->
{#if deleteId != null}
	<div class="modal modal-open">
		<div class="modal-box">
			<h3 class="font-bold text-lg">Delete tag</h3>
			<p class="py-4">
				Delete “{deleteTitle}”? It will be removed from every time entry.
			</p>
			<div class="modal-action">
				<button class="btn btn-ghost" onclick={() => (deleteId = null)}>Cancel</button>
				<button class="btn btn-error" onclick={confirmDelete} disabled={deleteMutation.isPending}>
					{#if deleteMutation.isPending}<span class="loading loading-spinner loading-xs"></span>{/if}
					Delete
				</button>
			</div>
		</div>
	</div>
{/if}