import { get } from 'svelte/store';
import { network } from './network';
import { dataFreshnessManager } from './dataFreshness';
import { addToast } from './toast';

interface RefreshConfig {
	enabled: boolean;
	interval: number;
	onlyWhenVisible: boolean;
	refreshOnReconnect: boolean;
}

class RefreshController {
	private intervalId: number | NodeJS.Timeout | null = null;
	private config: RefreshConfig;
	private refreshCallbacks: Map<string, () => Promise<void>>;
	private isRefreshing: boolean = false;
	private wasOnline: boolean = false;
	private visibilityListener: (() => void) | null = null;
	private connectionRestoredDebounce: number | null = null;
	private connectionLostDebounce: number | null = null;

	constructor(config: RefreshConfig) {
		this.config = config;
		this.refreshCallbacks = new Map();
		this.wasOnline = get(network).isOnline;

		network.subscribe((status) => {
			if (status.isOnline && !this.wasOnline && this.config.refreshOnReconnect) {
				console.log('Connection restored, triggering refresh');

				if (this.connectionRestoredDebounce) {
					clearTimeout(this.connectionRestoredDebounce);
				}

				addToast('Connection restored! Refreshing data...', 'success', 3000);

				this.refreshAll()
					.then(() => {
						addToast('Data refreshed successfully', 'success', 2000);
					})
					.catch((err) => {
						addToast('Failed to refresh some data', 'error', 3000);
					});

				this.connectionRestoredDebounce = window.setTimeout(() => {
					this.connectionRestoredDebounce = null;
				}, 5000);
			} else if (!status.isOnline && this.wasOnline) {
				if (this.connectionLostDebounce) {
					clearTimeout(this.connectionLostDebounce);
				}

				addToast('Connection lost. Working in offline mode.', 'error', 4000);

				this.connectionLostDebounce = window.setTimeout(() => {
					this.connectionLostDebounce = null;
				}, 5000);
			}
			this.wasOnline = status.isOnline;
		});

		this.setupVisibilityListener();
	}

	private setupVisibilityListener() {
		if (this.visibilityListener) {
			document.removeEventListener('visibilitychange', this.visibilityListener);
		}

		this.visibilityListener = () => {
			if (this.config.onlyWhenVisible) {
				if (document.hidden) {
					this.pause();
				} else {
					this.resume();
				}
			}
		};

		document.addEventListener('visibilitychange', this.visibilityListener);
	}

	start(): void {
		if (!this.config.enabled) return;

		this.stop();

		this.intervalId = window.setInterval(() => {
			this.refreshAll();
		}, this.config.interval);
	}

	stop(): void {
		if (this.intervalId) {
			clearInterval(this.intervalId);
			this.intervalId = null;
		}
	}

	pause(): void {
		this.stop();
		if (this.isRefreshing) {
			console.log('Resetting isRefreshing flag during pause');
			this.isRefreshing = false;
		}
	}

	resume(): void {
		this.isRefreshing = false;
		this.start();
	}

	register(key: string, callback: () => Promise<void>): void {
		this.refreshCallbacks.set(key, callback);
	}

	unregister(key: string): void {
		this.refreshCallbacks.delete(key);
	}

	async refreshAll(): Promise<void> {
		if (this.isRefreshing) {
			console.log('Refresh already in progress, skipping');
			return;
		}

		if (!get(network).isOnline) {
			console.log('Offline, skipping refresh');
			return;
		}

		this.isRefreshing = true;

		try {
			const promises = Array.from(this.refreshCallbacks.values()).map((callback) =>
				callback().catch((err) => {
					console.error('Refresh callback failed:', err);
					return Promise.resolve();
				})
			);

			await Promise.allSettled(promises);

			dataFreshnessManager.updateTimestamp('global');
		} finally {
			this.isRefreshing = false;
		}
	}

	getRefreshingState(): boolean {
		return this.isRefreshing;
	}

	updateConfig(newConfig: Partial<RefreshConfig>): void {
		const oldOnlyWhenVisible = this.config.onlyWhenVisible;
		this.config = { ...this.config, ...newConfig };

		if (this.config.onlyWhenVisible !== oldOnlyWhenVisible) {
			this.setupVisibilityListener();
		}

		if (this.config.enabled) {
			this.start();
		} else {
			this.stop();
		}
	}
}

export const refreshController = new RefreshController({
	enabled: true,
	interval: 30000,
	onlyWhenVisible: true,
	refreshOnReconnect: true
});
