import { goto as svelteGoto } from '$app/navigation';
import { base } from '$app/paths';

/**
 * Prefix an app route with the deployment base path.
 *
 * - Dev / Tauri: `base` is `''`, so this is the identity function and every
 *   call site behaves exactly as before.
 * - GitHub Pages: `base` is `/project_ftt_frontend`, so `/dashboard`
 *   becomes `/project_ftt_frontend/dashboard`.
 *
 * Why this exists: SvelteKit's `goto()` resolves `/...` against
 * `document.baseURI` (the DOMAIN ROOT) and treats any pathname outside
 * `base` as external, performing a full-page load. Every bare `goto('/x')`
 * therefore escapes the app when deployed under a subpath.
 */
export function appPath(path = '/'): string {
	return `${base}${path}`;
}

type GotoOptions = Parameters<typeof svelteGoto>[1];

/**
 * Base-aware `goto()`. Drop-in replacement — always use this instead of
 * `$app/navigation`'s `goto` for in-app navigation.
 */
export function gotoApp(path = '/', opts?: GotoOptions): ReturnType<typeof svelteGoto> {
	return svelteGoto(appPath(path), opts);
}

/**
 * Strip the deployment base from a browser pathname (`$page.url.pathname`
 * INCLUDES the base) back to the app-relative route the code compares
 * against, e.g. `/project_ftt_frontend/timer` -> `/timer`.
 */
export function stripBase(pathname: string): string {
	if (base && pathname.startsWith(base)) {
		const rest = pathname.slice(base.length);
		return rest === '' ? '/' : rest;
	}
	return pathname;
}
