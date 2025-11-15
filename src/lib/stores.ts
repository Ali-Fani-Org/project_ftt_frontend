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
export const user = createPersistentStore<{ id: number; username: string; first_name: string; last_name: string } | null>('user', null);

export const baseUrl = createPersistentStore<string>('baseUrl', 'http://localhost:8000');
export const theme = createPersistentStore<string>('theme', 'light');
export const customThemes = createPersistentStore<Record<string, Record<string, string>>>('customThemes', {});
export const minimizeToTray = createPersistentStore<boolean>('minimizeToTray', true);
export const closeToTray = createPersistentStore<boolean>('closeToTray', false);
export const autostart = createPersistentStore<boolean>('autostart', false);

export const showSettings = writable(false);

export const logout = () => {
  authToken.set(null);
  user.set(null);
  goto('/');
};