import { browser } from '$app/environment';
import { get } from 'svelte/store';
import { authToken, baseUrl } from './stores';
import logger from '$lib/logger';
import { network } from './network';
import { queryClient } from '$lib/queryClient';
import { queryKeys } from '$lib/queries/keys';
import type { TimeEntry } from './api';

export type NotificationType = 'INFO' | 'WARNING' | 'ERROR' | 'SUCCESS' | 'CRITICAL' | 'OTHER';

export interface NotificationData {
	id: string;
	type: NotificationType;
	message: string;
	created_at: string;
	read: boolean;
	delivered_at: string | null;
}

interface NotificationMessage {
	version: 1;
	type: 'notification';
	id: string;
	payload: NotificationData;
}

interface ServerMessage {
	version?: number;
	type?: string;
	id?: string;
	timestamp?: string;
	connection_id?: string;
	entry_id?: number | null;
	is_active?: boolean;
	active_entry?: TimeEntry | null;
	payload?: NotificationData;
	message?: string;
}

export interface NotificationService {
	connect(): Promise<void>;
	disconnect(): void;
	isConnected(): boolean;
	isConnecting: boolean;
	getLastError(): string | null;
}

const MAX_RECENT_IDS = 500;
const MAX_RECONNECT_DELAY = 60_000;
const HEARTBEAT_INTERVAL = 15_000;
const HEARTBEAT_TIMEOUT = 45_000;
const MAX_DISPLAY_ATTEMPTS = 3;
const TICKET_FETCH_TIMEOUT_MS = 10_000;

class TauriNotificationService implements NotificationService {
	private socket: WebSocket | null = null;
	private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
	private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
	private heartbeatTimeoutTimer: ReturnType<typeof setTimeout> | null = null;
	private unsubscribeNetwork: (() => void) | null = null;
	private reconnectAttempts = 0;
	private manuallyDisconnected = false;
	private connected = false;
	private lastError: string | null = null;
	private readonly recentIds = new Set<string>();
	private readonly pendingAcks = new Set<string>();
	private readonly deliveryFailures = new Map<string, number>();
	private readonly serviceId = Math.random().toString(36).slice(2, 11);
	private connectionId: string | null = null;
	isConnecting = false;

	constructor() {
		if (!browser) {
			throw new Error('NotificationService can only be used in browser environment');
		}

		this.unsubscribeNetwork = network.subscribe((status) => {
			if (status.isOnline && !this.connected && !this.manuallyDisconnected && get(authToken)) {
				this.reconnectAttempts = 0;
				void this.connect();
			}
			if (!status.isOnline) {
				this.closeSocket(false);
			}
		});
	}

	async connect(): Promise<void> {
		if (this.connected || this.isConnecting) return;
		const token = get(authToken) as string | null;
		const base = get(baseUrl) as string;
		if (!token || !base) return;
		if (!get(network).isOnline) return;

		this.manuallyDisconnected = false;
		this.isConnecting = true;
		this.lastError = null;
		this.clearReconnectTimer();

		let socket: WebSocket | null = null;
		try {
			const url = this.toWebSocketUrl(base);
			const ticket = await this.fetchTicket(token);
			if (!ticket) {
				this.lastError = 'Failed to obtain WebSocket ticket';
				this.scheduleReconnect();
				return;
			}

			// The ticket is short-lived, one-time, and never usable as an API credential.
			socket = new WebSocket(`${url}/ws/notifications/?ticket=${encodeURIComponent(ticket)}`);
			this.socket = socket;

			socket.onopen = () => {
				this.connected = true;
				this.isConnecting = false;
				this.reconnectAttempts = 0;
				this.lastError = null;
				this.startHeartbeat();
				this.flushAcks();
			};
			socket.onmessage = (event) => this.handleMessage(event.data);
			socket.onerror = () => {
				this.lastError = 'WebSocket connection error';
			};
			socket.onclose = (event) => {
				if (this.socket !== socket) return;
				this.socket = null;
				this.connected = false;
				this.isConnecting = false;
				this.stopHeartbeat();
				if (event.code === 4401) {
					this.lastError = 'Authentication expired - please log in again';
					authToken.set(null);
					return;
				}
				if (!this.manuallyDisconnected) this.scheduleReconnect();
			};
		} catch (error) {
			this.connected = false;
			this.lastError = error instanceof Error ? error.message : 'WebSocket connection failed';
			this.scheduleReconnect();
		} finally {
			// Unstick isConnecting if we never handed off to a live socket
			// (ticket failure, exception, or a token that vanished mid-connect).
			if (!this.socket) this.isConnecting = false;
		}
	}

