// Client-side hooks for navigation
export const ssr = false;
export const csr = true;
export const prerender = true;

// Handle errors that occur during client-side navigation
export const handleError = ({ error, event }: { error: unknown; event: { url: URL } }) => {
	console.error('Client-side error:', error, 'at', event.url);
};
