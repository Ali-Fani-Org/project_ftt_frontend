<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { get } from 'svelte/store';
	import { goto } from '$app/navigation';
	import PageHeader from '$lib/PageHeader.svelte';
	import SettingToggle from '$lib/settings/SettingToggle.svelte';
	import { Timer as TimerIcon } from '@jis3r/icons';
	import logger from '$lib/logger';
	import {
		authToken,
		user,
		timeEntriesDisplayMode,
		timerRefreshInterval,
		autoRefreshEnabled
	} from '$lib/stores';
	import { parseErrorResponse, type Project, type Tag, type TimeEntry } from '$lib/api';
	import { preventDefault } from '$lib/commands.svelte';
	import TasksModal from '$lib/TasksModal.svelte';
	import type { PageData } from './$types';
	import { network } from '$lib/network';
	import { createEditableEntryHandlers, type EditableEntryStateUpdate } from '$lib/editableEntry';
	import TagPicker from '$lib/TagPicker.svelte';
	import TagChip from '$lib/TagChip.svelte';
	import ProjectPicker from '$lib/ProjectPicker.svelte';
	import {
		useProjects,
		useActiveTimer,
		useTodaySessions,
		useRecentEntriesForSuggestions,
		useStartTimerMutation,
		useUpdateTimeEntryMutation,
		useStopTimerMutation
	} from '$lib/queries/timeEntries';
	import { queryClient } from '$lib/queryClient';
	import { createHotkey } from '@tanstack/svelte-hotkeys';
	import { queryKeys } from '$lib/queries/keys';

	// Get any data loaded on server (may be empty)
	const { data } = $props<{ data: PageData }>();

	// Server state via TanStack Query — shared cache + automatic revalidation
	const projectsQuery = useProjects();
	const activeQuery = useActiveTimer(() => ({
		refetchInterval: $autoRefreshEnabled ? $timerRefreshInterval || 30000 : false
	}));
	const todayQuery = useTodaySessions(() => ({
		refetchInterval: $autoRefreshEnabled ? $timerRefreshInterval || 30000 : false
	}));
	const startTimerMutation = useStartTimerMutation();
	const stopTimerMutation = useStopTimerMutation();
	const updateEntryMutation = useUpdateTimeEntryMutation();

	// One-time initialization from the server-loaded page data; later errors are
	// set explicitly in the handlers, so the initial read is intentionally untracked.
	let error = $state(untrack(() => data.error || ''));
	let projectsList = $derived(projectsQuery.data ?? []);
	let loadingProjects = $derived(projectsQuery.isPending);
	let activeEntry = $derived<TimeEntry | null>(activeQuery.data ?? null);
	let loadingActiveEntry = $derived(activeQuery.isPending);
	let todaySessions = $derived<TimeEntry[]>(todayQuery.data ?? []);
	let loadingTodaySessions = $derived(todayQuery.isPending);

	// --- Title-based project/tag suggestions -----------------------------------
	// As the user types a task title, surface the most-used project + tags from
	// similar past entries (client-side token matching over recent history).
	const suggestionQuery = useRecentEntriesForSuggestions();
	const recentEntries = $derived(suggestionQuery.data ?? []);

	// id -> Tag map collected from recent entries (no extra query needed).
	const tagById = $derived.by(() => {
		const map = new Map<number, Tag>();
		for (const entry of recentEntries) {
			for (const tag of entry.tags) {
				if (!map.has(tag.id)) map.set(tag.id, tag);
			}
		}
		return map;
	});

	function tokenizeTitle(t: string): string[] {
		return t
			.toLowerCase()
			.split(/[^a-z0-9]+/)
			.filter((w) => w.length >= 2);
	}

	// A typed token matches a title token when one starts with the other
	// (e.g. "deploy" -> "deployment", "redesign" -> "redesign").
	function tokenMatch(typed: string, titleWord: string): boolean {
		return titleWord.startsWith(typed) || typed.startsWith(titleWord);
	}

	interface TitleSuggestion {
		projectId: number | null;
		projectName: string;
		tagIds: number[];
	}

	const titleSuggestions = $derived.by<TitleSuggestion | null>(() => {
		const typed = title.trim();
		if (typed.length < 3) return null;
		const tokens = tokenizeTitle(typed);
		if (tokens.length === 0) return null;

		const scored = recentEntries
			.map((entry) => {
				const titleTokens = tokenizeTitle(entry.title);
				const matched = tokens.filter((t) => titleTokens.some((w) => tokenMatch(t, w))).length;
				return { entry, score: matched / tokens.length };
			})
			.filter((x) => x.score >= 0.5)
			.sort((a, b) => b.score - a.score || (a.entry.start_time < b.entry.start_time ? 1 : -1))
			.slice(0, 5);
		if (scored.length === 0) return null;

		const projectCounts = new Map<string, number>();
		for (const { entry } of scored) {
			projectCounts.set(entry.project, (projectCounts.get(entry.project) ?? 0) + 1);
		}
		const projectName = [...projectCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
		const projectId = projectsList.find((p) => p.title === projectName)?.id ?? null;

		const tagCounts = new Map<number, number>();
		for (const { entry } of scored) {
			for (const tag of entry.tags) tagCounts.set(tag.id, (tagCounts.get(tag.id) ?? 0) + 1);
		}
		const tagIds = [...tagCounts.entries()]
			.sort((a, b) => b[1] - a[1])
			.slice(0, 3)
			.map(([id]) => id);

		return { projectId, projectName, tagIds };
	});

	function applyProjectSuggestion(id: number | null) {
		selectedProject = selectedProject === id ? null : id;
		suggestionFocus = null;
	}

	function toggleTagSuggestion(id: number) {
		selectedTags = selectedTags.includes(id)
			? selectedTags.filter((t) => t !== id)
			: [...selectedTags, id];
		suggestionFocus = null;
	}

	// --- Keyboard navigation for the suggestion chips (TanStack Hotkeys) -------
	// While typing in the title field: ←/→ highlight a chip, Enter applies it,
	// Esc clears the highlight. Scoped to the input via {@attach}; single keys
	// need ignoreInputs: false so they fire inside the text input.
	let suggestionFocus = $state<number | null>(null);
	let titleInputFocused = $state(false);

	interface SuggestionChip {
		kind: 'project' | 'tag';
		id: number | null;
	}

	const suggestionChips = $derived.by<SuggestionChip[]>(() => {
		if (!titleSuggestions) return [];
		const chips: SuggestionChip[] = [];
		if (titleSuggestions.projectId !== null && titleSuggestions.projectName) {
			chips.push({ kind: 'project', id: titleSuggestions.projectId });
		}
		for (const tagId of titleSuggestions.tagIds) chips.push({ kind: 'tag', id: tagId });
		return chips;
	});

	// Reset the highlight whenever the typed title (and thus the chips) change.
	$effect(() => {
		title;
		suggestionFocus = null;
	});

	const suggestionHotkeysActive = () =>
		titleInputFocused && $network.isOnline && !!titleSuggestions && suggestionChips.length > 0;

	function applyFocusedSuggestion() {
		if (suggestionFocus === null || suggestionFocus >= suggestionChips.length) return;
		const chip = suggestionChips[suggestionFocus];
		if (chip.kind === 'project') {
			applyProjectSuggestion(chip.id);
		} else if (chip.id !== null) {
			toggleTagSuggestion(chip.id);
		}
		suggestionFocus = null;
	}

	const suggestionNavLeft = createHotkey(
		'ArrowLeft',
		() => {
			const n = suggestionChips.length;
			if (n === 0) return;
			suggestionFocus = suggestionFocus === null ? n - 1 : (suggestionFocus - 1 + n) % n;
		},
		() => ({ enabled: suggestionHotkeysActive(), ignoreInputs: false })
	);

	const suggestionNavRight = createHotkey(
		'ArrowRight',
		() => {
			const n = suggestionChips.length;
			if (n === 0) return;
			suggestionFocus = suggestionFocus === null ? 0 : (suggestionFocus + 1) % n;
		},
		() => ({ enabled: suggestionHotkeysActive(), ignoreInputs: false })
	);

	const suggestionApply = createHotkey(
		'Enter',
		() => applyFocusedSuggestion(),
		() => ({
			enabled: suggestionHotkeysActive() && suggestionFocus !== null,
			ignoreInputs: false
		})
	);

	const suggestionDismiss = createHotkey(
		'Escape',
		() => {
			suggestionFocus = null;
		},
		() => ({ enabled: suggestionHotkeysActive(), ignoreInputs: false })
	);

	// Keep the ticking timer in sync with the query-driven active entry
	// (starts when a timer appears, stops when it disappears — e.g. stopped externally)
	$effect(() => {
		if (activeEntry) {
			if (!timerInterval) startTimer();
		} else if (timerInterval) {
			clearInterval(timerInterval);
			timerInterval = null;
			elapsed = 0;
		}
	});

	// Form data
	let title = $state('');
	let description = $state('');
	let selectedProject = $state<number | null>(null);
	let selectedTags: number[] = $state([]);
	let isStartingTimer = $state(false);

	// Custom start time state (60-minute buffer feature)
	let useCustomStartTime = $state(false);
	let now = $state(new Date());
	let sliderMinutesAgo = $state(0); // Track slider position separately for consistent UI
	let lastCustomStartTickLogMs = $state(0);
	let customStartTime = $derived(
		useCustomStartTime ? new Date(now.getTime() - sliderMinutesAgo * 60 * 1000) : null
	);
	let startTimeValidationError = $state<string | null>(null);
	const MAX_START_TIME_PAST_MINUTES = 60; // Maximum minutes in the past for start time

	$effect(() => {
		if (!useCustomStartTime) return;
		const intervalId = setInterval(() => {
			now = new Date();
			const nowMs = now.getTime();
			if (nowMs - lastCustomStartTickLogMs >= 10_000) {
				lastCustomStartTickLogMs = nowMs;
				logger.debug('[timer] custom start time tick', {
					now: now.toISOString(),
					sliderMinutesAgo,
					customStartTime: customStartTime?.toISOString() ?? null
				});
			}
		}, 1000);
		return () => clearInterval(intervalId);
	});

	$effect(() => {
		if (!useCustomStartTime) {
			startTimeValidationError = null;
			return;
		}
		if (!customStartTime) {
			startTimeValidationError = null;
			return;
		}
		const validation = validateStartTime(customStartTime, now);
		startTimeValidationError = validation.valid ? null : validation.error || null;
		logger.debug('[timer] custom start time validation', {
			now: now.toISOString(),
			sliderMinutesAgo,
			customStartTime: customStartTime.toISOString(),
			valid: validation.valid,
			error: validation.error ?? null
		});
	});

	// Edit mode state for active entry
	let isEditingTitle = $state(false);
	let isEditingDescription = $state(false);
	let editedTitle = $state('');
	let editedDescription = $state('');
	let isSavingEdit = $state(false);
	let editError = $state('');

	// Create edit handlers using the reusable utility
	const editHandlers = createEditableEntryHandlers({
		getState: () => ({
			isEditingTitle,
			isEditingDescription,
			editedTitle,
			editedDescription,
			isSaving: isSavingEdit,
			editError
		}),
		setState: (updates: EditableEntryStateUpdate) => {
			if ('isEditingTitle' in updates && updates.isEditingTitle !== undefined)
				isEditingTitle = updates.isEditingTitle;
			if ('isEditingDescription' in updates && updates.isEditingDescription !== undefined)
				isEditingDescription = updates.isEditingDescription;
			if ('editedTitle' in updates && updates.editedTitle !== undefined)
				editedTitle = updates.editedTitle;
			if ('editedDescription' in updates && updates.editedDescription !== undefined)
				editedDescription = updates.editedDescription;
			if ('isSaving' in updates && updates.isSaving !== undefined) isSavingEdit = updates.isSaving;
			if ('editError' in updates && updates.editError !== undefined) editError = updates.editError;
		},
		getEntry: () => activeEntry,
		setEntry: (updatedEntry) => {
			queryClient.setQueryData(queryKeys.timeEntries.active, updatedEntry);
		},
		onUpdate: (id, data) => updateEntryMutation.mutateAsync({ id, data }),
		onUpdateSuccess: (updatedEntry) => {
			// Reflect in the query cache; lists revalidate via the mutation's invalidation.
			queryClient.setQueryData(queryKeys.timeEntries.active, updatedEntry);
		},
		isOnline: () => $network.isOnline
	});

	// Tag editing state for the active entry (mirrors TimeEntryDetailModal)
	let isEditingTags = $state(false);
	let selectedTagIds: number[] = $state([]);
	let tagSaveError = $state('');

	function startEditTags(): void {
		if (!activeEntry || !$network.isOnline) return;
		selectedTagIds = (activeEntry.tags ?? []).map((t) => t.id);
		isEditingTags = true;
		tagSaveError = '';
	}

	async function saveTags(): Promise<void> {
		if (!activeEntry || !$network.isOnline) return;
		tagSaveError = '';
		try {
			await updateEntryMutation.mutateAsync({
				id: activeEntry.id,
				data: { tags: selectedTagIds }
			});
			isEditingTags = false;
		} catch {
			tagSaveError = 'Failed to save tags.';
		}
	}

	// Timer
	let elapsed = $state(0);
	let timerInterval = $state<ReturnType<typeof setInterval> | null>(null);

	// Tasks modal
	let showTasksModal = $state(false);

	// Last server update timestamp

	// Projects refresh debounce state
	let lastProjectsRefreshTime = $state<number>(0);
	const PROJECTS_REFRESH_DEBOUNCE_MS = 5000; // 5 seconds minimum between refreshes

	/**
	 * Handler for project dropdown open event
	 * Triggers a revalidation of projects when the dropdown is opened
	 * Uses debouncing to prevent excessive refetches
	 */
	function onProjectDropdownOpen() {
		const now = Date.now();
		// Only refresh if enough time has passed since last refresh
		if (now - lastProjectsRefreshTime > PROJECTS_REFRESH_DEBOUNCE_MS) {
			console.log('Project dropdown opened, refreshing projects...');
			lastProjectsRefreshTime = now;
			void queryClient.invalidateQueries({ queryKey: queryKeys.projects });
		} else {
			console.log('Skipping projects refresh - too soon since last refresh');
		}
	}

	onMount(() => {
		console.log('Timer onMount started at', new Date().toISOString());

		// Run the async setup, but return the cleanup function synchronously
		// so onMount's return type stays `() => void`.
		void (async () => {
			const token = get(authToken);
			if (!token) {
				goto('/');
				return;
			}

			// Listen for events from Tauri
			if (typeof window !== 'undefined' && (window as any).__TAURI__) {
				const { listen, emit } = await import('@tauri-apps/api/event');
				listen('stop-timer', (event) => {
					console.log('Received stop-timer event from tray:', event);
					onStopTimer();
				});

				listen('request-timer-state', (event) => {
					console.log('Received request-timer-state event from tray:', event);
					// Respond with current timer state
					const timerState = activeEntry
						? {
								active: true,
								title: activeEntry.title,
								start_time: activeEntry.start_time
							}
						: {
								active: false,
								title: null
							};
					console.log('Sending timer state response:', timerState);
					emit('timer-state-response', timerState);
				});
			}
		})();

		// Cleanup function for onMount
		return () => {
			// Clean up timer interval to prevent memory leak
			if (timerInterval) {
				clearInterval(timerInterval);
				timerInterval = null;
			}
		};
	});

	function startTimer() {
		// Clear any existing interval first to prevent multiple concurrent intervals
		if (timerInterval) {
			clearInterval(timerInterval);
			timerInterval = null;
		}
		if (activeEntry) {
			const startTime = new Date(activeEntry.start_time).getTime();
			elapsed = Math.floor((Date.now() - startTime) / 1000);
			timerInterval = setInterval(() => {
				elapsed = Math.floor((Date.now() - startTime) / 1000);
			}, 1000);
		}
	}

	function formatTime(seconds: number): string {
		const hours = Math.floor(seconds / 3600);
		const minutes = Math.floor((seconds % 3600) / 60);
		const secs = seconds % 60;
		return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
	}

	/**
	 * Validate the selected start time
	 * @param selectedTime - The selected start time to validate
	 * @param referenceTime - Optional reference time (defaults to now). Must be the same time used for calculation to avoid timing issues.
	 * @returns Object with valid flag and optional error message
	 */
	function validateStartTime(
		selectedTime: Date,
		referenceTime: Date = new Date()
	): { valid: boolean; error?: string } {
		const diffMs = referenceTime.getTime() - selectedTime.getTime();
		const diffMinutes = diffMs / (1000 * 60);

		// Check if in the future
		if (diffMs < 0) {
			return { valid: false, error: 'Start time cannot be in the future.' };
		}

		// Check if more than 60 minutes in the past
		if (diffMinutes > MAX_START_TIME_PAST_MINUTES) {
			return {
				valid: false,
				error: `Start time cannot be more than ${MAX_START_TIME_PAST_MINUTES} minutes in the past.`
			};
		}

		return { valid: true };
	}

	/**
	 * Set custom start time to a specific number of minutes ago
	 */
	function setStartTimeMinutesAgo(minutes: number) {
		sliderMinutesAgo = minutes; // Update slider position to match
	}

	/**
	 * Handle slider change for minutes ago
	 */
	function onSliderChange(event: Event) {
		const target = event.target;
		if (target instanceof HTMLInputElement) {
			const minutes = parseInt(target.value, 10);
			if (!isNaN(minutes)) {
				setStartTimeMinutesAgo(minutes);
			}
		}
	}

	/**
	 * Toggle custom start time and initialize to current time
	 */
	function toggleCustomStartTime() {
		useCustomStartTime = !useCustomStartTime;
		if (useCustomStartTime) {
			// Always re-initialize to current time when enabling
			// This prevents stale time values from previous toggles
			now = new Date();
			sliderMinutesAgo = 0; // Reset slider to "now"
			startTimeValidationError = null;
		}
	}

	const onStartTimer = preventDefault(async () => {
		if (!selectedProject || !title) return;

		// Check if online before starting timer
		if (!$network.isOnline) {
			error = 'Cannot start timer while offline. Please check your internet connection.';
			return;
		}

		// Validate custom start time if enabled
		if (useCustomStartTime && customStartTime) {
			now = new Date();
			const validation = validateStartTime(customStartTime, now);
			logger.debug('[timer] submit validation', {
				now: now.toISOString(),
				sliderMinutesAgo,
				customStartTime: customStartTime.toISOString(),
				valid: validation.valid,
				error: validation.error ?? null
			});
			if (!validation.valid) {
				startTimeValidationError = validation.error || 'Invalid start time';
				return;
			}
		}

		try {
			isStartingTimer = true;

			// Build the payload
			const payload: {
				title: string;
				description: string;
				project: number;
				start_time?: string;
				tags?: number[];
			} = {
				title,
				description,
				project: selectedProject,
				tags: selectedTags
			};

			// Add custom start time if enabled
			if (useCustomStartTime && customStartTime) {
				payload.start_time = customStartTime.toISOString();
				logger.debug('[timer] starting timer with custom start time', {
					start_time: payload.start_time
				});
			}

			const startedEntry = await startTimerMutation.mutateAsync(payload);
			startTimer();
			error = ''; // Clear any previous failure so the page UI returns

			// Emit event to Tauri
			if (typeof window !== 'undefined' && (window as any).__TAURI__) {
				const { emit } = await import('@tauri-apps/api/event');
				console.log('Emitting timer-started event:', startedEntry.title);
				await emit('timer-started', {
					title: startedEntry.title,
					start_time: startedEntry.start_time
				});
			}

			// Reset form but keep the state for the new layout
			title = '';
			description = '';
			selectedProject = null;
			selectedTags = [];
			isStartingTimer = false;
			// Reset custom start time state
			useCustomStartTime = false;
			sliderMinutesAgo = 0;
			now = new Date();
			startTimeValidationError = null;
		} catch (err: any) {
			// Handle API validation errors (400 Bad Request)
			if (err?.response?.status === 400) {
				try {
					// Use the reusable error parsing utility
					const errorData = await parseErrorResponse(err.response);

					// Extract specific error messages from the API response
					// API returns errors in Django REST framework format:
					// - Field-specific errors: { "start_time": ["error message"] }
					// - Non-field errors: { "non_field_errors": ["error message"] }
					if (errorData?.start_time) {
						startTimeValidationError = Array.isArray(errorData.start_time)
							? errorData.start_time[0]
							: errorData.start_time;
					} else if (errorData?.non_field_errors) {
						error = Array.isArray(errorData.non_field_errors)
							? errorData.non_field_errors[0]
							: errorData.non_field_errors;
					} else {
						error = 'Failed to start timer';
					}
				} catch (parseError) {
					// If we can't parse the error response, log and show a generic message
					console.error('Could not parse error response:', parseError, err);
					error = 'Failed to start timer';
				}
			} else {
				console.error('Failed to start timer:', err);
				error = 'Failed to start timer';
			}
			isStartingTimer = false;
		}
	});

	const onStopTimer = async () => {
		if (!activeEntry) return;

		// Check if online before stopping timer
		if (!$network.isOnline) {
			error = 'Cannot stop timer while offline. Please check your internet connection.';
			return;
		}

		try {
			await stopTimerMutation.mutateAsync(activeEntry.id);
			error = ''; // Clear any previous failure so the page UI returns

			// Emit event to Tauri
			if (typeof window !== 'undefined' && (window as any).__TAURI__) {
				const { emit } = await import('@tauri-apps/api/event');
				console.log('Emitting timer-stopped event');
				await emit('timer-stopped', {});
			}
		} catch (err) {
			error = 'Failed to stop timer';
		}
	};

	// Destructure edit handlers for use in template
	const { startEditingTitle, startEditingDescription, cancelEditing, saveTitle, saveDescription } =
		editHandlers;

	const openTimeEntries = async () => {
		console.log('openTimeEntries called, mode:', get(timeEntriesDisplayMode));
		const mode = get(timeEntriesDisplayMode);

		if (mode === 'modal') {
			console.log('Opening tasks in modal');
			showTasksModal = true;
			return;
		}

		// Default to window/tab mode
		try {
			const { getCurrentWindow } = await import('@tauri-apps/api/window');
			getCurrentWindow(); // Test if running in Tauri
			console.log('Detected Tauri environment, opening new window');
			const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');
			console.log('WebviewWindow imported successfully');
			// Windows uses the custom frontend titlebar (decorations:false); macOS
			// and Linux keep the native OS-drawn chrome.
			let useCustomTitlebar = true;
			try {
				const os = await import('@tauri-apps/plugin-os');
				useCustomTitlebar = os.platform() === 'windows';
			} catch {
				useCustomTitlebar = false;
			}
			const webview = new WebviewWindow('time-entries', {
				url: `${window.location.origin}/entries`,
				title: 'Time Entries',
				width: 1000,
				height: 700,
				resizable: true,
				decorations: !useCustomTitlebar,
				fullscreen: false,
				contentProtected: true
			});
			console.log('WebviewWindow created:', webview);
		} catch {
			console.log('Web environment, opening new tab');
			window.open('/entries', '_blank');
		}
	};
</script>

<div class="container mx-auto p-4 lg:p-8 max-w-7xl">
	<!-- Page Header -->
	<div class="mb-8">
		<PageHeader icon={TimerIcon} title="Timer" subtitle="Track your time with precision" />
	</div>

	{#if loadingProjects}
		<div class="flex justify-center items-center min-h-[50vh]">
			<span class="loading loading-spinner loading-lg"></span>
		</div>
	{:else if error}
		<div class="alert alert-error mb-6">
			<span>{error}</span>
		</div>
	{:else if loadingActiveEntry}
		<div class="card bg-base-200 shadow-xl mb-8">
			<div class="card-body">
				<h2 class="card-title">Checking for active timer...</h2>
				<div class="flex justify-center">
					<span class="loading loading-spinner loading-lg"></span>
				</div>
			</div>
		</div>
	{:else}
		<!-- Timer Section (Full Width) -->
		<div class="mb-6">
			{#if activeEntry || isStartingTimer}
				<div class="card bg-base-100 shadow-xl">
					<div class="card-body items-center text-center space-y-6">
						<!-- Status at top -->
						<p class="text-base-content/70 text-sm font-normal leading-normal">
							{activeEntry ? 'In Progress' : 'Starting...'}
						</p>

						{#if activeEntry}
							<!-- Task Title (Editable) -->
							<div class="w-full max-w-md">
								{#if isEditingTitle}
									<div class="flex items-center gap-2">
										<input
											type="text"
											bind:value={editedTitle}
											class="input input-bordered input-lg text-center text-xl font-bold flex-1 {isSavingEdit
												? 'opacity-50 cursor-wait'
												: ''}"
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
													<path
														stroke-linecap="round"
														stroke-linejoin="round"
														stroke-width="2"
														d="M5 13l4 4L19 7"
													></path>
												</svg>
											{/if}
										</button>
										<button
											class="btn btn-ghost btn-circle"
											onclick={cancelEditing}
											disabled={isSavingEdit}
											aria-label="Cancel editing"
										>
											<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
												<path
													stroke-linecap="round"
													stroke-linejoin="round"
													stroke-width="2"
													d="M6 18L18 6M6 6l12 12"
												></path>
											</svg>
										</button>
									</div>
								{:else}
									<div class="flex items-center justify-center gap-2">
										<h2 class="text-xl font-bold text-base-content">{activeEntry.title}</h2>
										{#if $network.isOnline}
											<button
												class="btn btn-ghost btn-sm btn-circle"
												onclick={startEditingTitle}
												title="Edit title"
												aria-label="Edit title"
											>
												<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
													<path
														stroke-linecap="round"
														stroke-linejoin="round"
														stroke-width="2"
														d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
													></path>
												</svg>
											</button>
										{/if}
									</div>
								{/if}
							</div>

							<!-- Description (Editable) -->
							<div class="w-full max-w-md mt-2">
								{#if isEditingDescription}
									<div class="flex flex-col gap-2">
										<textarea
											bind:value={editedDescription}
											class="textarea textarea-bordered text-center {isSavingEdit
												? 'opacity-50 cursor-wait'
												: ''}"
											placeholder="Add a description..."
											rows="2"
											disabled={isSavingEdit}
											onkeydown={(e) => {
												if (e.key === 'Enter' && e.ctrlKey) saveDescription();
												if (e.key === 'Escape') cancelEditing();
											}}
										></textarea>
										<div class="flex justify-center gap-2">
											<button
												class="btn btn-primary btn-sm"
												onclick={saveDescription}
												disabled={isSavingEdit}
											>
												{#if isSavingEdit}
													<span class="loading loading-spinner loading-sm"></span>
												{:else}
													<svg
														class="w-4 h-4 mr-1"
														fill="none"
														stroke="currentColor"
														viewBox="0 0 24 24"
													>
														<path
															stroke-linecap="round"
															stroke-linejoin="round"
															stroke-width="2"
															d="M5 13l4 4L19 7"
														></path>
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
									<div class="flex items-center justify-center gap-2">
										{#if activeEntry.description}
											<p class="text-sm text-base-content/60">{activeEntry.description}</p>
										{:else}
											<p class="text-sm text-base-content/40 italic">No description</p>
										{/if}
										{#if $network.isOnline}
											<button
												class="btn btn-ghost btn-xs btn-circle"
												onclick={startEditingDescription}
												title="Edit description"
												aria-label="Edit description"
											>
												<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
													<path
														stroke-linecap="round"
														stroke-linejoin="round"
														stroke-width="2"
														d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
													></path>
												</svg>
											</button>
										{/if}
									</div>
								{/if}
							</div>

							<!-- Active Entry Tags (editable while running) -->
							<div class="w-full max-w-md">
								{#if isEditingTags}
									<div class="rounded-xl border border-base-300 bg-base-200/40 p-3">
										<TagPicker bind:value={selectedTagIds} allowCreate={false} />
										{#if tagSaveError}
											<p class="text-xs text-error mt-2">{tagSaveError}</p>
										{/if}
										<div class="flex gap-2 mt-3">
											<button
												class="btn btn-primary btn-sm"
												onclick={saveTags}
												disabled={!$network.isOnline}
											>
												Save tags
											</button>
											<button class="btn btn-ghost btn-sm" onclick={() => (isEditingTags = false)}>
												Cancel
											</button>
										</div>
									</div>
								{:else}
									<div class="flex items-center justify-center gap-2">
										{#if activeEntry.tags && activeEntry.tags.length > 0}
											<div class="flex flex-wrap justify-center gap-1.5">
												{#each activeEntry.tags as tag (tag.id)}
													{#if typeof tag === 'string'}
														<span class="badge badge-outline badge-xs">{tag}</span>
													{:else}
														<TagChip {tag} size="xs" />
													{/if}
												{/each}
											</div>
										{:else}
											<p class="text-sm text-base-content/40 italic">No tags</p>
										{/if}
										{#if $network.isOnline}
											<button
												class="btn btn-ghost btn-xs btn-circle"
												onclick={startEditTags}
												title="Edit tags"
												aria-label="Edit tags"
											>
												<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
													<path
														stroke-linecap="round"
														stroke-linejoin="round"
														stroke-width="2"
														d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
													></path>
												</svg>
											</button>
										{/if}
									</div>
								{/if}
							</div>

							<!-- Edit Error Message -->
							{#if editError}
								<div class="w-full max-w-md">
									<div class="alert alert-error">
										<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
											<path
												stroke-linecap="round"
												stroke-linejoin="round"
												stroke-width="2"
												d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
											></path>
										</svg>
										<span>{editError}</span>
									</div>
								</div>
							{/if}

							<!-- Big Timer Display in the center -->
							<div class="py-4">
								<h1
									class="text-5xl lg:text-6xl font-bold tracking-tighter leading-tight text-base-content"
								>
									{formatTime(elapsed)}
								</h1>
							</div>

							<!-- Big Stop Button at the bottom -->
							<div class="flex flex-col items-center mt-4 gap-2">
								<button
									class="btn btn-lg rounded-full bg-red-500 hover:bg-red-600 text-white border-none text-lg font-bold"
									onclick={onStopTimer}
									disabled={!$network.isOnline}
								>
									<svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path
											stroke-linecap="round"
											stroke-linejoin="round"
											stroke-width="2"
											d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
										></path>
										<path
											stroke-linecap="round"
											stroke-linejoin="round"
											stroke-width="2"
											d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z"
										></path>
									</svg>
									Stop
								</button>
								{#if !$network.isOnline}
									<div class="text-sm text-warning font-medium">
										Cannot stop timer while offline
									</div>
								{/if}
							</div>
						{:else if isStartingTimer}
							<!-- Starting Timer State -->
							<div class="py-4">
								<span class="loading loading-spinner loading-lg text-primary"></span>
							</div>
							<p class="text-base-content/70">Starting timer...</p>
						{/if}
					</div>
				</div>
			{:else}
				<!-- Compact Start Form when idle (Full Width) -->
				<div class="card bg-base-100 shadow-xl">
					<div class="card-body">
						<div class="text-center mb-6">
							<h2 class="text-2xl font-bold text-base-content mb-2">Ready to start tracking?</h2>
							<p class="text-base-content/70">Start a new timer session</p>
						</div>

						<form onsubmit={onStartTimer} class="space-y-6">
							<div class="form-control">
								<label class="label" for="title">
									<span class="label-text">Task Title</span>
								</label>
								<input
									id="title"
									bind:value={title}
									type="text"
									placeholder="What are you working on?"
									class="input input-bordered"
									required
									onfocus={() => (titleInputFocused = true)}
									onblur={() => (titleInputFocused = false)}
								/>

								{#if $network.isOnline && suggestionChips.length > 0}
									<div class="flex flex-wrap items-center gap-1.5 mt-2">
										<span class="text-xs text-base-content/50">Suggestions:</span>
										{#each suggestionChips as chip, i (chip.kind + ':' + chip.id)}
											{#if chip.kind === 'project'}
												<button
													type="button"
													class="inline-flex items-center gap-1 rounded-full border border-base-300 bg-base-200/60 px-2.5 py-0.5 text-xs font-medium text-base-content/80 transition-all hover:border-primary/60 hover:text-primary {selectedProject ===
													chip.id
														? 'border-primary bg-primary/10 text-primary'
														: ''} {suggestionFocus === i ? 'ring-2 ring-primary/70' : ''}"
													onclick={() => applyProjectSuggestion(chip.id)}
												>
													<svg
														class="w-3 h-3"
														fill="none"
														stroke="currentColor"
														viewBox="0 0 24 24"
													>
														<path
															stroke-linecap="round"
															stroke-linejoin="round"
															stroke-width="2"
															d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
														></path>
													</svg>
													{chip.kind === 'project' ? titleSuggestions?.projectName : ''}
												</button>
											{:else}
												{@const tag = chip.id !== null ? tagById.get(chip.id) : undefined}
												{#if tag}
													<button
														type="button"
														onclick={() => toggleTagSuggestion(chip.id!)}
														class="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium transition-all {suggestionFocus ===
														i
															? 'ring-2 ring-primary/70'
															: ''}"
														style="background:{tag.color}{selectedTags.includes(chip.id!)
															? '4d'
															: '22'};color:{tag.color};border:1px solid {tag.color}55;"
													>
														{tag.title}
													</button>
												{/if}
											{/if}
										{/each}
										<span
											class="ml-auto inline-flex items-center gap-1 whitespace-nowrap text-[10px] text-base-content/40"
											aria-label="Keyboard shortcuts: arrow keys to select a suggestion, Enter to apply, Escape to clear"
										>
											<kbd class="kbd kbd-xs bg-base-200 px-1 text-base-content/60">←</kbd>
											<kbd class="kbd kbd-xs bg-base-200 px-1 text-base-content/60">→</kbd>
											<span>select</span>
											<kbd class="kbd kbd-xs bg-base-200 px-1 text-base-content/60">Enter</kbd>
											<span>apply</span>
											<kbd class="kbd kbd-xs bg-base-200 px-1 text-base-content/60">Esc</kbd>
											<span>clear</span>
										</span>
									</div>
								{/if}
							</div>

							<!-- Project Selector -->
							<div class="form-control">
								<label class="label" for="project-picker-trigger">
									<span class="label-text">Project</span>
								</label>
								<ProjectPicker
									bind:value={selectedProject}
									projects={projectsList}
									onOpen={onProjectDropdownOpen}
									inputId="project-picker-trigger"
								/>
							</div>

							<!-- Tags (optional) -->
							<div class="form-control">
								<div class="label pb-1">
									<span class="label-text font-semibold">Tags (optional)</span>
									{#if selectedTags.length > 0}
										<span class="badge badge-sm badge-ghost font-normal"
											>{selectedTags.length} selected</span
										>
									{/if}
								</div>
								<div id="timer-tags" class="rounded-xl border border-base-300 bg-base-200/40 p-2.5">
									<TagPicker bind:value={selectedTags} />
								</div>
							</div>

							<!-- Description (optional) -->
							<div class="form-control">
								<label class="label" for="description">
									<span class="label-text">Description (optional)</span>
								</label>
								<textarea
									id="description"
									bind:value={description}
									placeholder="Additional details..."
									class="textarea textarea-bordered"
									rows="3"
								></textarea>
							</div>

							<!-- Custom Start Time Section -->
							<div class="form-control">
								<span class="label-text text-base-content/70 label">Start Time</span>

								<!-- Toggle Switch -->
								<div class="flex items-center gap-3 mb-3">
									<span
										class="text-sm {!useCustomStartTime ? 'font-medium' : 'text-base-content/60'}"
										>Start from now</span
									>
									<SettingToggle
										checked={useCustomStartTime}
										label="Toggle between start from now and custom start time"
										onChange={() => toggleCustomStartTime()}
									/>
									<button
										type="button"
										class="text-sm {useCustomStartTime ? 'font-medium' : 'text-base-content/60'}"
										onclick={toggleCustomStartTime}
									>
										Custom time
									</button>
								</div>

								{#if useCustomStartTime}
									<div class="space-y-4 p-4 bg-base-200 rounded-lg">
										<!-- Minutes Slider -->
										<div class="form-control">
											<div class="flex justify-between items-center mb-2">
												<span class="label-text text-sm font-medium">Start timer</span>
												<span class="text-lg font-bold text-primary"
													>{sliderMinutesAgo} min ago</span
												>
											</div>
											<input
												type="range"
												min="0"
												max={MAX_START_TIME_PAST_MINUTES}
												value={sliderMinutesAgo}
												oninput={onSliderChange}
												class="range range-primary"
												step="1"
											/>
											<div class="flex justify-between text-xs text-base-content/50 mt-1">
												<span>Now</span>
												<span>{MAX_START_TIME_PAST_MINUTES} min ago</span>
											</div>
										</div>

										<!-- Quick Select Buttons -->
										<div class="form-control">
											<span class="label-text text-xs label mb-2">Quick select</span>
											<div class="flex flex-wrap gap-2">
												<button
													type="button"
													class="btn btn-xs btn-outline"
													onclick={() => setStartTimeMinutesAgo(0)}
												>
													Now
												</button>
												<button
													type="button"
													class="btn btn-xs btn-outline"
													onclick={() => setStartTimeMinutesAgo(15)}
												>
													15 min
												</button>
												<button
													type="button"
													class="btn btn-xs btn-outline"
													onclick={() => setStartTimeMinutesAgo(30)}
												>
													30 min
												</button>
												<button
													type="button"
													class="btn btn-xs btn-outline"
													onclick={() => setStartTimeMinutesAgo(45)}
												>
													45 min
												</button>
												<button
													type="button"
													class="btn btn-xs btn-outline"
													onclick={() => setStartTimeMinutesAgo(60)}
												>
													60 min
												</button>
											</div>
										</div>

										<!-- Selected Time Display -->
										{#if customStartTime}
											<div class="text-center text-sm text-base-content/70">
												Timer will start from <span class="font-semibold text-base-content"
													>{customStartTime.toLocaleTimeString([], {
														hour: '2-digit',
														minute: '2-digit',
														second: '2-digit'
													})}</span
												>
											</div>
										{/if}

										<!-- Validation Feedback -->
										{#if startTimeValidationError}
											<div class="alert alert-error py-2">
												<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
													<path
														stroke-linecap="round"
														stroke-linejoin="round"
														stroke-width="2"
														d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
													></path>
												</svg>
												<span class="text-sm">{startTimeValidationError}</span>
											</div>
										{/if}
									</div>
								{/if}
							</div>

							<!-- Centered Start Button with Play Icon -->
							<div class="flex flex-col items-center gap-2">
								<button
									class="btn btn-primary btn-lg rounded-full text-xl px-8"
									type="submit"
									disabled={!$network.isOnline}
								>
									<span class="mr-2" aria-hidden="true">
										<svg class="h-6 w-6" viewBox="0 0 24 24" fill="currentColor">
											<polygon points="6 3 20 12 6 21 6 3" />
										</svg>
									</span>
									Start Timer
								</button>
								{#if !$network.isOnline}
									<div class="text-sm text-warning font-medium">
										Cannot start timer while offline
									</div>
								{/if}
							</div>
						</form>
					</div>
				</div>
			{/if}
		</div>

		<!-- Today's Timers Section (Full Width, Below Timer) -->
		<div>
			<div class="card bg-base-100 shadow-xl">
				<div class="card-body">
					<h3 class="text-lg font-medium text-base-content mb-4">Today's Sessions</h3>
					{#if loadingTodaySessions}
						<div class="flex justify-center py-8">
							<span class="loading loading-spinner loading-lg"></span>
						</div>
					{:else if todaySessions.length > 0}
						<div class="space-y-4">
							{#each todaySessions as session (session.id)}
								<div
									class="border border-base-300 rounded-lg p-4 hover:bg-base-200 transition-colors"
								>
									<div class="flex justify-between items-start">
										<div class="flex-1 min-w-0">
											<h4 class="font-medium text-base-content truncate">{session.title}</h4>
											<p class="text-sm text-base-content/70 truncate">{session.project}</p>
											{#if session.description}
												<p class="text-sm text-base-content/60 mt-1 truncate">
													{session.description}
												</p>
											{/if}
											{#if session.tags && session.tags.length > 0}
												<div class="flex flex-wrap gap-1 mt-2">
													{#each session.tags as tag (tag.id)}
														{#if typeof tag === 'string'}
															<span class="badge badge-outline badge-xs">{tag}</span>
														{:else}
															<TagChip {tag} size="xs" />
														{/if}
													{/each}
												</div>
											{/if}
										</div>
										<div class="text-right ml-4">
											<div class="text-sm text-base-content/90 font-mono">
												{session.duration ? formatTime(parseFloat(session.duration)) : '00:00:00'}
											</div>
											<div class="text-xs text-base-content/60 mt-1">
												{new Date(session.start_time).toLocaleTimeString([], {
													hour: '2-digit',
													minute: '2-digit'
												})} -
												{session.end_time
													? new Date(session.end_time).toLocaleTimeString([], {
															hour: '2-digit',
															minute: '2-digit'
														})
													: 'Active'}
											</div>
										</div>
									</div>
								</div>
							{/each}
						</div>
					{:else}
						<div class="text-center py-8">
							<p class="text-base-content/70">No completed sessions today</p>
							<p class="text-sm text-base-content/50 mt-2">
								Your completed timer sessions will appear here
							</p>
						</div>
					{/if}
				</div>
			</div>
		</div>
	{/if}

	{#if showTasksModal}
		<TasksModal on:close={() => (showTasksModal = false)} />
	{/if}
</div>
