import { describe, it, expect, vi, beforeEach } from 'vitest';

// Regression tests: bare goto('/x') resolves against document.baseURI (the
// DOMAIN ROOT) and SvelteKit treats anything outside `base` as external, so
// under any subpath deploy every bare goto escapes the app to the domain
// root. All in-app navigation must go through
// gotoApp()/appPath(), and pathname comparisons must account for the base.
const mocks = vi.hoisted(() => ({
	goto: vi.fn()
}));

async function loadNavigation(base: string) {
	vi.resetModules();
	vi.doMock('$app/navigation', () => ({ goto: mocks.goto }));
	vi.doMock('$app/paths', () => ({ base }));
	return await import('../navigation');
}

describe('navigation helpers (subpath base, e.g. legacy Pages project site)', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('prefixes app routes with the base', async () => {
		const { appPath } = await loadNavigation('/project_ftt_frontend');
		expect(appPath('/')).toBe('/project_ftt_frontend/');
		expect(appPath('/dashboard')).toBe('/project_ftt_frontend/dashboard');
		expect(appPath('/dashboard?offline=true')).toBe(
			'/project_ftt_frontend/dashboard?offline=true'
		);
	});

	it('gotoApp navigates inside the base (never the domain root)', async () => {
		const { gotoApp } = await loadNavigation('/project_ftt_frontend');
		mocks.goto.mockResolvedValue(undefined);
		await gotoApp('/');
		expect(mocks.goto).toHaveBeenCalledWith('/project_ftt_frontend/', undefined);
		await gotoApp('/timer');
		expect(mocks.goto).toHaveBeenCalledWith('/project_ftt_frontend/timer', undefined);
	});

	it('stripBase maps browser pathnames back to app routes', async () => {
		const { stripBase } = await loadNavigation('/project_ftt_frontend');
		expect(stripBase('/project_ftt_frontend/')).toBe('/');
		expect(stripBase('/project_ftt_frontend/timer')).toBe('/timer');
		expect(stripBase('/other')).toBe('/other');
	});
});

describe('navigation helpers (empty base: dev/Tauri)', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('is the identity function, preserving pre-PWA behavior', async () => {
		const { appPath, stripBase, gotoApp } = await loadNavigation('');
		expect(appPath('/')).toBe('/');
		expect(appPath('/entries')).toBe('/entries');
		expect(stripBase('/entries')).toBe('/entries');
		mocks.goto.mockResolvedValue(undefined);
		await gotoApp('/dashboard');
		expect(mocks.goto).toHaveBeenCalledWith('/dashboard', undefined);
	});
});
