import { writable } from 'svelte/store';
import { browser } from '$app/environment';
import { goto } from '$app/navigation';

function createPersistentStore<T>(key: string, initialValue: T) {
  const storedValue = browser ? localStorage.getItem(key) : null;
  let parsedValue = initialValue;
  if (storedValue) {
    try {
      parsedValue = JSON.parse(storedValue);
    } catch {
      // If not valid JSON, use the stored value as is (for backward compatibility)
      parsedValue = storedValue as T;
    }
  }

  const store = writable<T>(parsedValue);

  store.subscribe(async (value) => {
    if (browser) {
      localStorage.setItem(key, JSON.stringify(value));
      // Also save to Tauri store if available
      if (typeof window !== 'undefined' && (window as any).__TAURI__) {
        try {
          const { LazyStore } = await import('@tauri-apps/plugin-store');
          const tauriStore = new LazyStore('auth.json');
          await tauriStore.set(key, value);
          await tauriStore.save();
        } catch (e) {
          console.error('Failed to save to Tauri store', e);
        }
      }
    }
  });

  return store;
}

export const authToken = createPersistentStore<string | null>('authToken', null);
export const user = createPersistentStore<{ id: number; username: string; first_name: string; last_name: string; profile_image: string | null } | null>('user', null);

export const baseUrl = createPersistentStore<string>('baseUrl', 'http://localhost:8000');
export const theme = createPersistentStore<string>('theme', 'light');
export const customThemes = createPersistentStore<Record<string, Record<string, string>>>('customThemes', {});
export const minimizeToTray = createPersistentStore<boolean>('minimizeToTray', true);
export const closeToTray = createPersistentStore<boolean>('closeToTray', false);
export const autostart = createPersistentStore<boolean>('autostart', false);
export const timeEntriesDisplayMode = createPersistentStore<string>('timeEntriesDisplayMode', 'window');

// Logout alert state
export const logoutAlert = writable<{show: boolean, message: string}>({show: false, message: ''});

// Global logout function that can be used by API hooks
export function globalLogout(autoLogout = false) {
  // Clear all localStorage and sessionStorage
  if (browser) {
    localStorage.clear();
    sessionStorage.clear();
  }
  
  // Reset stores
  authToken.set(null);
  user.set(null);
  
  // Show alert if this was an automatic logout (401 response)
  if (autoLogout) {
    logoutAlert.set({
      show: true,
      message: 'Your session has expired. Please log in again.'
    });
  }
  
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
    loadFeatures: async () => {
      update(state => ({ ...state, loading: true, error: null }));
      
      try {
        const { featureFlags } = await import('./api');
        const response = await featureFlags.getMyFeatures();
        
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

// Helper function to check if devtools is enabled
// `isDevtoolsEnabled` removed — feature checks should call `featureFlagsStore.isFeatureEnabled('devtools')` directly.