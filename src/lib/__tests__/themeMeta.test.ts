import { describe, it, expect, vi } from 'vitest';
import { normalizeColorVar, pickThemeColor, syncThemeColorMeta } from '../themeMeta';

describe('normalizeColorVar', () => {
	it('passes full colors through untouched', () => {
		expect(normalizeColorVar('oklch(82% 0.189 84.429)')).toBe('oklch(82% 0.189 84.429)');
		expect(normalizeColorVar('#e11d48')).toBe('#e11d48');
		expect(normalizeColorVar('  rgb(1, 2, 3)  ')).toBe('rgb(1, 2, 3)');
	});

	it('wraps bare oklch channel pastes', () => {
		expect(normalizeColorVar('64% 0.207 25.33')).toBe('oklch(64% 0.207 25.33)');
	});

	it('returns null for empty values', () => {
		expect(normalizeColorVar('')).toBeNull();
		expect(normalizeColorVar('   ')).toBeNull();
	});
});

describe('pickThemeColor', () => {
	it('prefers --color-primary, falls back to --color-base-100', () => {
		expect(pickThemeColor((n) => ({ '--color-primary': 'oklch(1% 2 3)' })[n] ?? '')).toBe(
			'oklch(1% 2 3)'
		);
		expect(pickThemeColor((n) => ({ '--color-base-100': '#fff' })[n] ?? '')).toBe('#fff');
		expect(pickThemeColor(() => '')).toBeNull();
	});
});

function stubDocument() {
	const meta = {
		attrs: {} as Record<string, string>,
		setAttribute(k: string, v: string) {
			this.attrs[k] = v;
		}
	};
	return {
		meta,
		querySelector: vi.fn(() => null),
		createElement: vi.fn(() => meta),
		head: { appendChild: vi.fn() }
	};
}

describe('syncThemeColorMeta', () => {
	it('creates the meta tag and writes the primary color', () => {
		const doc = stubDocument();
		const computed = { getPropertyValue: (n: string) => (n === '--color-primary' ? 'oklch(82% 0.189 84.429)' : '') };
		const applied = syncThemeColorMeta(doc as any, computed);
		expect(applied).toBe('oklch(82% 0.189 84.429)');
		expect(doc.createElement).toHaveBeenCalledWith('meta');
		expect(doc.meta.attrs).toMatchObject({ name: 'theme-color', content: 'oklch(82% 0.189 84.429)' });
	});

	it('reuses an existing meta tag', () => {
		const existing = { setAttribute: vi.fn() };
		const doc = { ...stubDocument(), querySelector: vi.fn(() => existing) };
		syncThemeColorMeta(doc as any, { getPropertyValue: () => '#123456' });
		expect(doc.createElement).not.toHaveBeenCalled();
		expect(existing.setAttribute).toHaveBeenCalledWith('content', '#123456');
	});

	it('does nothing without a document, computed styles, or a resolvable color', () => {
		expect(syncThemeColorMeta(null, { getPropertyValue: () => '#fff' })).toBeNull();
		expect(syncThemeColorMeta(stubDocument() as any, null)).toBeNull();
		expect(syncThemeColorMeta(stubDocument() as any, { getPropertyValue: () => '' })).toBeNull();
	});
});
