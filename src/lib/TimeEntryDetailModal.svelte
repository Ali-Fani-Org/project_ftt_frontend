<script lang="ts">
	import type { TimeEntry, Tag } from './api';
	import TagChip from './TagChip.svelte';
	import TagPicker from './TagPicker.svelte';
	import { createEventDispatcher } from 'svelte';
	import { network } from './network';
	import { createEditableEntryHandlers, type EditableEntryStateUpdate } from './editableEntry';
	import { useUpdateTimeEntryMutation } from './queries/timeEntries';

	const updateMutation = useUpdateTimeEntryMutation();

	const dispatch = createEventDispatcher();

	interface Props {
		entry: TimeEntry | null;
	}

	let { entry = $bindable(null) }: Props = $props();

	// Edit mode state
	let isEditingTitle = $state(false);
	let isEditingDescription = $state(false);
	let editedTitle = $state('');
	let editedDescription = $state('');
	let isSavingEdit = $state(false);
	let editError = $state('');
	let isEditingTags = $state(false);
	let tagSaveError = $state('');
	let selectedTagIds: number[] = $state([]);

	// Create handlers using the reusable utility
	const editHandlers = createEditableEntryHandlers({
		getState: () => ({ isEditingTitle, isEditingDescription, editedTitle, editedDescription, isSaving: isSavingEdit, editError }),
		setState: (updates: EditableEntryStateUpdate) => {
			if ('isEditingTitle' in updates && updates.isEditingTitle !== undefined) isEditingTitle = updates.isEditingTitle;
			if ('isEditingDescription' in updates && updates.isEditingDescription !== undefined) isEditingDescription = updates.isEditingDescription;
			if ('editedTitle' in updates && updates.editedTitle !== undefined) editedTitle = updates.editedTitle;
			if ('editedDescription' in updates && updates.editedDescription !== undefined) editedDescription = updates.editedDescription;
			if ('isSaving' in updates && updates.isSaving !== undefined) isSavingEdit = updates.isSaving;
			if ('editError' in updates && updates.editError !== undefined) editError = updates.editError;
		},
		getEntry: () => entry,
		setEntry: (updatedEntry) => { entry = updatedEntry; },
		onUpdate: (id, data) => updateMutation.mutateAsync({ id, data }),
		onUpdateSuccess: (updatedEntry) => {
			dispatch('updated', { entry: updatedEntry });
		},
		isOnline: () => $network.isOnline
	});

	function formatDate(dateStr: string): string {
		const date = new Date(dateStr);
		const options: Intl.DateTimeFormatOptions = {
			weekday: 'short',
			year: 'numeric',
			month: 'short',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		};
		return date.toLocaleDateString('en-US', options);
	}

	function formatTime(dateStr: string): string {
		const date = new Date(dateStr);
		return date.toLocaleTimeString('en-US', {
			hour: '2-digit',
			minute: '2-digit',
			hour12: true
		});
	}

	function formatDateOnly(dateStr: string): string {
		const date = new Date(dateStr);
		return date.toLocaleDateString('en-US', {
			weekday: 'short',
			year: 'numeric',
			month: 'short',
			day: 'numeric'
		});
	}

	function formatDuration(duration: string | null): string {
		if (!duration) return 'Active';
		// Duration is now in seconds as string (e.g., "8.0", "127172.0")
		const totalSeconds = parseInt(duration, 10) || 0;
		const hours = Math.floor(totalSeconds / 3600);
		const minutes = Math.floor((totalSeconds % 3600) / 60);
		const seconds = totalSeconds % 60;
		if (hours > 0) {
			return `${hours}h ${minutes}m ${seconds}s`;
		}
		return `${minutes}m ${seconds}s`;
	}

	function getStatusBadge(entry: TimeEntry) {
		if (entry.is_active) {
			return { text: 'Active', class: 'badge-success' };
		} else {
			return { text: 'Completed', class: 'badge-neutral' };
		}
	}

	function close() {
		// Reset edit state on close
		editHandlers.cancelEditing();
		dispatch('close');
	}

	// Destructure handlers for use in template
	const { startEditingTitle, startEditingDescription, cancelEditing, saveTitle, saveDescription } = editHandlers;

	async function startEditTags() {
		selectedTagIds = entry?.tags.map((t: Tag) => t.id) ?? [];
		isEditingTags = true;
		tagSaveError = '';
	}

	async function saveTags() {
		if (!entry || !$network.isOnline) return;
		tagSaveError = '';
		try {
			await updateMutation.mutateAsync({ id: entry.id, data: { tags: selectedTagIds } });
			isEditingTags = false;
		} catch {
			tagSaveError = 'Failed to save tags.';
		}
	}
</script>

