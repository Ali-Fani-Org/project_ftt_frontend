import { writable } from 'svelte/store';
import { browser } from '$app/environment';
import { goto } from '$app/navigation';

// Initialize Tauri settings store
let tauriSettingsStore: any = null;
let tauriSettingsInitialized = false;

async function initializeTauriSettingsStore() {
  if (tauriSettingsInitialized) return tauriSettingsStore;
  
  if (typeof window !== 'undefined' && (window as any).__TAURI__) {
    try {
      const { LazyStore } = await import('@tauri-apps/plugin-store');
      tauriSettingsStore = new LazyStore('settings.json');
      await tauriSettingsStore.load();
      tauriSettingsInitialized = true;
      console.log('✅ Tauri settings store initialized');
    } catch (e) {
      console.error('Failed to initialize Tauri settings store:', e);
      tauriSettingsInitialized = true; // Prevent repeated failed attempts
    }
  }
  
  return tauriSettingsStore;
}

async function getTauriSetting<T>(key: string, initialValue: T): Promise<T> {
  try {
    const store = await initializeTauriSettingsStore();
    if (store) {
      const value = await store.get(key);
      if (value !== undefined && value !== null) {
        console.log(`✅ Loaded setting ${key} from Tauri store:`, value);
        return value as T;
      }
    }
  } catch (e) {
    console.error(`Failed to load setting ${key} from Tauri store:`, e);
  }
  
  // Fallback to localStorage for web development
  if (browser) {
    try {
      const storedValue = localStorage.getItem(key);
      if (storedValue) {
        const parsedValue = JSON.parse(storedValue);
        console.log(`✅ Loaded setting ${key} from localStorage (fallback):`, parsedValue);
        return parsedValue;
      }
    } catch (e) {
      console.error(`Failed to load setting ${key} from localStorage:`, e);
    }
  }
  
  console.log(`🔄 Using default value for ${key}:`, initialValue);
  return initialValue;
}

async function setTauriSetting(key: string, value: any): Promise<void> {
  try {
    const store = await initializeTauriSettingsStore();
    if (store) {
      await store.set(key, value);
      await store.save();
      console.log(`✅ Saved setting ${key} to Tauri store:`, value);
    }
  } catch (e) {
    console.error(`Failed to save setting ${key} to Tauri store:`, e);
  }
  
  // Also save to localStorage as fallback for web development
  if (browser) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      console.log(`✅ Saved setting ${key} to localStorage (fallback)`);
    } catch (e) {
      console.error(`Failed to save setting ${key} to localStorage:`, e);
    }
  }
}

function createPersistentStore<T>(key: string, initialValue: T) {
  let store: any;
  let isInitialized = false;

  // Create the store with proper initialization
  const createStore = async () => {
    const loadedValue = await getTauriSetting(key, initialValue);
    store = writable<T>(loadedValue);
    isInitialized = true;

    // Subscribe to changes and save to Tauri store
    store.subscribe((value: T) => {
      if (isInitialized) {
        setTauriSetting(key, value);
      }
    });

    return store;
  };

  // Initialize asynchronously
  createStore();

  // Return a proxy that will be properly initialized
  return {
    subscribe: (run: any) => {
      if (!isInitialized) {
        // If not initialized yet, wait for it
        const initInterval = setInterval(() => {
          if (isInitialized) {
            clearInterval(initInterval);
            return store.subscribe(run);
          }
        }, 10);
        return () => clearInterval(initInterval);
      }
      return store.subscribe(run);
    },
    set: (value: T) => {
      if (!isInitialized) {
        // Wait for initialization
        const initInterval = setInterval(() => {
          if (isInitialized) {
            clearInterval(initInterval);
            store.set(value);
          }
        }, 10);
        return;
      }
      store.set(value);
    },
    update: (fn: any) => {
      if (!isInitialized) {
        // Wait for initialization
        const initInterval = setInterval(() => {
          if (isInitialized) {
            clearInterval(initInterval);
            store.update(fn);
          }
        }, 10);
        return;
      }
      store.update(fn);
    }
  };
}

export const authToken = createPersistentStore<string | null>('authToken', null);
export const user = createPersistentStore<{ id: number; username: string; first_name: string; last_name: string; profile_image: string | null } | null>('user', null);

