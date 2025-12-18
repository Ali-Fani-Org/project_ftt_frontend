import { preloadRoute as originalPreloadRoute } from './preload';
import logger from '$lib/logger';
import { browser } from '$app/environment';
import type { ActionReturn } from 'svelte/action';

type PreloadCache = {
  [path: string]: {
    promise: Promise<void> | null;
    timestamp: number;
  };
};

const cache: PreloadCache = {};
const CACHE_TTL = 300000; // 5 minutes

/**
 * Preloads a route when hovering over an element
 * @param path Route path to preload
 * @param hoverDelay Delay before preloading (ms)
 * @param node The node to dispatch events from
 */
export let debugPreloadActive = false;

export function preloadOnHover(
  node: HTMLElement,
  path: string,
  hoverDelay = 300
): ActionReturn<string> {
  let timeoutId: NodeJS.Timeout | null = null;
  
  // Cleanup expired cache entries
  const now = Date.now();
  Object.keys(cache).forEach(key => {
    if (now - cache[key].timestamp > CACHE_TTL) {
      delete cache[key];
    }
  });

  const onMouseEnter = () => {
      // Skip if already cached
      if (cache[path]?.promise) return;
      
      timeoutId = setTimeout(() => {
        // Dispatch preloadstart event
        const event = new CustomEvent('preloadstart', { bubbles: true });
        node.dispatchEvent(event);
        
        cache[path] = {
          promise: performPreload(path)
            .catch(err => logger.warn(`Preload failed for ${path}:`, err))
            .finally(() => {
              // Dispatch preloadend event
              const endEvent = new CustomEvent('preloadend', { bubbles: true });
              node.dispatchEvent(endEvent);
            }),
          timestamp: Date.now()
        };
      }, hoverDelay);
    };

  const onMouseLeave = () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
        
        // Dispatch preloadcancel event
        const event = new CustomEvent('preloadcancel', { bubbles: true });
        node.dispatchEvent(event);
      }
    };

  node.addEventListener('mouseenter', onMouseEnter);
  node.addEventListener('mouseleave', onMouseLeave);

  return {
    destroy() {
      node.removeEventListener('mouseenter', onMouseEnter);
      node.removeEventListener('mouseleave', onMouseLeave);
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
    }
  };
}

// Modified preloadRoute function
async function performPreload(path: string) {
  if (debugPreloadActive) {
    console.debug(`[Preload Debug] Preloading route: ${path}`);
  }
  if (!browser) return;

  try {
    await originalPreloadRoute(path);
  } catch (error) {
    logger.warn(`Failed to preload route ${path}:`, error);
  }
}
