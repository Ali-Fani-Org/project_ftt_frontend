import { browser } from '$app/environment';
import { page } from '$app/stores';
import { get } from 'svelte/store';
import { preload } from '$lib/preload';

// Client-side hooks for navigation
if (browser) {
  // Subscribe to page changes to implement smart preloading
  page.subscribe((currentPage) => {
    // Preload commonly accessed pages based on current page
    const currentPath = currentPage.url?.pathname || '';

    if (currentPath === '/' || currentPath.startsWith('/dashboard')) {
      // Preload timer page when on home or dashboard
      import('$lib/api').then(({ timeEntries, projects }) => {
        // Preload data that's commonly needed on the timer page
        if (!window.location?.pathname?.includes('/timer')) {
          // Only preload if we're not already on the timer page
          console.log('Preloading timer page resources...');
        }
      });
    }
  });
}

// This allows SvelteKit to handle client-side navigation
export const ssr = false;
export const csr = true;
export const prerender = false;

// Handle errors that occur during client-side navigation
export const handleError = ({ error, event }) => {
  console.error('Client-side error:', error, 'at', event.url);
  return {
    message: 'An error occurred during navigation',
    error
  };
};

// Export the preload function for use in other modules if needed
export { preload } from '$lib/preload';