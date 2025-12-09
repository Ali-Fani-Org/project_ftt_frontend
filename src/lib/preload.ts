import { browser } from '$app/environment';
import { page } from '$app/stores';
import { get } from 'svelte/store';
import { preloadData } from '$app/navigation';

// Cache for preloaded data
const preloadedDataCache = new Map();

// Preload certain routes when user is on related pages
if (browser) {
  // Set up preload for common navigation paths
  page.subscribe((currentPage) => {
    if (currentPage.route?.id?.includes('/dashboard')) {
      // Preload timer page when user is on dashboard
      preloadRoute('/timer');
    } else if (currentPage.route?.id?.includes('/timer')) {
      // Preload entries page when user is on timer
      preloadRoute('/entries');
    }
  });
}

async function preloadRoute(path: string) {
  if (!browser) return;

  try {
    // Check if data is already cached
    if (preloadedDataCache.has(path)) {
      return preloadedDataCache.get(path);
    }

    // Use SvelteKit's built-in preloadData function
    const link = document.createElement('a');
    link.href = path;

    // Make sure preloadData exists in the current SvelteKit version
    if (typeof preloadData === 'function') {
      const result = await preloadData(link).catch(err => {
        console.warn(`Failed to preload data for ${path}:`, err);
        return null;
      });

      if (result) {
        preloadedDataCache.set(path, result);
      }

      console.log(`Preloaded route: ${path}`, result ? 'success' : 'failed');
    } else {
      console.warn('preloadData function not available in this SvelteKit version');
      // Fallback: just make the API calls that would typically be made on the timer page
      // This is just a basic fallback since true preloading isn't available
      import('./api').then(({ projects, timeEntries }) => {
        // Preload what would typically be loaded on the timer page
        projects.list().catch(err => console.warn('Failed to preload projects:', err));
        timeEntries.getCurrentActive().catch(err => console.warn('Failed to preload active timer:', err));
      });
    }
  } catch (error) {
    console.warn(`Failed to preload route ${path}:`, error);
  }
}

// Export a simple preload function that can be used in components
export function preload(path: string) {
  return preloadRoute(path);
}

// Additional optimization: Keep frequently used components in memory
// This prevents the need to re-instantiate them each time
export const componentCache = new Map();