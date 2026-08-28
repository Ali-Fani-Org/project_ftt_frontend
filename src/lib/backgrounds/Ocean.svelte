<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { readThemeTokens, createThemeObserver } from './themeColors';

	// ------------------------------------------------------------------
	// Ocean — a real-time spectral FFT ocean, from the abyssal-ocean
	// engine (github.com/squall01337/abyssal-ocean), vendored into
	// static/abyssal/ and embedded as an iframe background. It runs a
	// JONSWAP/TMA spectrum, three GPU FFT cascades, physical foam, and a
	// Preetham sky — no build step, WebGL2 required.
	//
	// The host app bridges two things into the engine:
	//   • theme colors — the water (scatter) and subsurface glow (SSS)
	//     are tinted toward the active theme's primary/secondary
	//   • the "Wave character" knob — maps to the spectrum's wind speed,
	//     so calm swells ↔ stormy chop are physical, not cosmetic
	// ------------------------------------------------------------------

	// 0 = calm, 1 = stormy. Maps to wind speed 2–24 m/s (JONSWAP).
	export let character = 0.5;

	let container: HTMLDivElement;
	let colorRef: HTMLDivElement; // hidden element resolving theme CSS vars
	let frame: HTMLIFrameElement;
	let themeObserver: MutationObserver | null = null;
	let ready = false;

	// Ocean latitude for the solar position (northern hemisphere).
	const OCEAN_LAT = 35;

	// Approximate solar elevation/azimuth from the local clock (NOAA-style,
	// no equation of time — plenty for a backdrop). Elevation < 0 = night.
	const sunFromClock = (date: Date): { elev: number; azim: number } => {
		const rad = Math.PI / 180;
		const startOfYear = Date.UTC(date.getUTCFullYear(), 0, 0);
		const doy =
			(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) - startOfYear) /
			86400000;
		// Local wall-clock time-of-day (getTime() % day would be UTC — the sun
		// must follow the user's clock, not the server's).
		const frac = (date.getHours() + date.getMinutes() / 60 + date.getSeconds() / 3600) / 24;
		const hourAngle = (frac * 24 - 12) * 15;
		const decl = 23.44 * Math.sin(rad * ((360 / 365) * (doy - 81)));
		const elev =
			Math.asin(
				Math.sin(rad * OCEAN_LAT) * Math.sin(rad * decl) +
					Math.cos(rad * OCEAN_LAT) * Math.cos(rad * decl) * Math.cos(rad * hourAngle)
			) / rad;
		const azim =
			Math.atan2(
				Math.sin(rad * hourAngle),
				Math.cos(rad * hourAngle) * Math.sin(rad * OCEAN_LAT) -
					Math.tan(rad * decl) * Math.cos(rad * OCEAN_LAT)
			) / rad;
		return { elev, azim: (azim + 180) % 360 };
	};

	// A backdrop-approximation of the moon: it arcs across the night sky
	// opposite the sun, at a moderate elevation. (The real lunar orbit needs
	// proper ephemeris math — this is plenty for a background.)
	const moonFromClock = (date: Date): { elev: number; azim: number } => {
		const { elev: sunElev, azim: sunAzim } = sunFromClock(date);
		// ~15° keeps the moon inside the frame (the camera's view tops out
		// around 22° above the horizon) with a visible glitter path on the sea.
		return { elev: 15, azim: (sunAzim + 180) % 360 };
	};

	// Engine defaults (kept in sync with static/abyssal/abyssal-ocean.html).
	const DEFAULT_SCATTER = '#0f5f6b';
	const DEFAULT_SSS = '#2fbfa2';

	const hexToRgb = (hex: string): [number, number, number] => {
		const clean = hex.replace('#', '').slice(0, 6);
		return [
			parseInt(clean.slice(0, 2), 16),
			parseInt(clean.slice(2, 4), 16),
			parseInt(clean.slice(4, 6), 16)
		];
	};

	const rgbToHex = ([r, g, b]: [number, number, number]): string =>
		`#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;

	/** Blend a theme color toward an engine default so the ocean keeps depth. */
	const blend = (theme: string, fallback: string, t: number): string => {
		const a = hexToRgb(theme);
		const b = hexToRgb(fallback);
		return rgbToHex([
			a[0] * t + b[0] * (1 - t),
			a[1] * t + b[1] * (1 - t),
			a[2] * t + b[2] * (1 - t)
		]);
	};

	const pushToEngine = () => {
		if (!frame?.contentWindow || !colorRef) return;
		const tokens = readThemeTokens(colorRef);
		const { elev, azim } = sunFromClock(new Date());
		const moon = moonFromClock(new Date());
		const isDaylight = elev > -2;
		frame.contentWindow.postMessage(
			{
				type: 'abyssal',
				// 62% theme primary + 38% engine teal keeps the water looking
				// like water while still tracking the theme.
				scatter: blend(tokens.primary, DEFAULT_SCATTER, 0.62),
				sss: blend(tokens.secondary, DEFAULT_SSS, 0.55),
				wind: 2 + 22 * character,
				// Sun tracks the system clock — sunrise, golden hour and night
				// all show up on their own. At night the engine renders a
				// moonlit sea instead of black.
				sunElev: elev,
				sunAzim: azim,
				moonElev: moon.elev,
				moonAzim: moon.azim,
				// Moon visibility is controlled independently from the sky's
				// physical moonlight intensity.
				moonE: 1.4,
				moonVisible: isDaylight ? 0 : 1,
				// Keep only the embedded daytime highlights restrained. The
				// scene exposure remains unchanged so the ocean cannot go black.
				backgroundExposure: isDaylight ? 0.68 : 1,
				backgroundBloom: isDaylight ? 0.35 : 1,
				backgroundGlitter: isDaylight ? 0.55 : 1
			},
			'*'
		);
	};

	onMount(() => {
		// The iframe may not have loaded its module when we first push —
		// retry until the engine signals it's listening.
		const timer = setInterval(() => {
			if (frame?.contentWindow) {
				pushToEngine();
				ready = true;
				clearInterval(timer);
			}
		}, 400);
		// Keep the sun following the clock (minute granularity is plenty).
		const sunTimer = setInterval(pushToEngine, 60000);
		// Live theme changes (data-theme swaps) re-tint the water.
		themeObserver = createThemeObserver(pushToEngine);
		return () => {
			clearInterval(timer);
			clearInterval(sunTimer);
			themeObserver?.disconnect();
		};
	});

	onDestroy(() => {
		themeObserver?.disconnect();
	});

	// Push whenever the character knob moves. (Reference `character` directly
	// so Svelte tracks it — it is only consumed inside pushToEngine.)
	$: if (ready && frame?.contentWindow && Number.isFinite(character)) pushToEngine();
</script>

<div bind:this={container} class="ocean-bg" aria-hidden="true">
	<iframe
		bind:this={frame}
		src="/abyssal/abyssal-ocean.html?n=512&bg=1"
		title="Ocean background"
		tabindex="-1"
	></iframe>
</div>

<!--
	Hidden element resolving the active theme's tokens:
	--p  -> color            (water tint)
	--s  -> --ref-secondary  (subsurface glow tint)
	--b1 -> background-color (backdrop)
-->
<div
	bind:this={colorRef}
	style="display: none; color: oklch(var(--p)); background-color: oklch(var(--b1)); --ref-secondary: oklch(var(--s));"
></div>

<style>
	.ocean-bg {
		position: fixed;
		inset: 0;
		width: 100%;
		height: 100vh;
		z-index: -2;
		overflow: hidden;
		pointer-events: none;
	}
	.ocean-bg iframe {
		border: 0;
		width: 100%;
		height: 100%;
		pointer-events: none;
	}
</style>