export const baseUrl = createPersistentStore<string>('baseUrl', 'https://hr.trinitycyberian.com');
export const theme = createPersistentStore<string>('theme', 'light');
export const customThemes = createPersistentStore<Record<string, Record<string, string>>>('customThemes', {});

// Variable to track if we've loaded the initial baseUrl value
let hasLoadedInitialBaseUrl = false;
let previousBaseUrl: string | null = null;

// Subscribe to baseUrl changes to handle logout when URL changes
baseUrl.subscribe((newBaseUrl: string) => {
  if (!hasLoadedInitialBaseUrl) {
    // This is the first time loading the baseUrl value from storage, just mark as loaded
    hasLoadedInitialBaseUrl = true;
    previousBaseUrl = newBaseUrl;
  } else if (previousBaseUrl !== newBaseUrl) {
    // Base URL has changed after initial load, log out the user and show appropriate message
    console.log(`Base URL changed from ${previousBaseUrl} to ${newBaseUrl}, logging out user`);

    // Perform logout with a custom message about the base URL change
    const customMessage = `Base URL changed from "${previousBaseUrl}" to "${newBaseUrl}". You have been logged out for security reasons.`;
    globalLogout(false, customMessage);

    // Update the previous URL to the new one after logout
    previousBaseUrl = newBaseUrl;
  }
});
export const minimizeToTray = createPersistentStore<boolean>('minimizeToTray', true);
export const closeToTray = createPersistentStore<boolean>('closeToTray', false);
export const autostart = createPersistentStore<boolean>('autostart', false);

export const timeEntriesDisplayMode = createPersistentStore<string>('timeEntriesDisplayMode', 'window');

// Logout alert state
export const logoutAlert = writable<{show: boolean, message: string}>({show: false, message: ''});

// Global logout function that can be used by API hooks
export function globalLogout(autoLogout = false, customMessage?: string) {
  // Clear only authentication-related data from localStorage, preserve settings
  if (browser) {
    // Get all keys before clearing to preserve settings
    const keysToPreserve = ['baseUrl', 'theme', 'customThemes', 'minimizeToTray', 'closeToTray', 'autostart', 'timeEntriesDisplayMode', 'sidebarCollapsed'];

    // Create a temporary object to store settings
    const preservedSettings: Record<string, any> = {};
    for (const key of keysToPreserve) {
      const storedValue = localStorage.getItem(key);
      if (storedValue !== null) {
        try {
          preservedSettings[key] = JSON.parse(storedValue);
        } catch (e) {
          console.warn(`Failed to parse setting ${key}:`, e);
        }
      }
    }

    // Clear all localStorage
    localStorage.clear();

    // Restore only the preserved settings
    for (const [key, value] of Object.entries(preservedSettings)) {
      try {
        localStorage.setItem(key, JSON.stringify(value));
      } catch (e) {
        console.error(`Failed to restore setting ${key}:`, e);
      }
    }

    // Clear sessionStorage completely (for security)
    sessionStorage.clear();
  }

  // Reset stores
  authToken.set(null);
  user.set(null);

  // Reset the baseUrl tracking so that the next app load won't trigger logout
  hasLoadedInitialBaseUrl = false;
  previousBaseUrl = null;

  // Show alert with appropriate message based on context
  let message = '';
  if (customMessage) {
    // Use custom message if provided (e.g., for base URL changes)
    message = customMessage;
  } else if (autoLogout) {
    // Automatic logout due to 401 response (session expired)
    message = 'Your session has expired. Please log in again.';
  } else {
    // User-initiated logout
    message = 'You have been logged out successfully.';
  }

  // Set the logout alert with the appropriate message
  logoutAlert.set({
    show: true,
    message: message
  });

  // Redirect to login page
  goto('/');
}

export const logout = () => globalLogout(false);

// Feature flags store
export interface FeatureFlagsState {
  enabledFeatures: Set<string>;
  disabledFeatures: Set<string>;
  loading: boolean;
  error: string | null;
  lastUpdated: Date | null;
}

