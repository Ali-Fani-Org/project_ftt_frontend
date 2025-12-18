import { browser } from '$app/environment';
import { page } from '$app/stores';
import { get } from 'svelte/store';
import { preloadData } from '$app/navigation';
import logger from '$lib/logger';

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

let apiModule: Promise<typeof import('./api')> | null = null;

const getApiModule = () => {
  if (!apiModule) {
    apiModule = import('./api');
  }
  return apiModule;
};

async function preloadRoute(path: string) {
  if (!browser) return;

  try {
    // Check if data is already cached
    if (preloadedDataCache.has(path)) {
      return preloadedDataCache.get(path);
    }

    // Use SvelteKit's built-in preloadData function
    if (typeof preloadData === 'function') {
      const result = await preloadData(path).catch(err => {
        logger.warn(`Failed to preload data for ${path}:`, err);
        return null;
      });

      if (result) {
        preloadedDataCache.set(path, result);
      }

      logger.debug(`Preloaded route: ${path}`, result ? 'success' : 'failed');
    } else {
      logger.warn('preloadData function not available in this SvelteKit version');
      // Fallback: make API calls with cached module import
      getApiModule().then(({ projects, timeEntries }) => {
        // Preload what would typically be loaded on the timer page
        projects.list().catch(err => logger.warn('Failed to preload projects:', err));
        timeEntries.getCurrentActive().catch(err => logger.warn('Failed to preload active timer:', err));
      });
    }
  } catch (error) {
    logger.warn(`Failed to preload route ${path}:`, error);
  }
}

// Export a simple preload function that can be used in components
export function preload(path: string) {
  return preloadRoute(path);
}

export { preloadRoute };