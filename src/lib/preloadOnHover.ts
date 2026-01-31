import { preloadRoute as originalPreloadRoute } from './preload';
import logger from '$lib/logger';

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

export function preloadOnHover(path: string, hoverDelay = 300, node: Node) {
	let timeoutId: NodeJS.Timeout | null = null;

	// Cleanup expired cache entries
	const now = Date.now();
	Object.keys(cache).forEach((key) => {
		if (now - cache[key].timestamp > CACHE_TTL) {
			delete cache[key];
		}
	});

	return {
		onMouseEnter: () => {
			// Skip if already cached
			if (cache[path]?.promise) return;

			timeoutId = setTimeout(() => {
				// Dispatch preloadstart event
				const event = new CustomEvent('preloadstart', { bubbles: true });
				node.dispatchEvent(event);

				cache[path] = {
					promise: performPreload(path)
						.catch((err) => logger.warn(`Preload failed for ${path}:`, err))
						.finally(() => {
							// Dispatch preloadend event
							const endEvent = new CustomEvent('preloadend', { bubbles: true });
							node.dispatchEvent(endEvent);
						}),
					timestamp: Date.now()
				};
			}, hoverDelay);
		},
		onMouseLeave: () => {
			if (timeoutId) {
				clearTimeout(timeoutId);
				timeoutId = null;

				// Dispatch preloadcancel event
				const event = new CustomEvent('preloadcancel', { bubbles: true });
				node.dispatchEvent(event);
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
		// Rest of the preloadRoute function remains the same
		// ...
	} catch (error) {
		logger.warn(`Failed to preload route ${path}:`, error);
	}
}
