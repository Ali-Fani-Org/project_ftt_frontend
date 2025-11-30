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

export interface NotificationService {
  connect(): Promise<void>;
  disconnect(): void;
  isConnected(): boolean;
}

/**
 * Notification service that works only in Tauri environment
 * Connects to SSE endpoint and shows native notifications
 */
class TauriNotificationService implements NotificationService {
  private abortController: AbortController | null = null;
  private isConnecting = false;
  private connected = false;
  private serviceId = Math.random().toString(36).substr(2, 9);
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;

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
    console.log(`[NotificationService ${this.serviceId}] Starting connection attempt`);

    let connectionError = false;

    try {
      const token = get(authToken);
      const base = get(baseUrl);

      console.log(`[NotificationService ${this.serviceId}] Token available: ${!!token}, Base URL: ${base}`);

      if (!token) {
        console.warn(`[NotificationService ${this.serviceId}] No auth token available for notification connection`);
        this.isConnecting = false;
        return;
      }

      // Create abort controller for this connection
      this.abortController = new AbortController();
      
      // Create SSE connection with proper Authorization header using fetch
      const url = `${base}/api/notifications/sse/`;
      
      console.log(`[NotificationService ${this.serviceId}] Connecting to SSE URL: ${url}`);
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Token ${token}`,
          'Accept': 'text/event-stream'
        },
        signal: this.abortController.signal
      });

      if (!response.ok) {
        throw new Error(`SSE connection failed: ${response.status} ${response.statusText}`);
      }

      if (!response.body) {
        throw new Error('SSE response has no body');
      }

      console.log(`[NotificationService ${this.serviceId}] ✅ SSE connection opened successfully`);
      this.connected = true;
      this.isConnecting = false;
      this.reconnectAttempts = 0;

      // Set up event handling for the readable stream
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      try {
        while (true) {
          const { done, value } = await reader.read();
          
          if (done) {
            console.log(`[NotificationService ${this.serviceId}] SSE stream completed`);
            break;
          }

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          
          // Keep the last incomplete line in buffer
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6);
              
              if (data === '[DONE]') {
                console.log(`[NotificationService ${this.serviceId}] SSE stream ended`);
                return;
              }
              
              if (data.trim()) {
                console.log(`[NotificationService ${this.serviceId}] 📨 Received SSE message:`, data);
                try {
                  const notification: NotificationData = JSON.parse(data);
                  console.log(`[NotificationService ${this.serviceId}] 🔔 Parsed notification:`, notification);
                  
                  // Show native notification via Tauri command
                  await this.showNotification(notification);
                  
                  // Acknowledge the notification
                  await this.acknowledgeNotification(notification.id);
                  
                } catch (error) {
                  console.error(`[NotificationService ${this.serviceId}] ❌ Failed to parse notification data:`, error);
                  console.error(`[NotificationService ${this.serviceId}] Raw event data:`, data);
                }
              }
            }
          }
        }
      } finally {
        reader.releaseLock();
      }

    } catch (error: any) {
      connectionError = true;
      if (error.name === 'AbortError') {
        console.log(`[NotificationService ${this.serviceId}] SSE connection aborted`);
      } else {
        console.error(`[NotificationService ${this.serviceId}] ❌ Failed to connect to notification SSE:`, error);
        this.handleReconnect();
      }
    } finally {
      this.isConnecting = false;
      // Only reset connection state if there was an actual error
      // If the stream ended normally, keep the connection state
      if (connectionError) {
        this.connected = false;
      }
    }
  }

  disconnect(): void {
    console.log(`[NotificationService ${this.serviceId}] disconnect() called`);
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
      console.log(`[NotificationService ${this.serviceId}] SSE connection aborted`);
    }
    this.connected = false;
    this.isConnecting = false;
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
    
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      
      const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts - 1), 30000); // Max 30 seconds
      
      console.log(`[NotificationService ${this.serviceId}] ⏰ Attempting to reconnect in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
      
      setTimeout(() => {
        console.log(`[NotificationService ${this.serviceId}] 🔄 Triggering reconnection attempt ${this.reconnectAttempts}`);
        this.connect().catch(console.error);
      }, delay);
    } else {
      console.error(`[NotificationService ${this.serviceId}] 🚫 Max reconnection attempts reached. Giving up.`);
    }
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
authToken.subscribe((token) => {
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