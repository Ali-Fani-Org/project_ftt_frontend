import type { PageLoad } from './$types';

// For this page, due to token-based auth stored client-side,
// server-side authentication is complex. We'll keep the load function minimal
// and rely more on client-side logic with our performance optimizations.
export const load: PageLoad = async () => {
  // Return empty data - let client-side take over with proper authentication
  // This prevents server-side auth issues while maintaining performance through
  // our client-side caching and preloading optimizations
  return {
    projects: [],
    activeEntry: null,
    features: { 
      enabled_features: [], 
      disabled_features: [], 
      total_features: 0 
    },
    error: null
  };
};