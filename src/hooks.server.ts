import type { Handle } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';
import { sentryHandle } from '@sentry/sveltekit';
import * as Sentry from '@sentry/sveltekit';

// Server-side handle function for preloading and caching strategies
const serverPreloadHandle: Handle = async ({ event, resolve }) => {
	// Add cache headers for API responses where appropriate
	const response = await resolve(event);

	// Set cache headers for static assets and potentially cacheable API responses
	if (event.url.pathname.startsWith('/api/')) {
		// For API responses that should be cacheable, we could set appropriate headers
		// This is context-specific and depends on the data
	}

	return response;
};

// Additional handle for preloading logic
const preloadHandle: Handle = async ({ event, resolve }) => {
	// Determine if we should preload certain data based on the current request
	// For example, when a user goes to /dashboard, we can start pre-fetching timer data

	// Add special headers that indicate preloading for certain routes
	if (event.url.pathname === '/dashboard') {
		// We could implement logic to pre-fetch timer-related data in the background
	}

	return await resolve(event);
};

// Add extra context to Sentry events
const sentryContextHandle: Handle = async ({ event, resolve }) => {
	// Set user IP from request
	Sentry.setUser({
		ip_address: event.request.headers.get('x-forwarded-for') || 
					event.request.headers.get('x-real-ip') || 
					event.getClientAddress() ||
					'{{auto}}'
	});

	// Add server context
	Sentry.setContext('server', {
		url: event.request.url,
		method: event.request.method,
		headers: {
			'user-agent': event.request.headers.get('user-agent') || 'unknown',
			'accept': event.request.headers.get('accept') || 'unknown'
		}
	});

	return await resolve(event);
};

// Chain the handles - Sentry needs to be the first handler
export const handle = sequence(sentryHandle(), sentryContextHandle, serverPreloadHandle, preloadHandle);
