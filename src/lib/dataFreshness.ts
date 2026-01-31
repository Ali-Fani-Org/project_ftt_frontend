import { writable, derived, get } from 'svelte/store';
import { DATA_STALE_THRESHOLD, DATA_OUTDATED_THRESHOLD } from './stores';
import { network } from './network';
import { addToast } from './toast';

interface DataFreshnessStatus {
	lastUpdate: Date | null;
	isFresh: boolean;
	isOutdated: boolean;
	isStale: boolean;
	age: number;
	outdatedThreshold: number;
	staleThreshold: number;
	isRefreshing: boolean;
}

const timestampsStore = writable<Map<string, number>>(new Map());

const refreshingStore = writable<boolean>(false);

let wasOutdated = false;

class DataFreshnessManager {
	// Track last update per data type
	updateTimestamp(key: string): void {
		timestampsStore.update((map) => {
			map.set(key, Date.now());
			return new Map(map);
		});
	}

	// Check if data is outdated
	isOutdated(key: string): boolean {
		const map = get(timestampsStore);
		const timestamp = map.get(key);
		if (!timestamp) return true;
		return Date.now() - timestamp > DATA_OUTDATED_THRESHOLD;
	}

	// Check if data is stale
	isStale(key: string): boolean {
		const map = get(timestampsStore);
		const timestamp = map.get(key);
		if (!timestamp) return true;
		return Date.now() - timestamp > DATA_STALE_THRESHOLD;
	}

	// Get all outdated data keys
	getOutdatedData(): string[] {
		const map = get(timestampsStore);
		const now = Date.now();
		return Array.from(map.entries())
			.filter(([, timestamp]) => now - timestamp > DATA_OUTDATED_THRESHOLD)
			.map(([key]) => key);
	}

	// Get all stale data keys
	getStaleData(): string[] {
		const map = get(timestampsStore);
		const now = Date.now();
		return Array.from(map.entries())
			.filter(([, timestamp]) => now - timestamp > DATA_STALE_THRESHOLD)
			.map(([key]) => key);
	}

	// Calculate data age
	getAge(key: string): number {
		const map = get(timestampsStore);
		const timestamp = map.get(key);
		return timestamp ? Date.now() - timestamp : Infinity;
	}

	// Set refreshing state
	setRefreshing(value: boolean): void {
		refreshingStore.set(value);
	}

	// Get refreshing state
	isRefreshing(): boolean {
		return get(refreshingStore);
	}
}

export const dataFreshnessManager = new DataFreshnessManager();

// CRITICAL: Derived store that UI always subscribes to
// This ensures UI always knows freshness state
export const dataFreshness = derived(
	[timestampsStore, refreshingStore, network],
	([$timestamps, $refreshing, $network]) => {
		const globalTimestamp = $timestamps.get('global');
		const lastUpdate = globalTimestamp ? new Date(globalTimestamp) : null;
		const age = lastUpdate ? Date.now() - lastUpdate.getTime() : Infinity;

		const isFresh = age < DATA_OUTDATED_THRESHOLD;
		const isOutdated = age >= DATA_OUTDATED_THRESHOLD && age < DATA_STALE_THRESHOLD;
		const isStale = age >= DATA_STALE_THRESHOLD;

		if (isOutdated && !wasOutdated && !$refreshing && $network.isOnline) {
			addToast('Data is outdated - click refresh to update', 'warning', 5000);
		}
		wasOutdated = isOutdated;

		return {
			lastUpdate,
			isFresh,
			isOutdated,
			isStale,
			age,
			outdatedThreshold: DATA_OUTDATED_THRESHOLD,
			staleThreshold: DATA_STALE_THRESHOLD,
			isRefreshing: $refreshing,
			isOnline: $network.isOnline
		};
	}
);
