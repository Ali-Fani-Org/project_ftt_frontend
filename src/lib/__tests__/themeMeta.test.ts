import { describe, it, expect, vi } from 'vitest';
import { normalizeColorVar, pickThemeColor, colorToHex, syncThemeColorMeta } from '../themeMeta';

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
	it('prefers --color-base-100, then --b1, then primary', () => {
		expect(pickThemeColor((n) => ({ '--color-base-100': '#1a1410' })[n] ?? '')).toBe('#1a1410');
		expect(pickThemeColor((n) => ({ '--b1': '100% 0 0' })[n] ?? '')).toBe('oklch(100% 0 0)');
		expect(pickThemeColor((n) => ({ '--color-primary': '#e11d48' })[n] ?? '')).toBe('#e11d48');
		expect(pickThemeColor(() => '')).toBeNull();
	});

	it('resolves DaisyUI v4 built-in theme vars (--b1 / --p, bare channels)', () => {
		expect(pickThemeColor((n) => ({ '--p': '65.69% 0.196 275.75' })[n] ?? '')).toBe(
			'oklch(65.69% 0.196 275.75)'
		);
		expect(
			pickThemeColor(
				(n) => ({ '--color-base-100': '#111111', '--p': '65.69% 0.196 275.75' })[n] ?? ''
			)
		).toBe('#111111');
	});
});

describe('colorToHex', () => {
	it('normalizes hex and rgb without a painter', () => {
		expect(colorToHex('#ABC', null)).toBe('#aabbcc');
		expect(colorToHex('#e11d48', null)).toBe('#e11d48');
		expect(colorToHex('rgb(1, 2, 3)', null)).toBe('#010203');
	});

	it('does not write oklch through without a painter', () => {
		expect(colorToHex('oklch(82% 0.189 84.429)', null)).toBeNull();
	});

	it('uses the painter for oklch', () => {
		expect(colorToHex('oklch(82% 0.189 84.429)', () => '#c4a35a')).toBe('#c4a35a');
	});
});

function stubDocument() {
	const tags: Record<string, { attrs: Record<string, string>; setAttribute(k: string, v: string): void }> =
		{};
	const makeTag = () => {
		const tag = {
			attrs: {} as Record<string, string>,
			setAttribute(k: string, v: string) {
				this.attrs[k] = v;
			}
		};
		return tag;
	};
	return {
		tags,
		querySelector: vi.fn((sel: string) => {
			const name = /meta\[name="([^"]+)"\]/.exec(sel)?.[1];
			return name && tags[name] ? tags[name] : null;
		}),
		createElement: vi.fn((el: string) => {
			if (el !== 'meta') return makeTag();
			return makeTag();
		}),
		head: {
			appendChild: vi.fn((node: { attrs: Record<string, string> }) => {
				const name = node.attrs.name;
				if (name) tags[name] = node as (typeof tags)[string];
			})
		},
		documentElement: { style: { backgroundColor: '' } },
		body: { style: { backgroundColor: '' } }
	};
}

describe('syncThemeColorMeta', () => {
	it('writes hex (never oklch) and paints html/body', () => {
		const doc = stubDocument();
		const computed = {
			getPropertyValue: (n: string) => (n === '--color-base-100' ? 'oklch(82% 0.189 84.429)' : '')
		};
		const applied = syncThemeColorMeta(doc as any, computed, () => '#c4a35a');
		expect(applied).toBe('#c4a35a');
		expect(doc.tags['theme-color'].attrs.content).toBe('#c4a35a');
		expect(doc.tags['theme-color'].attrs.content).not.toMatch(/oklch/i);
		expect(doc.documentElement.style.backgroundColor).toBe('#c4a35a');
		expect(doc.body.style.backgroundColor).toBe('#c4a35a');
	});

	it('sets black-translucent on dark surfaces and default on light', () => {
		const darkDoc = stubDocument();
		syncThemeColorMeta(
			darkDoc as any,
			{ getPropertyValue: () => '#1a1410' },
			(c) => c
		);
		expect(darkDoc.tags['apple-mobile-web-app-status-bar-style'].attrs.content).toBe(
			'black-translucent'
		);

		const lightDoc = stubDocument();
		syncThemeColorMeta(
			lightDoc as any,
			{ getPropertyValue: () => '#f5f5f5' },
			(c) => c
		);
		expect(lightDoc.tags['apple-mobile-web-app-status-bar-style'].attrs.content).toBe('default');
	});

	it('reuses an existing meta tag', () => {
		const existing = { setAttribute: vi.fn() };
		const doc = { ...stubDocument(), querySelector: vi.fn(() => existing) };
		syncThemeColorMeta(doc as any, { getPropertyValue: () => '#123456' }, (c) => c);
		expect(doc.createElement).not.toHaveBeenCalled();
		expect(existing.setAttribute).toHaveBeenCalledWith('content', '#123456');
	});

	it('does nothing without a document, computed styles, resolvable color, or hex', () => {
		expect(syncThemeColorMeta(null, { getPropertyValue: () => '#fff' })).toBeNull();
		expect(syncThemeColorMeta(stubDocument() as any, null)).toBeNull();
		expect(syncThemeColorMeta(stubDocument() as any, { getPropertyValue: () => '' })).toBeNull();
		expect(
			syncThemeColorMeta(
				stubDocument() as any,
				{ getPropertyValue: () => 'oklch(1 0 0)' },
				() => null
			)
		).toBeNull();
	});
});
