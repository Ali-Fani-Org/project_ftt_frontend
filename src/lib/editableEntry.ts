/**
 * Reusable editable entry utilities
 * 
 * This module provides helper functions for editable entry state management
 * that can be used across different components (timer page, TimeEntryDetailModal).
 * 
 * Since Svelte 5 runes ($state) must be declared within components,
 * this module provides pure functions that operate on state values.
 * 
 * Usage in a component:
 * ```svelte
 * <script>
 *   import { createEditableEntryHandlers } from '$lib/editableEntry';
 *   import { network } from '$lib/network';
 *   
 *   // State (must be in component)
 *   let isEditingTitle = $state(false);
 *   let isEditingDescription = $state(false);
 *   let editedTitle = $state('');
 *   let editedDescription = $state('');
 *   let isSaving = $state(false);
 *   let editError = $state('');
 *   
 *   // Create handlers - pass a function that returns the current online status
 *   const handlers = createEditableEntryHandlers({
 *     getState: () => ({ isEditingTitle, isEditingDescription, editedTitle, editedDescription, isSaving, editError }),
 *     setState: (updates) => {
 *       if ('isEditingTitle' in updates) isEditingTitle = updates.isEditingTitle;
 *       if ('isEditingDescription' in updates) isEditingDescription = updates.isEditingDescription;
 *       if ('editedTitle' in updates) editedTitle = updates.editedTitle;
 *       if ('editedDescription' in updates) editedDescription = updates.editedDescription;
 *       if ('isSaving' in updates) isSaving = updates.isSaving;
 *       if ('editError' in updates) editError = updates.editError;
 *     },
 *     getEntry: () => activeEntry,
 *     setEntry: (entry) => { activeEntry = entry; },
 *     onUpdate: timeEntries.update,
 *     isOnline: () => $network.isOnline  // Pass online status from component
 *   });
 * </script>
 * ```
 */

import type { TimeEntry } from './api';

/**
 * State interface for editable entry
 */
export interface EditableEntryState {
	isEditingTitle: boolean;
	isEditingDescription: boolean;
	editedTitle: string;
	editedDescription: string;
	isSaving: boolean;
	editError: string;
}

/**
 * Partial state for updates
 */
export type EditableEntryStateUpdate = Partial<EditableEntryState>;

/**
 * Configuration for creating editable entry handlers
 */
export interface EditableEntryConfig {
	/** Get current state */
	getState: () => EditableEntryState;
	/** Update state */
	setState: (updates: EditableEntryStateUpdate) => void;
	/** Get the current entry being edited */
	getEntry: () => TimeEntry | null;
	/** Set the updated entry */
	setEntry: (entry: TimeEntry) => void;
	/** Function to call when updating the entry via API */
	onUpdate: (id: number, data: { title?: string; description?: string | null }) => Promise<TimeEntry>;
	/** Optional callback called after successful update */
	onUpdateSuccess?: (entry: TimeEntry) => void;
	/** Function that returns the current online status (defaults to true if not provided) */
	isOnline?: () => boolean;
}

/**
 * Handlers returned by createEditableEntryHandlers
 */
export interface EditableEntryHandlers {
	startEditingTitle: () => void;
	startEditingDescription: () => void;
	cancelEditing: () => void;
	saveTitle: () => Promise<void>;
	saveDescription: () => Promise<void>;
}

/**
 * Creates editable entry handlers given a configuration
 * This is a factory function that returns handler functions
 */
export function createEditableEntryHandlers(config: EditableEntryConfig): EditableEntryHandlers {
	// Helper to check online status - defaults to true if not provided
	const isOnline = () => config.isOnline?.() ?? true;

	function startEditingTitle(): void {
		const entry = config.getEntry();
		if (!entry || !isOnline()) return;
		config.setState({
			editedTitle: entry.title,
			isEditingTitle: true,
			editError: ''
		});
	}

	function startEditingDescription(): void {
		const entry = config.getEntry();
		if (!entry || !isOnline()) return;
		config.setState({
			editedDescription: entry.description || '',
			isEditingDescription: true,
			editError: ''
		});
	}

	function cancelEditing(): void {
		config.setState({
			isEditingTitle: false,
			isEditingDescription: false,
			editedTitle: '',
			editedDescription: '',
			editError: ''
		});
	}

	async function saveTitle(): Promise<void> {
		const entry = config.getEntry();
		const state = config.getState();
		if (!entry || !state.editedTitle.trim()) return;

		// Check if online
		if (!isOnline()) {
			config.setState({ editError: 'Cannot update while offline' });
			return;
		}

		config.setState({ isSaving: true, editError: '' });
		try {
			const updatedEntry = await config.onUpdate(entry.id, { title: state.editedTitle.trim() });
			config.setEntry(updatedEntry);
			config.setState({
				isEditingTitle: false,
				editedTitle: ''
			});
			// Call optional success callback
			config.onUpdateSuccess?.(updatedEntry);
		} catch (err) {
			console.error('Failed to update title:', err);
			config.setState({ editError: 'Failed to update title' });
		} finally {
			config.setState({ isSaving: false });
		}
	}

	async function saveDescription(): Promise<void> {
		const entry = config.getEntry();
		const state = config.getState();
		if (!entry) return;

		// Check if online
		if (!isOnline()) {
			config.setState({ editError: 'Cannot update while offline' });
			return;
		}

		config.setState({ isSaving: true, editError: '' });
		try {
			const updatedEntry = await config.onUpdate(entry.id, {
				description: state.editedDescription.trim() || null
			});
			config.setEntry(updatedEntry);
			config.setState({
				isEditingDescription: false,
				editedDescription: ''
			});
			// Call optional success callback
			config.onUpdateSuccess?.(updatedEntry);
		} catch (err) {
			console.error('Failed to update description:', err);
			config.setState({ editError: 'Failed to update description' });
		} finally {
			config.setState({ isSaving: false });
		}
	}

	return {
		startEditingTitle,
		startEditingDescription,
		cancelEditing,
		saveTitle,
		saveDescription
	};
}

/**
 * SVG icon paths for edit UI components
 * These can be used with svg elements in Svelte templates
 */
export const editIconPaths = {
	edit: 'M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z',
	check: 'M5 13l4 4L19 7',
	x: 'M6 18L18 6M6 6l12 12',
	warning: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z'
};
