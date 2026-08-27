// Shared helpers for the animated background variants.
//
// The active theme is exposed only as CSS custom properties (--p, --s, --b1),
// so variants resolve them to concrete colors by painting them onto a 1x1
// canvas and reading the pixel back — the reliable way to feed oklch/var
// colors into Three.js. Theme changes (data-theme attribute swaps) are
// observed and re-resolved live.

let canvasCtx: CanvasRenderingContext2D;

/** Paint a CSS color and read the resulting pixel back as a hex string. */
export const resolveCssColor = (cssColor: string): string => {
	if (!canvasCtx) {
		const canvas = document.createElement('canvas');
		canvas.width = 1;
		canvas.height = 1;
		canvasCtx = canvas.getContext('2d', { willReadFrequently: true })!;
	}
	canvasCtx.clearRect(0, 0, 1, 1);
	canvasCtx.fillStyle = cssColor;
	canvasCtx.fillRect(0, 0, 1, 1);
	const [r, g, b, a] = canvasCtx.getImageData(0, 0, 1, 1).data;
	const toHex = (value: number) => value.toString(16).padStart(2, '0');
	return `#${toHex(r)}${toHex(g)}${toHex(b)}${a === 255 ? '' : toHex(a)}`;
};

export interface ThemeTokens {
	/** Scene backdrop (--b1). */
	background: string;
	/** Particle core (--p). */
	primary: string;
	/** Particle edge (--s). */
	secondary: string;
}

/** Convert `#rrggbb` / `#rrggbbaa` to an `rgba(r,g,b,a)` CSS string. */
export const hexToRgba = (hex: string, alpha: number): string => {
	const clean = hex.replace('#', '');
	const r = parseInt(clean.slice(0, 2), 16);
	const g = parseInt(clean.slice(2, 4), 16);
	const b = parseInt(clean.slice(4, 6), 16);
	return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

/**
 * Approximate relative luminance (0..1) of a hex color like `#0e1726` or
 * `#0e1726aa`. Used to pick theme-aware blending per backdrop.
 */
export const hexLuminance = (hex: string): number => {
	const clean = hex.replace('#', '');
	const r = parseInt(clean.slice(0, 2), 16) / 255;
	const g = parseInt(clean.slice(2, 4), 16) / 255;
	const b = parseInt(clean.slice(4, 6), 16) / 255;
	return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

/**
 * Read the active theme's tokens from the hidden reference element.
 * The element must carry:
 *   color: oklch(var(--p)); background-color: oklch(var(--b1));
 *   --ref-secondary: oklch(var(--s));
 */
export const readThemeTokens = (ref: HTMLElement): ThemeTokens => {
	const computed = getComputedStyle(ref);
	return {
		background: resolveCssColor(computed.getPropertyValue('background-color')),
		primary: resolveCssColor(computed.color),
		secondary: resolveCssColor(computed.getPropertyValue('--ref-secondary'))
	};
};

/** Observe `data-theme` swaps on <html> and call `onChange` for each. */
export const createThemeObserver = (onChange: () => void): MutationObserver => {
	const observer = new MutationObserver(onChange);
	observer.observe(document.documentElement, {
		attributes: true,
		attributeFilter: ['data-theme']
	});
	return observer;
};
