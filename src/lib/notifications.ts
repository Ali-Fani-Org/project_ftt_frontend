console.log('🔧 Notification module being imported...');

import { browser } from '$app/environment';
import { authToken, baseUrl } from './stores';
import { get } from 'svelte/store';

export interface NotificationData {
  id: string;
  type: 'INFO' | 'WARNING' | 'ERROR' | 'SUCCESS' | 'CRITICAL' | 'OTHER';
  message: string;
  created_at: string;
  read: boolean;
  delivered_at: string | null;
}

export interface LongPollResponse {
  status: 'immediate' | 'new_notification' | 'timeout';
  notifications: NotificationData[];
  has_new_notifications: boolean;
  message?: string;
}

export interface NotificationService {
  connect(): Promise<void>;
  disconnect(): void;
  isConnected(): boolean;
  isConnecting?: boolean;
  getLastError?: () => string | null;
}

/**
 * Notification service that works only in Tauri environment
 * Uses long polling to receive notifications via HTTP requests
 */
class TauriNotificationService implements NotificationService {
  private pollController: AbortController | null = null;
  isConnecting = false;
  private connected = false;
  private serviceId = Math.random().toString(36).substr(2, 9);
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private connectionStartTime: number | null = null;
  private pollTimeout: number = 30; // 30 second timeout as recommended
  private pollInterval: number = 1000; // 1 second delay between polls when no notifications
  private timeoutHandle: any = null;
  private lastError: string | null = null;
  private isPolling = false;

  constructor() {
    // Only initialize in browser environment
    if (!browser) {
      console.warn(`[NotificationService ${this.serviceId}] Can only be used in browser environment`);
      throw new Error('NotificationService can only be used in browser environment');
    }
    
    console.log(`[NotificationService ${this.serviceId}] TauriNotificationService constructor called`);
  }

  async connect(): Promise<void> {
    console.log(`[NotificationService ${this.serviceId}] connect() called, isConnecting: ${this.isConnecting}, isConnected: ${this.connected}`);
    
    if (this.isConnecting || this.connected) {
      console.log(`[NotificationService ${this.serviceId}] Already connected or connecting, skipping`);
      return;
    }

    this.isConnecting = true;
    this.connectionStartTime = Date.now();
    this.lastError = null;
    
    console.log(`[NotificationService ${this.serviceId}] Starting long polling connection at ${this.connectionStartTime}`);

    try {
      const token = get(authToken);
      const base = get(baseUrl) as string;

      console.log(`[NotificationService ${this.serviceId}] Token available: ${!!token}, Base URL: ${base}`);

      if (!token) {
        console.warn(`[NotificationService ${this.serviceId}] No auth token available for notification connection`);
        this.isConnecting = false;
        this.connectionStartTime = null;
        return;
      }

      // Create abort controller for this polling session
      this.pollController = new AbortController();
      
      console.log(`[NotificationService ${this.serviceId}] ✅ Long polling connection established`);
      this.connected = true;
      this.isConnecting = false;
      this.reconnectAttempts = 0;

      // Start the polling loop
      this.startPolling(token, base);

    } catch (error: any) {
      const elapsed = this.connectionStartTime ? Date.now() - this.connectionStartTime : 0;
      
      if (error.name === 'AbortError') {
        console.log(`[NotificationService ${this.serviceId}] Long polling connection aborted`);
      } else {
        this.lastError = error.message || 'Unknown connection error';
        console.error(`[NotificationService ${this.serviceId}] ❌ Failed to start long polling after ${elapsed}ms:`, error);
      }
      
      this.connected = false;
      this.isConnecting = false;
      this.handleReconnect();
    } finally {
      this.connectionStartTime = null;
    }
  }

