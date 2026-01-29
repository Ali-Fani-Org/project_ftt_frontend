import { writable, derived } from 'svelte/store';
import { browser } from '$app/environment';

// Network status interface
export interface NetworkStatus {
  isOnline: boolean;
  isChecking: boolean;
  lastChecked: Date | null;
  connectionType: 'online' | 'offline' | 'unknown';
  connectionInfo: any | null;
}

// Create the network status store
const createNetworkStore = () => {
  const { subscribe, set, update } = writable<NetworkStatus>({
    isOnline: false,
    isChecking: true,
    lastChecked: null,
    connectionType: 'unknown',
    connectionInfo: null,
  });

  // Initialize network detection
  if (browser) {
    // Check initial connection status
    const checkInitialStatus = () => {
      const isOnline = navigator.onLine;
      const connectionInfo = (navigator as any).connection || (navigator as any).mozConnection || (navigator as any).webkitConnection;
      
      set({
        isOnline,
        isChecking: false,
        lastChecked: new Date(),
        connectionType: isOnline ? 'online' : 'offline',
        connectionInfo: connectionInfo || null,
      });
    };

    // Event listeners for connection changes
    const handleOnline = () => {
      const connectionInfo = (navigator as any).connection || (navigator as any).mozConnection || (navigator as any).webkitConnection;
      update((status) => ({
        ...status,
        isOnline: true,
        isChecking: false,
        lastChecked: new Date(),
        connectionType: 'online',
        connectionInfo: connectionInfo || null,
      }));
    };

    const handleOffline = () => {
      update((status) => ({
        ...status,
        isOnline: false,
        isChecking: false,
        lastChecked: new Date(),
        connectionType: 'offline',
        connectionInfo: null,
      }));
    };

    const handleConnectionChange = () => {
      const connectionInfo = (navigator as any).connection || (navigator as any).mozConnection || (navigator as any).webkitConnection;
      update((status) => ({
        ...status,
        connectionInfo: connectionInfo || null,
      }));
    };

    // Add event listeners
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    if ((navigator as any).connection) {
      (navigator as any).connection.addEventListener('change', handleConnectionChange);
    }

    // Check initial status
    checkInitialStatus();
  }

  return { subscribe };
};

// Create and export the network store
export const network = createNetworkStore();

// Derived store for simplified online status
export const isOnline = derived(network, ($network) => $network.isOnline);

// Utility function to check connectivity with timeout
export async function checkConnectivity(timeout: number = 3000): Promise<boolean> {
  if (!browser) return false;

  return new Promise((resolve) => {
    // Check navigator.onLine first
    if (!navigator.onLine) {
      resolve(false);
      return;
    }

    // Create a timeout
    const timer = setTimeout(() => {
      resolve(false);
    }, timeout);

    // Try to fetch a simple resource
    const controller = new AbortController();
    const signal = controller.signal;

    fetch('https://www.google.com', { signal })
      .then(() => {
        clearTimeout(timer);
        controller.abort();
        resolve(true);
      })
      .catch(() => {
        clearTimeout(timer);
        controller.abort();
        resolve(false);
      });
  });
}

// Utility function to show network status in console
export function logNetworkStatus(): void {
  if (browser) {
    const connectionInfo = (navigator as any).connection;
    console.log('Network Status:', {
      isOnline: navigator.onLine,
      connectionType: connectionInfo?.effectiveType || 'unknown',
      downlink: connectionInfo?.downlink || 'unknown',
      rtt: connectionInfo?.rtt || 'unknown',
    });
  }
}

// Export the network utility functions
export const networkUtils = {
  checkConnectivity,
  logNetworkStatus,
  isOnline,
};

// Export the network store
export default network;