function createFeatureFlagsStore() {
  const { subscribe, set, update } = writable<FeatureFlagsState>({
    enabledFeatures: new Set(),
    disabledFeatures: new Set(),
    loading: false,
    error: null,
    lastUpdated: null,
  });

  let cacheTimer: NodeJS.Timeout | null = null;

  return {
    subscribe,
    
    // Load all features for the current user
    loadFeatures: async (preloadedData?: any) => {
      update(state => ({ ...state, loading: true, error: null }));

      try {
        let response;

        if (preloadedData) {
          // Use preloaded data if provided
          response = preloadedData;
        } else {
          // Fetch from API if no preloaded data
          const { featureFlags } = await import('./api');
          response = await featureFlags.getMyFeatures();
        }

        const enabledKeys = new Set(response.enabled_features.map(f => f.key));
        const disabledKeys = new Set(response.disabled_features.map(f => f.key));

        update(state => ({
          ...state,
          enabledFeatures: enabledKeys,
          disabledFeatures: disabledKeys,
          loading: false,
          error: null,
          lastUpdated: new Date(),
        }));
      } catch (error) {
        console.error('Failed to load feature flags:', error);
        update(state => ({
          ...state,
          loading: false,
          error: 'Failed to load feature flags',
        }));
      }
    },
    
    // Check if a specific feature is enabled
    isFeatureEnabled: async (featureKey: string): Promise<boolean> => {
      let isEnabled = false;
      
      // First check local cache
      update(state => {
        if (state.enabledFeatures.has(featureKey)) {
          isEnabled = true;
        } else if (state.disabledFeatures.has(featureKey)) {
          isEnabled = false;
        }
        return state;
      });
      
      // If not in cache, check with API
      if (!isEnabled) {
        try {
          const { featureFlags } = await import('./api');
          const check = await featureFlags.checkFeature(featureKey);
          isEnabled = check.is_enabled && check.user_has_access;
          
          // Update cache
          update(state => {
            const newEnabled = new Set(state.enabledFeatures);
            const newDisabled = new Set(state.disabledFeatures);
            
            if (isEnabled) {
              newEnabled.add(featureKey);
              newDisabled.delete(featureKey);
            } else {
              newDisabled.add(featureKey);
              newEnabled.delete(featureKey);
            }
            
            return {
              ...state,
              enabledFeatures: newEnabled,
              disabledFeatures: newDisabled,
            };
          });
        } catch (error) {
          console.error(`Failed to check feature flag ${featureKey}:`, error);
          // Return false on error (fail secure)
          isEnabled = false;
        }
      }
      
      return isEnabled;
    },
    
    // Log feature access
    logFeatureAccess: async (featureKey: string) => {
      try {
        const { featureFlags } = await import('./api');
        await featureFlags.logAccess(featureKey);
      } catch (error) {
        console.error(`Failed to log access for feature ${featureKey}:`, error);
        // Don't throw - logging failure shouldn't break UX
      }
    },
    
    // Clear cache and refresh
    refresh: () => {
      if (cacheTimer) {
        clearTimeout(cacheTimer);
      }
      cacheTimer = setTimeout(() => {
        // Intentionally no dynamic import to avoid duplicating this module in the bundle.
        // Callers should invoke `loadFeatures` explicitly when they need a refresh.
      }, 60000); // Auto-refresh timer (no-op)
    },
    
    // Clear state
    clear: () => {
      set({
        enabledFeatures: new Set(),
        disabledFeatures: new Set(),
        loading: false,
        error: null,
        lastUpdated: null,
      });
    }
  };
}

export const featureFlagsStore = createFeatureFlagsStore();

// Helper function to check if process monitor UI is enabled
export const isProcessMonitorUIEnabled = () => featureFlagsStore.isFeatureEnabled('process-monitor-ui');

// Helper function to check if process monitor backend is enabled
export const isProcessMonitorBackendEnabled = () => featureFlagsStore.isFeatureEnabled('process-monitor-backend');

// Helper function to check if user idle monitoring is enabled
export const isUserIdleMonitoringEnabled = () => featureFlagsStore.isFeatureEnabled('user-idle-monitoring');

// Helper function to check if user idle monitor debug is enabled
export const isUserIdleMonitorDebugEnabled = () => featureFlagsStore.isFeatureEnabled('user_idle_monitor_debug');

// Sidebar collapsed state store (persistent)
export const sidebarCollapsed = createPersistentStore<boolean>('sidebarCollapsed', false);

// User Idle Monitoring Store
export interface IdleStatus {
  is_idle: boolean;
  idle_time_seconds: number;
  last_update: string;
  session_duration_seconds: number;
}