  private async startPolling(token: string, base: string): Promise<void> {
    if (this.isPolling) return;
    this.isPolling = true;

    const pollOnce = async (): Promise<void> => {
      if (!this.connected || !this.pollController) return;

      try {
        console.log(`[NotificationService ${this.serviceId}] 🔄 Polling for notifications...`);
        
        const url = `${base}/api/notifications/long-poll/?timeout=${this.pollTimeout}`;
        
        const response = await fetch(url, {
          method: 'GET',
          headers: {
            'Authorization': `Token ${token}`,
            'Content-Type': 'application/json'
          },
          signal: this.pollController.signal
        });

        if (!response.ok) {
          throw new Error(`Long polling failed: ${response.status} ${response.statusText}`);
        }

        const data: LongPollResponse = await response.json();
        
        console.log(`[NotificationService ${this.serviceId}] 📨 Received poll response:`, {
          status: data.status,
          has_new_notifications: data.has_new_notifications,
          notification_count: data.notifications.length
        });

        // Handle different response types
        if (data.has_new_notifications && data.notifications.length > 0) {
          for (const notification of data.notifications) {
            console.log(`[NotificationService ${this.serviceId}] 🔔 Processing notification:`, notification);
            
            // Show native notification via Tauri command
            await this.showNotification(notification);
            
            // Acknowledge the notification
            await this.acknowledgeNotification(notification.id);
          }
          
          // Continue polling immediately for more notifications
          setTimeout(pollOnce, 0);
        } else {
          // No new notifications, wait and poll again
          setTimeout(pollOnce, this.pollInterval);
        }

      } catch (error: any) {
        if (error.name === 'AbortError') {
          console.log(`[NotificationService ${this.serviceId}] Polling aborted`);
          return;
        }
        
        this.lastError = error.message || 'Polling error';
        console.error(`[NotificationService ${this.serviceId}] ❌ Polling error:`, error);
        
        // Stop polling on error
        this.isPolling = false;
        this.connected = false;
        
        // Trigger reconnection
        this.handleReconnect();
      }
    };

    // Start the first poll
    pollOnce();
  }

  disconnect(): void {
    console.log(`[NotificationService ${this.serviceId}] disconnect() called`);
    this.isPolling = false;
    
    if (this.pollController) {
      this.pollController.abort();
      this.pollController = null;
      console.log(`[NotificationService ${this.serviceId}] Long polling connection aborted`);
    }
    this.connected = false;
    this.isConnecting = false;
    this.connectionStartTime = null;
  }

  isConnected(): boolean {
    console.log(`[NotificationService ${this.serviceId}] isConnected() -> ${this.connected}`);
    return this.connected;
  }

  private async showNotification(notification: NotificationData): Promise<void> {
    console.log(`[NotificationService ${this.serviceId}] 🎯 showNotification() called for:`, notification);
    try {
      // Check if we're in Tauri environment
      const { invoke } = await import('@tauri-apps/api/core');
      
      if (!invoke) {
        console.warn(`[NotificationService ${this.serviceId}] ⚠️ Tauri API not available for notifications`);
        return;
      }

      console.log(`[NotificationService ${this.serviceId}] ✅ Tauri API available, preparing notification`);

      // Map notification types to appropriate titles
      const typeTitle = this.getNotificationTitle(notification.type);
      const fullTitle = `Time Tracker - ${typeTitle}`;
      
      console.log(`[NotificationService ${this.serviceId}] 📱 Calling show_notification with:`, {
        title: fullTitle,
        body: notification.message,
        notificationType: notification.type
      });
      
      // Show native notification - Note: The Tauri command now accepts app handle internally
      await invoke('show_notification', {
        title: fullTitle,
        body: notification.message,
        notificationType: notification.type
      });
      
      console.log(`[NotificationService ${this.serviceId}] ✅ Native notification shown: ${fullTitle} - ${notification.message}`);
      
    } catch (error) {
      console.error(`[NotificationService ${this.serviceId}] ❌ Failed to show native notification:`, error);
    }
  }