{#if entry}
	<div class="modal modal-open">
		<div class="modal-box max-w-5xl w-11/12">
			<!-- Header -->
			<div class="flex items-start justify-between mb-6">
				<div class="flex-1 mr-4">
					<!-- Editable Title -->
					{#if isEditingTitle}
						<div class="flex items-center gap-2">
							<input
								type="text"
								bind:value={editedTitle}
								class="input input-bordered input-lg text-2xl font-bold flex-1 {isSavingEdit ? 'opacity-50 cursor-wait' : ''}"
								placeholder="Task title"
								disabled={isSavingEdit}
								onkeydown={(e) => {
									if (e.key === 'Enter') saveTitle();
									if (e.key === 'Escape') cancelEditing();
								}}
							/>
							<button
								class="btn btn-primary btn-circle"
								onclick={saveTitle}
								disabled={isSavingEdit || !editedTitle.trim()}
							>
								{#if isSavingEdit}
									<span class="loading loading-spinner loading-sm"></span>
								{:else}
									<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
									</svg>
								{/if}
							</button>
							<button
								class="btn btn-ghost btn-circle"
								aria-label="Cancel editing"
								onclick={cancelEditing}
								disabled={isSavingEdit}
							>
								<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
								</svg>
							</button>
						</div>
					{:else}
						<div class="flex items-center gap-2">
							<h3 class="font-bold text-3xl text-primary">{entry.title}</h3>
							{#if $network.isOnline}
								<button
									class="btn btn-ghost btn-sm btn-circle"
									onclick={startEditingTitle}
									title="Edit title"
									aria-label="Edit title"
								>
									<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path>
									</svg>
								</button>
							{/if}
						</div>
					{/if}
					<div class="flex items-center gap-4 mt-2">
						{#if entry}
							{@const status = getStatusBadge(entry)}
							<span class="badge {status.class} badge-lg">
								{status.text}
							</span>
						{/if}
					</div>
				</div>
				<button class="btn btn-sm btn-circle btn-ghost" onclick={close}> ✕ </button>
			</div>

			<!-- Error Message -->
			{#if editError}
				<div class="alert alert-error mb-4">
					<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path>
					</svg>
					<span>{editError}</span>
				</div>
			{/if}

			<!-- Main Content with Sidebar -->
			<div class="flex gap-8">
				<!-- Left Column - Description and Additional Info -->
				<div class="flex-1 space-y-6">
					<!-- Description Section (Editable) -->
					<div class="card bg-base-200">
						<div class="card-body">
							<h4 class="font-semibold text-xl mb-4 flex items-center gap-2">
								<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
									></path>
								</svg>
								Description
								{#if !isEditingDescription && $network.isOnline}
									<button
										class="btn btn-ghost btn-xs btn-circle ml-auto"
										onclick={startEditingDescription}
										title="Edit description"
										aria-label="Edit description"
									>
										<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
											<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path>
										</svg>
									</button>
								{/if}
							</h4>
							{#if isEditingDescription}
								<div class="space-y-3">
									<textarea
										bind:value={editedDescription}
										class="textarea textarea-bordered w-full {isSavingEdit ? 'opacity-50 cursor-wait' : ''}"
										placeholder="Add a description..."
										rows="4"
										disabled={isSavingEdit}
										onkeydown={(e) => {
											if (e.key === 'Enter' && e.ctrlKey) saveDescription();
											if (e.key === 'Escape') cancelEditing();
										}}
									></textarea>
									<div class="flex gap-2">
										<button
											class="btn btn-primary btn-sm"
											onclick={saveDescription}
											disabled={isSavingEdit}
										>
											{#if isSavingEdit}
												<span class="loading loading-spinner loading-sm"></span>
											{:else}
												<svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
													<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
												</svg>
												Save
											{/if}
										</button>
										<button
											class="btn btn-ghost btn-sm"
											onclick={cancelEditing}
											disabled={isSavingEdit}
										>
											Cancel
										</button>
									</div>
								</div>
							{:else}
								{#if entry.description}
									<div class="prose prose-base max-w-none">
										<p class="text-base-content/80 leading-relaxed text-lg">{entry.description}</p>
									</div>
								{:else}
									<p class="text-base-content/50 italic">No description added</p>
								{/if}
							{/if}
						</div>
					</div>

					<!-- Tags Section -->
					<div class="card bg-base-200">
						<div class="card-body">
							<h4 class="font-semibold text-lg mb-3 flex items-center gap-2">
								<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"
									></path>
								</svg>
								Tags
								{#if !isEditingTags && $network.isOnline}
									<button
										class="btn btn-ghost btn-xs btn-circle ml-auto"
										onclick={startEditTags}
										title="Edit tags"
										aria-label="Edit tags"
									>
										<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
											<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path>
										</svg>
									</button>
								{/if}
							</h4>
							{#if isEditingTags}
								<TagPicker bind:value={selectedTagIds} allowCreate={false} />
								{#if tagSaveError}
									<p class="text-xs text-error mt-2">{tagSaveError}</p>
								{/if}
								<div class="flex gap-2 mt-3">
									<button class="btn btn-primary btn-sm" onclick={saveTags} disabled={!$network.isOnline}>
										Save tags
									</button>
									<button class="btn btn-ghost btn-sm" onclick={() => (isEditingTags = false)}>Cancel</button>
								</div>
							{:else}
								{#if entry.tags && entry.tags.length > 0}
									<div class="flex flex-wrap gap-2">
										{#each entry.tags as tag (tag.id)}
											{#if typeof tag === 'string'}
												<span class="badge badge-outline badge-lg">{tag}</span>
											{:else}
												<TagChip tag={tag} size="sm" />
											{/if}
										{/each}
									</div>
								{:else}
									<p class="text-base-content/50 italic text-sm">No tags</p>
								{/if}
							{/if}
						</div>
					</div>
				</div>

				<!-- Right Sidebar - Details -->
				<div class="w-80 space-y-4">
					<!-- Project Information -->
					<div class="card bg-base-200">
						<div class="card-body">
							<h4 class="font-semibold text-lg mb-3 flex items-center gap-2">
								<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
									></path>
								</svg>
								Project Info
							</h4>
							<div class="space-y-3">
								<div>
									<span class="text-sm text-base-content/60">Project Name</span>
									<div class="font-semibold text-primary text-lg">{entry.project}</div>
								</div>
							</div>
						</div>
					</div>

					<!-- Time Details -->
					<div class="card bg-base-200">
						<div class="card-body">
							<h4 class="font-semibold text-lg mb-3 flex items-center gap-2">
								<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
									></path>
								</svg>
								Time Details
							</h4>
							<div class="space-y-4">
								<div>
									<span class="text-sm text-base-content/60">Start Time</span>
									<div class="font-mono text-sm bg-base-300 rounded px-2 py-1 mt-1">
										{formatDate(entry.start_time)}
									</div>
									<div class="text-xs text-base-content/50 mt-1">
										{formatTime(entry.start_time)}
									</div>
								</div>

								{#if entry.end_time}
									<div>
										<span class="text-sm text-base-content/60">End Time</span>
										<div class="font-mono text-sm bg-base-300 rounded px-2 py-1 mt-1">
											{formatDate(entry.end_time)}
										</div>
										<div class="text-xs text-base-content/50 mt-1">
											{formatTime(entry.end_time)}
										</div>
									</div>
								{/if}

								<div class="border-t border-base-300 pt-3">
									<span class="text-sm text-base-content/60">Duration</span>
									<div class="font-mono text-xl font-semibold text-primary mt-1">
										{formatDuration(entry.duration)}
									</div>
								</div>
							</div>
						</div>
					</div>

					<!-- Entry Details -->
					<div class="card bg-base-200">
						<div class="card-body">
							<h4 class="font-semibold text-lg mb-3 flex items-center gap-2">
								<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
									></path>
								</svg>
								Entry Details
							</h4>
							<div class="space-y-3">
								<div>
									<span class="text-sm text-base-content/60">Entry ID</span>
									<div class="font-mono text-sm">{entry.id}</div>
								</div>

								<div>
									<span class="text-sm text-base-content/60">User</span>
									<div class="font-medium">{entry.user}</div>
								</div>

								<div>
									<span class="text-sm text-base-content/60">Status</span>
									<div class="flex items-center gap-2 mt-1">
										{#if entry}
											{@const status = getStatusBadge(entry)}
											<span class="badge {status.class}">
												{status.text}
											</span>
										{/if}
									</div>
								</div>
							</div>
						</div>
					</div>
				</div>
			</div>

			<!-- Active Entry Alert -->
			{#if entry.is_active}
				<div class="mt-6">
					<div class="alert alert-info">
						<svg class="w-6 h-6 stroke-current shrink-0 stroke-2" fill="none" viewBox="0 0 24 24">
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
							></path>
						</svg>
						<span>This time entry is currently active</span>
					</div>
				</div>
			{/if}

			<!-- Offline Warning -->
			{#if !$network.isOnline}
				<div class="mt-4">
					<div class="alert alert-warning">
						<svg class="w-6 h-6 stroke-current shrink-0 stroke-2" fill="none" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path>
						</svg>
						<span>You are offline. Editing is disabled.</span>
					</div>
				</div>
			{/if}

			<!-- Modal Actions -->
			<div class="modal-action">
				<button class="btn btn-primary" onclick={close}>Close</button>
			</div>
		</div>
	</div>
{/if}
