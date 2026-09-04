/**
 * themeMeta.ts — keep the browser chrome (`<meta name="theme-color">`, used
 * for the PWA status bar / task switcher / installed-window titlebar) in sync
 * with the user's selected app theme.
 *
 * Why computed styles instead of a hardcoded map: built-in DaisyUI themes and
 * user-pasted custom themes both end up as CSS variables, so reading the
 * resolved `--color-primary` covers every theme with zero maintenance.
 * The static `theme_color` in manifest.webmanifest (splash screen) and the
 * fallback `<meta>` in app.html stay as-is — only one theme can be baked in.
 */

const CANDIDATE_VARS = ['--color-primary', '--color-base-100'] as const;

/** Minimal shape of what we need from getComputedStyle() — stubbed in tests. */
export interface StyleReader {
	getPropertyValue(name: string): string;
}

/** Normalize a raw custom-property value into something usable as meta content. */
export function normalizeColorVar(raw: string): string | null {
	const v = (raw || '').trim();
	if (!v) return null;
	// Already a full color: #hex, oklch(...), color(...), rgb(...), ...
	if (/^(#|oklch\(|oklab\(|rgb\(|rgba\(|hsl\(|hsla\(|color\()/i.test(v)) return v;
	// Bare oklch channel list (old DaisyUI `--p: 64% 0.2 25` style pastes).
	if (/[\d.]+\s+[\d.]+/.test(v)) return `oklch(${v})`;
	return v;
}

/** Pick the theme's chrome color: primary, else base-100, else null (keep existing meta). */
export function pickThemeColor(read: (name: string) => string): string | null {
	for (const name of CANDIDATE_VARS) {
		const color = normalizeColorVar(read(name));
		if (color) return color;
	}
	return null;
}

export interface MetaDocument {
	querySelector(selector: string): { setAttribute(name: string, value: string): void } | null;
	createElement(tag: string): {
		setAttribute(name: string, value: string): void;
	};
	head: { appendChild(node: unknown): void };
}

function defaultComputed(): StyleReader | null {
	if (typeof getComputedStyle === 'function' && typeof document !== 'undefined') {
		return getComputedStyle(document.documentElement);
	}
	return null;
}

/**
 * Read the active theme's primary color and write it to
 * `<meta name="theme-color">` (creating the tag if missing).
 * Safe to call anywhere (SSR/prerender: resolves to null, touches nothing).
 * Returns the applied color, or null when nothing was applied.
 */
export function syncThemeColorMeta(
	doc: MetaDocument | null = typeof document !== 'undefined' ? (document as unknown as MetaDocument) : null,
	computed: StyleReader | null = defaultComputed()
): string | null {
	if (!doc || !computed) return null;
	const color = pickThemeColor((name) => computed.getPropertyValue(name));
	if (!color) return null;
	let meta = doc.querySelector('meta[name="theme-color"]');
	if (!meta) {
		const created = doc.createElement('meta');
		created.setAttribute('name', 'theme-color');
		doc.head.appendChild(created);
		meta = created;
	}
	meta.setAttribute('content', color);
	return color;
}
