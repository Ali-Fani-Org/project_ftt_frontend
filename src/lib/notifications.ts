import { browser } from '$app/environment';
import { authToken, baseUrl } from './stores';
import { get } from 'svelte/store';
import logger from '$lib/logger';

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
      logger.warn(`[NotificationService ${this.serviceId}] Can only be used in browser environment`);
      throw new Error('NotificationService can only be used in browser environment');
    }
  }

  async connect(): Promise<void> {
    if (this.isConnecting || this.connected) {
      return;
    }

    this.isConnecting = true;
    this.connectionStartTime = Date.now();
    this.lastError = null;

    try {
      const token = get(authToken);
      const base = get(baseUrl);

      if (!token) {
        logger.warn(`[NotificationService ${this.serviceId}] 🚫 BLOCKED: No auth token available`);
        this.isConnecting = false;
        this.connected = false;
        this.connectionStartTime = null;
        this.lastError = 'Authentication required - please log in first';
        return;
      }

      if (!base) {
        logger.warn(`[NotificationService ${this.serviceId}] 🚫 BLOCKED: No base URL available`);
        this.isConnecting = false;
        this.connected = false;
        this.connectionStartTime = null;
        this.lastError = 'Base URL not configured';
        return;
      }

      this.pollController = new AbortController();
      this.connected = true;
      this.isConnecting = false;
      this.reconnectAttempts = 0;

      this.startPolling(token, base);

    } catch (error: any) {
      if (error.name !== 'AbortError') {
        this.lastError = error.message || 'Unknown connection error';
        logger.error(`[NotificationService ${this.serviceId}] ❌ Failed to start long polling:`, error);
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
          if (response.status === 401) {
            logger.error(`[NotificationService ${this.serviceId}] 🚫 401 Unauthorized - clearing invalid auth token`);
            
            try {
              authToken.set(null);
            } catch (error) {
              logger.error(`[NotificationService ${this.serviceId}] ❌ Failed to clear auth token:`, error);
            }
            
            this.connected = false;
            this.isPolling = false;
            this.lastError = 'Authentication expired - please log in again';
            return;
          }
          
          throw new Error(`Long polling failed: ${response.status} ${response.statusText}`);
        }

        const data: LongPollResponse = await response.json();
        
        if (data.has_new_notifications && data.notifications.length > 0) {
          for (const notification of data.notifications) {
            logger.debug(`[NotificationService ${this.serviceId}] 🔔 New notification:`, notification);
            
            await this.showNotification(notification);
            await this.acknowledgeNotification(notification.id);
          }
          
          setTimeout(pollOnce, 0);
        } else {
          setTimeout(pollOnce, this.pollInterval);
        }

      } catch (error: any) {
        if (error.name !== 'AbortError') {
          this.lastError = error.message || 'Polling error';
          logger.error(`[NotificationService ${this.serviceId}] ❌ Polling error:`, error);
        }
        
        this.isPolling = false;
        this.connected = false;
        this.handleReconnect();
      }
    };

    pollOnce();
  }

  disconnect(): void {
    logger.debug(`[NotificationService ${this.serviceId}] disconnect() called`);
    this.isPolling = false;
    
    if (this.pollController) {
      this.pollController.abort();
      this.pollController = null;
      logger.debug(`[NotificationService ${this.serviceId}] Long polling connection aborted`);
    }
    this.connected = false;
    this.isConnecting = false;
    this.connectionStartTime = null;
  }

  isConnected(): boolean {
    logger.debug(`[NotificationService ${this.serviceId}] isConnected() -> ${this.connected}`);
    return this.connected;
  }

  private async showNotification(notification: NotificationData): Promise<void> {
    logger.debug(`[NotificationService ${this.serviceId}] 🎯 showNotification() called for:`, notification);
    try {
      // Check if we're in Tauri environment
      const { invoke } = await import('@tauri-apps/api/core');
      
      if (!invoke) {
        logger.warn(`[NotificationService ${this.serviceId}] ⚠️ Tauri API not available for notifications`);
        return;
      }

      logger.debug(`[NotificationService ${this.serviceId}] ✅ Tauri API available, preparing notification`);

      // Map notification types to appropriate titles
      const typeTitle = this.getNotificationTitle(notification.type);
      const fullTitle = `Time Tracker - ${typeTitle}`;
      
      logger.debug(`[NotificationService ${this.serviceId}] 📱 Calling show_notification with:`, {
        title: fullTitle,
        body: notification.message,
        notificationType: notification.type
      });
      
      // Show native notification using the new channel-based system
      await invoke('show_notification', {
        title: fullTitle,
        body: notification.message,
        notificationType: notification.type
      });
      
      logger.debug(`[NotificationService ${this.serviceId}] ✅ Native notification requested: ${fullTitle} - ${notification.message}`);
      
    } catch (error) {
      logger.error(`[NotificationService ${this.serviceId}] ❌ Failed to show native notification:`, error);
    }
  }

  private async acknowledgeNotification(notificationId: string): Promise<void> {
    logger.debug(`[NotificationService ${this.serviceId}] 📤 acknowledgeNotification() called for ID:`, notificationId);
    try {
      const token = get(authToken);
      const base = get(baseUrl);
      
      if (!token) {
        logger.warn(`[NotificationService ${this.serviceId}] ⚠️ No auth token available for notification acknowledgment`);
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
        logger.debug(`[NotificationService ${this.serviceId}] ✅ Notification ${notificationId} acknowledged`);
      } else {
        // Handle authentication failures for acknowledgment
        if (response.status === 401) {
          logger.error(`[NotificationService ${this.serviceId}] 🚫 401 Unauthorized during acknowledgment - clearing invalid auth token`);
          
          // Clear the invalid auth token to force re-authentication
          try {
            authToken.set(null);
            logger.debug(`[NotificationService ${this.serviceId}] 🗑️ Invalid auth token cleared during acknowledgment`);
          } catch (error) {
            logger.error(`[NotificationService ${this.serviceId}] ❌ Failed to clear auth token:`, error);
          }
          
          this.lastError = 'Authentication expired - please log in again';
          return;
        }
        
        logger.warn(`[NotificationService ${this.serviceId}] ⚠️ Failed to acknowledge notification ${notificationId}:`, response.status);
      }
      
    } catch (error) {
      logger.error(`[NotificationService ${this.serviceId}] ❌ Failed to acknowledge notification:`, error);
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
    
    logger.debug(`[NotificationService ${this.serviceId}] 📝 Mapped type "${type}" to title "${title}"`);
    return title;
  }

  private handleReconnect(): void {
    logger.debug(`[NotificationService ${this.serviceId}] 🔄 handleReconnect() called, attempts: ${this.reconnectAttempts}/${this.maxReconnectAttempts}`);
    this.connected = false;
    this.isConnecting = false;
    this.isPolling = false;
    
    // Check if we still have authentication before attempting reconnection
    const token = get(authToken);
    if (!token) {
      logger.debug(`[NotificationService ${this.serviceId}] 🛑 Reconnection blocked - no auth token available`);
      this.lastError = 'Authentication required - please log in first';
      return;
    }
    
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      
      // Exponential backoff for reconnection attempts
      const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts - 1), 30000); // Max 30 seconds
      
      logger.debug(`[NotificationService ${this.serviceId}] ⏰ Attempting to reconnect in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
      
      setTimeout(() => {
        logger.debug(`[NotificationService ${this.serviceId}] 🔄 Triggering reconnection attempt ${this.reconnectAttempts}`);
        this.connect().catch(logger.error);
      }, delay);
    } else {
      logger.error(`[NotificationService ${this.serviceId}] 🚫 Max reconnection attempts reached. Giving up.`);
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
  
  if (!browser) {
    logger.warn('⚠️ createNotificationService: Can only be created in browser environment');
    throw new Error('NotificationService can only be created in browser environment');
  }
  
  return new TauriNotificationService();
}

/**
 * Auto-connect to notifications when auth token is available
 */
let globalNotificationService: NotificationService | null = null;

export function getNotificationService(): NotificationService {
  if (!globalNotificationService) {
    globalNotificationService = createNotificationService();
  } else {
    logger.debug('♻️ Reusing existing global notification service');
  }
  return globalNotificationService;
}

// Initialize on module load
getNotificationService(); // Initialize the service

// Auto-connect when auth token changes - only connect with valid authentication
authToken.subscribe((token: string | null) => {
  
  if (token && globalNotificationService) {
    globalNotificationService.connect().catch(logger.error);
  } else if (!token && globalNotificationService) {
    globalNotificationService.disconnect();
  }
});