	disconnect(): void {
		this.manuallyDisconnected = true;
		this.clearReconnectTimer();
		this.closeSocket(true);
	}

	isConnected(): boolean {
		return this.connected;
	}

	getLastError(): string | null {
		return this.lastError;
	}

	private handleMessage(raw: unknown): void {
		if (typeof raw !== 'string') return;
		let message: ServerMessage;
		try {
			message = JSON.parse(raw) as ServerMessage;
		} catch {
			logger.warn(`[NotificationService ${this.serviceId}] Ignoring malformed WebSocket message`);
			return;
		}

		if (message.version !== 1) {
			logger.warn(
				`[NotificationService ${this.serviceId}] Ignoring message with unsupported version: ${message.version}`
			);
			return;
		}

		if (message.type === 'ping') {
			this.send({ version: 1, type: 'pong', timestamp: message.timestamp ?? new Date().toISOString() });
			return;
		}
		if (message.type === 'pong') {
			this.resetHeartbeatTimeout();
			return;
		}
		if (message.type === 'ready') {
			this.connectionId = message.connection_id ?? null;
			if (this.connectionId) {
				this.send({ version: 1, type: 'ready_ack', connection_id: this.connectionId });
			}
			// The server's snapshot: seed the active-entry cache so the Timer page
			// boots with current state instead of waiting for a refetch.
			if (message.active_entry !== undefined) {
				queryClient.setQueryData(queryKeys.timeEntries.active, message.active_entry);
			}
			return;
		}
		if (message.type === 'time_entry_changed') {
			// A time entry was started, stopped, or edited (possibly on another
			// device). Apply the fresh snapshot immediately, then invalidate the
			// rest of the time-entry cache (lists, today's sessions, charts).
			if (message.active_entry !== undefined) {
				queryClient.setQueryData(queryKeys.timeEntries.active, message.active_entry);
			}
			void queryClient.invalidateQueries({ queryKey: queryKeys.timeEntries.all });
			return;
		}
		if (message.type === 'notification') {
			if (this.isNotificationMessage(message)) void this.processNotification(message);
			return;
		}
		if (message.type === 'notification_ack_result' && message.id) {
			this.pendingAcks.delete(message.id);
			return;
		}
		if (message.type === 'error') {
			this.lastError = message.message ?? 'Notification server error';
		}
	}

	private async processNotification(message: NotificationMessage): Promise<void> {
		const { id, payload } = message;
		if (this.recentIds.has(id)) {
			this.queueAck(id);
			return;
		}

		this.recentIds.add(id);
		this.trimRecentIds();
		try {
			await this.showNotification(payload);
			this.deliveryFailures.delete(id);
			this.queueAck(id);
		} catch (error) {
			const failures = (this.deliveryFailures.get(id) ?? 0) + 1;
			if (failures >= MAX_DISPLAY_ATTEMPTS) {
				// Give up on displaying: acknowledge anyway so the server stops
				// replaying this notification on every poll.
				this.deliveryFailures.delete(id);
				this.queueAck(id);
				logger.error(
					`[NotificationService ${this.serviceId}] Giving up on notification ${id} after ${failures} failed display attempts`,
					error
				);
			} else {
				// Remove from recentIds so the next server replay retries the display.
				this.deliveryFailures.set(id, failures);
				this.recentIds.delete(id);
				logger.error(`[NotificationService ${this.serviceId}] Failed to display notification ${id}`, error);
			}
		}
	}

	private queueAck(id: string): void {
		this.pendingAcks.add(id);
		this.flushAcks();
	}

	private flushAcks(): void {
		if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;
		for (const id of this.pendingAcks) this.send({ version: 1, type: 'notification_ack', id });
	}

