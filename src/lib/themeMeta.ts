/**
 * themeMeta.ts — keep the browser chrome (`<meta name="theme-color">`, used
 * for the PWA status bar / task switcher / installed-window titlebar) in sync
 * with the user's selected app theme.
 *
 * Why computed styles instead of a hardcoded map: built-in DaisyUI themes and
 * user-pasted custom themes both end up as CSS variables, so reading the
 * resolved surface color covers every theme with zero maintenance.
 *
 * Chrome color is the *page surface* (`--color-base-100` / `--b1`), matching
 * the sticky app bar — not the primary accent. Many mobile browsers ignore
 * `oklch()` in the meta tag, so we always write `#rrggbb`.
 *
 * Platform limits (not bugs we can fully close):
 * - Chrome Android ignores theme-color in a normal tab when the *device* is
 *   in dark mode, unless the site is an installed PWA.
 * - iOS 26 Safari dropped theme-color; it tints chrome from html/body
 *   background or a sticky/fixed bar at the top of the viewport.
 * The static `theme_color` in manifest.webmanifest (splash) stays baked in.
 */

import { resolveCssColor, hexLuminance } from './backgrounds/themeColors';

const CANDIDATE_VARS = [
	// Surface (matches the sticky app bar). DaisyUI v5 then v4 names.
	'--color-base-100',
	'--b1',
	// Fallback to primary if a custom theme only defines that.
	'--color-primary',
	'--p'
] as const;

const DARK_LUMINANCE_THRESHOLD = 0.45;

/** Minimal shape of what we need from getComputedStyle() — stubbed in tests. */
export interface StyleReader {
	getPropertyValue(name: string): string;
}

/** Normalize a raw custom-property value into something usable as a CSS color. */
export function normalizeColorVar(raw: string): string | null {
	const v = (raw || '').trim();
	if (!v) return null;
	// Already a full color: #hex, oklch(...), color(...), rgb(...), ...
	if (/^(#|oklch\(|oklab\(|rgb\(|rgba\(|hsl\(|hsla\(|color\()/i.test(v)) return v;
	// Bare oklch channel list (old DaisyUI `--p: 64% 0.2 25` style pastes).
	if (/[\d.]+\s+[\d.]+/.test(v)) return `oklch(${v})`;
	return v;
}

/** Pick the theme's chrome color: surface, else primary, else null. */
export function pickThemeColor(read: (name: string) => string): string | null {
	for (const name of CANDIDATE_VARS) {
		const color = normalizeColorVar(read(name));
		if (color) return color;
	}
	return null;
}

/**
 * Convert a CSS color to `#rrggbb`. Hex and rgb() parse without the DOM;
 * oklch() / named colors go through the 1×1 canvas painter.
 */
export function colorToHex(
	cssColor: string,
	paint: ((css: string) => string) | null = typeof document !== 'undefined' ? resolveCssColor : null
): string | null {
	const v = (cssColor || '').trim();
	if (!v) return null;

	const hexMatch = v.match(/^#([0-9a-f]{3,8})$/i);
	if (hexMatch) {
		const h = hexMatch[1];
		if (h.length === 3 || h.length === 4) {
			return `#${h[0]}${h[0]}${h[1]}${h[1]}${h[2]}${h[2]}`.toLowerCase();
		}
		return `#${h.slice(0, 6)}`.toLowerCase();
	}

	const rgbMatch = v.match(/^rgba?\(\s*([\d.]+)\s*[,\s]\s*([\d.]+)\s*[,\s]\s*([\d.]+)/i);
	if (rgbMatch) {
		const toHex = (n: string) =>
			Math.max(0, Math.min(255, Math.round(Number(n)))).toString(16).padStart(2, '0');
		return `#${toHex(rgbMatch[1])}${toHex(rgbMatch[2])}${toHex(rgbMatch[3])}`;
	}

	if (!paint) return null;
	try {
		const painted = paint(v);
		if (painted && painted.startsWith('#')) return painted.slice(0, 7).toLowerCase();
	} catch {
		return null;
	}
	return null;
}

export interface MetaDocument {
	querySelector(selector: string): { setAttribute(name: string, value: string): void } | null;
	createElement(tag: string): {
		setAttribute(name: string, value: string): void;
	};
	head: { appendChild(node: unknown): void };
	documentElement?: { style: { backgroundColor: string } };
	body?: { style: { backgroundColor: string } } | null;
}

function defaultComputed(): StyleReader | null {
	if (typeof getComputedStyle === 'function' && typeof document !== 'undefined') {
		return getComputedStyle(document.documentElement);
	}
	return null;
}

function setMeta(doc: MetaDocument, name: string, content: string) {
	let meta = doc.querySelector(`meta[name="${name}"]`);
	if (!meta) {
		const created = doc.createElement('meta');
		created.setAttribute('name', name);
		doc.head.appendChild(created);
		meta = created;
	}
	meta.setAttribute('content', content);
}

/**
 * Read the active theme's surface color, convert to `#rrggbb`, and write it to
 * `<meta name="theme-color">` (creating the tag if missing). Also paints
 * `html`/`body` so iOS 26 Safari (which ignores the meta tag) can tint chrome
 * from the page background, and flips `apple-mobile-web-app-status-bar-style`
 * between `black-translucent` (dark) and `default` (light).
 *
 * Safe to call anywhere (SSR/prerender: resolves to null, touches nothing).
 * Returns the applied hex, or null when nothing was applied.
 */
export function syncThemeColorMeta(
	doc: MetaDocument | null = typeof document !== 'undefined' ? (document as unknown as MetaDocument) : null,
	computed: StyleReader | null = defaultComputed(),
	toHex: (css: string) => string | null = colorToHex
): string | null {
	if (!doc || !computed) return null;
	const raw = pickThemeColor((name) => computed.getPropertyValue(name));
	if (!raw) return null;
	const hex = toHex(raw);
	if (!hex || !hex.startsWith('#')) return null;

	setMeta(doc, 'theme-color', hex);

	const dark = hexLuminance(hex) < DARK_LUMINANCE_THRESHOLD;
	setMeta(doc, 'apple-mobile-web-app-status-bar-style', dark ? 'black-translucent' : 'default');

	if (doc.documentElement?.style) {
		doc.documentElement.style.backgroundColor = hex;
	}
	if (doc.body?.style) {
		doc.body.style.backgroundColor = hex;
	}

	return hex;
}
