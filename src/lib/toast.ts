import { writable } from 'svelte/store';

export interface ToastMessage {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info' | 'warning';
  timeout?: number; // ms
}

function createToastStore() {
  const { subscribe, update } = writable<ToastMessage[]>([]);

  function add(message: string, type: ToastMessage['type'] = 'info', timeout = 3000) {
    const id = Math.random().toString(36).slice(2, 9);
    const toast: ToastMessage = { id, message, type, timeout };
    update((ts) => [...ts, toast]);

    if (timeout && timeout > 0) {
      setTimeout(() => remove(id), timeout);
    }

    return id;
  }

  function remove(id: string) {
    update((ts) => ts.filter((t) => t.id !== id));
  }

  function clear() {
    update(() => []);
  }

  return {
    subscribe,
    add,
    remove,
    clear,
  };
}

export const toastStore = createToastStore();
export const addToast = toastStore.add;
export const removeToast = toastStore.remove;
export const clearToasts = toastStore.clear;