	private send(payload: object): void {
		if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(payload));
	}

	private startHeartbeat(): void {
		this.stopHeartbeat();
		this.resetHeartbeatTimeout();
		this.heartbeatTimer = setInterval(() => {
			this.send({ version: 1, type: 'ping', timestamp: new Date().toISOString() });
			this.resetHeartbeatTimeout();
		}, HEARTBEAT_INTERVAL);
	}

	private resetHeartbeatTimeout(): void {
		if (this.heartbeatTimeoutTimer) clearTimeout(this.heartbeatTimeoutTimer);
		this.heartbeatTimeoutTimer = setTimeout(() => this.socket?.close(), HEARTBEAT_TIMEOUT);
	}

	private stopHeartbeat(): void {
		if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
		if (this.heartbeatTimeoutTimer) clearTimeout(this.heartbeatTimeoutTimer);
		this.heartbeatTimer = null;
		this.heartbeatTimeoutTimer = null;
	}

	private scheduleReconnect(): void {
		if (this.manuallyDisconnected || this.reconnectTimer || !get(authToken) || !get(network).isOnline) return;
		const baseDelay = Math.min(1000 * 2 ** this.reconnectAttempts, MAX_RECONNECT_DELAY);
		const delay = Math.round(baseDelay * (0.75 + Math.random() * 0.5));
		this.reconnectAttempts += 1;
		this.reconnectTimer = setTimeout(() => {
			this.reconnectTimer = null;
			void this.connect();
		}, delay);
	}

	private clearReconnectTimer(): void {
		if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
		this.reconnectTimer = null;
	}

	private closeSocket(manual: boolean): void {
		this.connected = false;
		this.isConnecting = false;
		this.connectionId = null;
		this.stopHeartbeat();
		const socket = this.socket;
		this.socket = null;
		if (socket) {
			socket.onclose = null;
			socket.close(1000, manual ? 'client disconnect' : 'network offline');
		}
	}

	private async fetchTicket(token: string, timeoutMs = TICKET_FETCH_TIMEOUT_MS): Promise<string | null> {
		try {
			const base = get(baseUrl);
			const controller = new AbortController();
			const timer = setTimeout(() => controller.abort(), timeoutMs);
			try {
				const response = await fetch(`${base}/api/notifications/websocket-ticket/`, {
					method: 'POST',
					headers: {
						Authorization: `Token ${token}`,
						'Content-Type': 'application/json'
					},
					signal: controller.signal
				});
				if (!response.ok) {
					logger.error(`[NotificationService ${this.serviceId}] Ticket request failed: ${response.status}`);
					return null;
				}
				const data = await response.json();
				return typeof data.ticket === 'string' && data.ticket ? data.ticket : null;
			} finally {
				clearTimeout(timer);
			}
		} catch (error) {
			logger.error(`[NotificationService ${this.serviceId}] Ticket request error`, error);
			return null;
		}
	}

	private toWebSocketUrl(apiUrl: string): string {
		const parsed = new URL(apiUrl);
		parsed.protocol = parsed.protocol === 'https:' ? 'wss:' : 'ws:';
		return parsed.toString().replace(/\/$/, '');
	}

	private trimRecentIds(): void {
		while (this.recentIds.size > MAX_RECENT_IDS) {
			const oldest = this.recentIds.values().next().value as string | undefined;
			if (oldest) this.recentIds.delete(oldest);
		}
	}

	private isNotificationMessage(message: ServerMessage): message is NotificationMessage {
		const notification = message.payload;
		return message.version === 1 && typeof message.id === 'string' && !!notification &&
			typeof notification.id === 'string' && typeof notification.message === 'string';
	}

	private isTauri(): boolean {
		return (
			typeof window !== 'undefined' &&
			Boolean((window as any).__TAURI__ || (window as any).__TAURI_INTERNALS__)
		);
	}

	private async showNotification(notification: NotificationData): Promise<void> {
		if (!this.isTauri()) {
			// Browser/web-preview mode: native notifications are unavailable, so skip
			// the display but still ACK (see processNotification) so the server stops
			// replaying. A PWA notification path can hook in here later.
			logger.debug(
				`[NotificationService ${this.serviceId}] Skipping native notification in browser: ${notification.message.slice(0, 80)}`
			);
			return;
		}
		const { invoke } = await import('@tauri-apps/api/core');
		await invoke('show_notification', {
			title: `Time Tracker - ${this.getNotificationTitle(notification.type)}`,
			body: notification.message,
			notificationType: notification.type
		});
	}

	private getNotificationTitle(type: NotificationType): string {
		return {
			ERROR: 'Error', WARNING: 'Warning', SUCCESS: 'Success', CRITICAL: 'Critical', INFO: 'Info', OTHER: 'Notification'
		}[type];
	}
}

export function createNotificationService(): NotificationService {
	if (!browser) throw new Error('NotificationService can only be created in browser environment');
	return new TauriNotificationService();
}

let globalNotificationService: NotificationService | null = null;

export function getNotificationService(): NotificationService {
	if (!globalNotificationService) globalNotificationService = createNotificationService();
	return globalNotificationService;
}

if (browser) {
	getNotificationService();
	authToken.subscribe((token: string | null) => {
		if (token) void globalNotificationService?.connect();
		else globalNotificationService?.disconnect();
	});
}