export interface ActivityLog {
  timestamp: string;
  idle_time_seconds: number;
  is_idle: boolean;
  session_duration_seconds: number;
  activity_state: string;
}

// Enhanced Tauri detection function
function isTauriAvailable(): boolean {
  console.log('🔍 Checking Tauri availability...');
  
  // Check multiple ways to detect Tauri
  const checks = [
    typeof window !== 'undefined' && (window as any).__TAURI__,
    typeof window !== 'undefined' && (window as any).__TAURI_INTERNALS__,
    typeof window !== 'undefined' && typeof (window as any).tauri !== 'undefined',
    typeof globalThis !== 'undefined' && (globalThis as any).__TAURI__,
  ];
  
  const isAvailable = checks.some(check => check);
  
  console.log('🔍 Tauri detection results:', {
    window_exists: typeof window !== 'undefined',
    window_tauri: typeof window !== 'undefined' ? !!(window as any).__TAURI__ : false,
    window_tauri_internals: typeof window !== 'undefined' ? !!(window as any).__TAURI_INTERNALS__ : false,
    window_tauri_object: typeof window !== 'undefined' ? typeof (window as any).tauri !== 'undefined' : false,
    global_tauri: typeof globalThis !== 'undefined' ? !!(globalThis as any).__TAURI__ : false,
    final_result: isAvailable
  });
  
  return isAvailable;
}

// Function to get Tauri API with retry
async function getTauriApi(): Promise<any | null> {
  console.log('🔧 Getting Tauri API...');
  
  // Try multiple approaches to get Tauri API
  const approaches = [
    async () => {
      if (isTauriAvailable()) {
        const { invoke } = await import('@tauri-apps/api/core');
        return { invoke, available: true };
      }
      return { invoke: null, available: false };
    },
    async () => {
      // Try using the tauri global object directly
      if (typeof (window as any).tauri !== 'undefined') {
        return { invoke: (window as any).tauri.invoke, available: true };
      }
      return { invoke: null, available: false };
    }
  ];
  
  for (const approach of approaches) {
    try {
      const result = await approach();
      if (result.available) {
        console.log('✅ Tauri API obtained successfully');
        return result;
      }
    } catch (error) {
      console.warn('⚠️ Failed to get Tauri API with approach:', error);
    }
  }
  
  console.log('❌ Failed to get Tauri API with all approaches');
  return null;
}