  private async acknowledgeNotification(notificationId: string): Promise<void> {
    console.log(`[NotificationService ${this.serviceId}] 📤 acknowledgeNotification() called for ID:`, notificationId);
    try {
      const token = get(authToken);
      const base = get(baseUrl);
      
      if (!token) {
        console.warn(`[NotificationService ${this.serviceId}] ⚠️ No auth token available for notification acknowledgment`);
        return;
      }

      const response = await fetch(`${base}/api/notifications/${notificationId}/acknowledge/`, {
        method: 'POST',
        headers: {
          'Authorization': `Token ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        console.log(`[NotificationService ${this.serviceId}] ✅ Notification ${notificationId} acknowledged`);
      } else {
        console.warn(`[NotificationService ${this.serviceId}] ⚠️ Failed to acknowledge notification ${notificationId}:`, response.status);
      }
      
    } catch (error) {
      console.error(`[NotificationService ${this.serviceId}] ❌ Failed to acknowledge notification:`, error);
    }
  }

  private getNotificationTitle(type: NotificationData['type']): string {
    const title = (() => {
      switch (type) {
        case 'ERROR': return 'Error';
        case 'WARNING': return 'Warning';
        case 'SUCCESS': return 'Success';
        case 'CRITICAL': return 'Critical';
        case 'INFO': return 'Info';
        default: return 'Notification';
      }
    })();
    
    console.log(`[NotificationService ${this.serviceId}] 📝 Mapped type "${type}" to title "${title}"`);
    return title;
  }

  private handleReconnect(): void {
    console.log(`[NotificationService ${this.serviceId}] 🔄 handleReconnect() called, attempts: ${this.reconnectAttempts}/${this.maxReconnectAttempts}`);
    this.connected = false;
    this.isConnecting = false;
    this.isPolling = false;
    
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      
      // Exponential backoff for reconnection attempts
      const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts - 1), 30000); // Max 30 seconds
      
      console.log(`[NotificationService ${this.serviceId}] ⏰ Attempting to reconnect in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
      
      setTimeout(() => {
        console.log(`[NotificationService ${this.serviceId}] 🔄 Triggering reconnection attempt ${this.reconnectAttempts}`);
        this.connect().catch(console.error);
      }, delay);
    } else {
      console.error(`[NotificationService ${this.serviceId}] 🚫 Max reconnection attempts reached. Giving up.`);
      this.lastError = 'Max reconnection attempts reached. Please check your network connection.';
    }
  }

  getLastError(): string | null {
    return this.lastError;
  }
}

/**
 * Create and return the notification service
 * Only available in Tauri environment
 */
export function createNotificationService(): NotificationService {
  console.log('🔧 createNotificationService() called');
  
  if (!browser) {
    console.warn('⚠️ createNotificationService: Can only be created in browser environment');
    throw new Error('NotificationService can only be created in browser environment');
  }
  
  console.log('✅ Creating TauriNotificationService instance');
  return new TauriNotificationService();
}

/**
 * Auto-connect to notifications when auth token is available
 */
let globalNotificationService: NotificationService | null = null;

export function getNotificationService(): NotificationService {
  console.log('🔧 getNotificationService() called');
  
  if (!globalNotificationService) {
    console.log('🆕 Creating new global notification service');
    globalNotificationService = createNotificationService();
  } else {
    console.log('♻️ Reusing existing global notification service');
  }
  return globalNotificationService;
}

// Initialize on module load
console.log('🚀 Notification module loaded');
getNotificationService(); // Initialize the service

// Auto-connect when auth token changes
authToken.subscribe((token: string | null) => {
  console.log(`🔑 Auth token changed: ${token ? 'TOKEN_AVAILABLE' : 'NO_TOKEN'}`);
  console.log(`🔍 Global service available: ${!!globalNotificationService}`);
  
  if (token && globalNotificationService) {
    console.log('🔗 Auth token available, connecting to notifications...');
    globalNotificationService.connect().catch(console.error);
  } else if (!token && globalNotificationService) {
    console.log('🔌 No auth token, disconnecting from notifications...');
    globalNotificationService.disconnect();
  } else {
    console.log('⚠️ Cannot connect: token=' + !!token + ', service=' + !!globalNotificationService);
  }
});

// Also try to connect immediately if token is already available when module loads
setTimeout(() => {
  const currentToken = get(authToken);
  console.log('🚀 Delayed connection check - token available:', !!currentToken);
  if (currentToken && globalNotificationService) {
    console.log('🚀 Attempting immediate connection...');
    globalNotificationService.connect().catch(console.error);
  }
}, 1000);