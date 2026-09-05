<script module lang="ts">
	let seq = 0;
</script>

<script lang="ts">
	import rawMark from '$lib/assets/brand-mark.svg?raw';

	let {
		size = 24,
		framed = false,
		running = false,
		class: className = ''
	}: {
		size?: number;
		/** Keep the glass tile. Off: clock/arrow only, transparent around it. */
		framed?: boolean;
		running?: boolean;
		class?: string;
	} = $props();

	const uid = `bm${++seq}`;

	function themeHex(hex: string): string {
		const n = parseInt(hex.slice(1), 16);
		if (Number.isNaN(n)) return hex;
		const r = (n >> 16) & 255;
		const g = (n >> 8) & 255;
		const b = n & 255;
		const max = Math.max(r, g, b);
		const min = Math.min(r, g, b);
		const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
		const sat = max === 0 ? 0 : (max - min) / max;
		if (lum < 0.28 && sat < 0.5) return 'var(--mark-deep)';
		if (lum < 0.45 && b >= r) return 'var(--mark-tile)';
		if (r > 170 && g > 150 && b < 190) return 'var(--mark-gold)';
		if (b > 140 || (g > 180 && b > 100)) return 'var(--mark-cyan)';
		return hex;
	}

	const markup = $derived.by(() => {
		let svg = rawMark
			.replace(/id="([^"]+)"/g, `id="${uid}-$1"`)
			.replace(/url\(#([^)]+)\)/g, `url(#${uid}-$1)`)
			.replace(/xlink:href="#([^"]+)"/g, `href="#${uid}-$1"`)
			.replace(/\shref="#([^"]+)"/g, ` href="#${uid}-$1"`)
			.replace(/clip-path="url\(#([^"]+)\)"/g, `clip-path="url(#${uid}-$1)"`);
		svg = svg.replace(/<title>[\s\S]*?<\/title>/, '');
		svg = svg.replace(/<desc>[\s\S]*?<\/desc>/, '');
		svg = svg.replace(/#([0-9a-fA-F]{6})\b/g, (hex) => themeHex(hex));
		return svg;
	});
</script>

<span
	class="brand-mark inline-flex shrink-0 overflow-visible text-primary {framed
		? 'is-framed'
		: ''} {running ? 'is-running' : ''} {className}"
	style="width:{size}px;height:{size}px"
	aria-hidden="true"
>
	{@html markup}
</span>

<style>
	.brand-mark {
		--mark-cyan: var(--color-primary, oklch(var(--p)));
		--mark-gold: var(--color-warning, oklch(var(--wa)));
		--mark-tile: var(--color-base-200, oklch(var(--b2)));
		--mark-deep: var(--color-base-100, oklch(var(--b1)));
	}

	.brand-mark :global(svg) {
		display: block;
		width: 100%;
		height: 100%;
		overflow: visible;
	}

	/* Page-navy backdrop is already stripped from the asset; hide the glass
	   tile when the mark sits on an existing chrome tile. */
	.brand-mark:not(.is-framed) :global(#bm-tile-layer),
	.brand-mark:not(.is-framed) :global([id$='-tile-layer']) {
		display: none;
	}

	.brand-mark.is-running :global([id$='-clock-ring-layer']),
	.brand-mark.is-running :global([id$='-rising-arrow-layer']),
	.brand-mark.is-running :global([id$='-chart-bars-layer']),
	.brand-mark.is-running :global([id$='-dial-ticks-layer']),
	.brand-mark.is-running :global([id$='-dial-dots-layer']) {
		transform-origin: center;
		transform-box: fill-box;
		animation: mark-spin 6s linear infinite;
	}

	@keyframes mark-spin {
		to {
			transform: rotate(360deg);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.brand-mark.is-running :global([id$='-clock-ring-layer']),
		.brand-mark.is-running :global([id$='-rising-arrow-layer']),
		.brand-mark.is-running :global([id$='-chart-bars-layer']),
		.brand-mark.is-running :global([id$='-dial-ticks-layer']),
		.brand-mark.is-running :global([id$='-dial-dots-layer']) {
			animation: none;
		}
	}
</style>