function createIdleMonitorStore() {
  const { subscribe, set, update } = writable<{
    isEnabled: boolean;
    currentStatus: IdleStatus | null;
    activityLogs: ActivityLog[];
    isMonitoring: boolean;
    error: string | null;
    tauriDetected: boolean;
  }>({
    isEnabled: false,
    currentStatus: null,
    activityLogs: [],
    isMonitoring: false,
    error: null,
    tauriDetected: false,
  });

  let eventListener: (() => void) | null = null;
  let tauriApi: any = null;

  return {
    subscribe,
    
    // Initialize idle monitoring
    initialize: async () => {
      update(state => ({ ...state, error: null }));
      
      try {
        // Check if feature flag is enabled
        const isEnabled = await featureFlagsStore.isFeatureEnabled('user-idle-monitoring');
        update(state => ({ ...state, isEnabled }));
        
        if (!isEnabled) {
          console.log('User idle monitoring is disabled via feature flag');
          return;
        }

        // Check Tauri availability
        const tauriAvailable = isTauriAvailable();
        update(state => ({ ...state, tauriDetected: tauriAvailable }));
        
        if (!tauriAvailable) {
          console.log('❌ Tauri not detected in initialization');
          return;
        }

        console.log('✅ Tauri detected, setting up event listeners...');
        
        // Set up event listeners for idle status updates
        const { listen } = await import('@tauri-apps/api/event');
        
        // Listen for idle status changes
        eventListener = await listen('idle-status-changed', (event) => {
          console.log('🎉 IDLE STATUS CHANGED EVENT RECEIVED:', event.payload);
          const payload = event.payload as any;
          const newStatus: IdleStatus = {
            is_idle: payload.is_idle,
            idle_time_seconds: payload.idle_time_seconds,
            last_update: payload.timestamp,
            session_duration_seconds: payload.session_duration_seconds,
          };
          
          // Add to activity logs
          const activityLog: ActivityLog = {
            timestamp: payload.timestamp,
            idle_time_seconds: payload.idle_time_seconds,
            is_idle: payload.is_idle,
            session_duration_seconds: payload.session_duration_seconds,
            activity_state: payload.activity_state,
          };
          
          update(state => ({
            ...state,
            currentStatus: newStatus,
            activityLogs: [activityLog, ...state.activityLogs.slice(0, 99)], // Keep last 100 logs
            isMonitoring: true,
          }));
        });

        // Listen for periodic idle status updates
        await listen('idle-status-update', (event) => {
          console.log('🔄 IDLE STATUS UPDATE EVENT RECEIVED:', event.payload);
          const payload = event.payload as any;
          const newStatus: IdleStatus = {
            is_idle: payload.is_idle,
            idle_time_seconds: payload.idle_time_seconds,
            last_update: payload.last_update,
            session_duration_seconds: payload.session_duration_seconds,
          };
          
          update(state => ({
            ...state,
            currentStatus: newStatus,
          }));
        });

        console.log('✅ Idle monitoring initialized successfully');
      } catch (error) {
        console.error('Failed to initialize idle monitoring:', error);
        update(state => ({ ...state, error: 'Failed to initialize idle monitoring' }));
      }
    },
    
    // Get current idle status via Tauri command
    getIdleStatus: async (): Promise<IdleStatus | null> => {
      console.log('🔍 getIdleStatus called');
      
      try {
        // Use the enhanced Tauri detection
        if (!tauriApi) {
          tauriApi = await getTauriApi();
        }
        
        if (tauriApi && tauriApi.invoke) {
          console.log('✅ Tauri detected in getIdleStatus, invoking command...');
          const status = await tauriApi.invoke('get_idle_status');
          console.log('✅ getIdleStatus successful:', status);
          return status as IdleStatus;
        }
        
        console.log('❌ Tauri not detected in getIdleStatus');
        update(state => ({ ...state, tauriDetected: false }));
        return null;
      } catch (error) {
        console.error('❌ Failed to get idle status:', error);
        return null;
      }
    },
    
    // Get idle time via Tauri command
    getIdleTime: async (): Promise<number | null> => {
      console.log('⏰ getIdleTime called');
      
      try {
        if (!tauriApi) {
          tauriApi = await getTauriApi();
        }
        
        if (tauriApi && tauriApi.invoke) {
          const idleTime = await tauriApi.invoke('get_idle_time');
          console.log('✅ getIdleTime successful:', idleTime);
          return idleTime as number;
        }
        
        console.log('❌ Tauri not detected in getIdleTime');
        return null;
      } catch (error) {
        console.error('Failed to get idle time:', error);
        return null;
      }
    },
    
    // Check if user is idle via Tauri command
    isUserIdle: async (): Promise<boolean | null> => {
      console.log('🛏️ isUserIdle called');
      
      try {
        if (!tauriApi) {
          tauriApi = await getTauriApi();
        }
        
        if (tauriApi && tauriApi.invoke) {
          const isIdle = await tauriApi.invoke('is_user_idle');
          console.log('✅ isUserIdle successful:', isIdle);
          return isIdle as boolean;
        }
        
        console.log('❌ Tauri not detected in isUserIdle');
        return null;
      } catch (error) {
        console.error('Failed to check idle status:', error);
        return null;
      }
    },
    
    // Clear activity logs
    clearLogs: () => {
      update(state => ({ ...state, activityLogs: [] }));
    },
    
    // Cleanup
    cleanup: () => {
      if (eventListener) {
        eventListener();
        eventListener = null;
      }
    }
  };
}

// Cache management functions
export function invalidateCache(pattern?: string) {
  if (typeof window !== 'undefined' && (window as any).__TAURI__) {
    // In Tauri environment, we can use Tauri's cache management
    // For now, we'll just log the invalidation
    console.log('Cache invalidation requested:', pattern || 'all');
  }

  // Import the api module to clear its cache
  import('./api').then(({ apiCache }) => {
    if (pattern) {
      // Clear specific cache entries matching the pattern
      for (const key of apiCache.keys()) {
        if (key.includes(pattern)) {
          apiCache.delete(key);
        }
      }
    } else {
      // Clear all cache
      apiCache.clear();
    }
  }).catch(err => {
    console.error('Failed to clear cache:', err);
  });
}

export const idleMonitorStore = createIdleMonitorStore();