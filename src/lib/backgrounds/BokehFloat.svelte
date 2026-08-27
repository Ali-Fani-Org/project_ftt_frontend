<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import * as THREE from 'three';
	import { readThemeTokens, createThemeObserver, hexLuminance } from './themeColors';

	// ------------------------------------------------------------------
	// Bokeh Float — a dreamy counterpoint to Aurora Drift.
	//
	// A handful of large, heavily blurred orbs in theme colors drift
	// upward at different speeds and depths, slowly breathing in size
	// and opacity. Rendered as sprites with a soft radial-gradient
	// texture, normal-blended so the theme hues read on any backdrop.
	// ------------------------------------------------------------------

	export let count = 22;
	export let speed = 0.35; // global time scale

	let container: HTMLDivElement;
	let colorRef: HTMLDivElement; // hidden element resolving theme CSS vars
	let rafId = 0;
	let disposed = false;
	let running = false;

	let renderer: THREE.WebGLRenderer;
	let scene: THREE.Scene;
	let camera: THREE.PerspectiveCamera;
	let themeObserver: MutationObserver;
	let removeListeners: (() => void) | null = null;

	let orbs: {
		sprite: THREE.Sprite;
		material: THREE.SpriteMaterial;
		baseScale: number;
		rise: number;
		phase: number;
		breathe: number;
		baseOpacity: number;
	}[] = [];
	let primaryColor: THREE.Color = new THREE.Color('#7c3aed');
	let secondaryColor: THREE.Color = new THREE.Color('#38bdf8');

	// Soft radial-gradient texture: white core fading to transparent edge,
	// tinted per-sprite via SpriteMaterial.color.
	const makeOrbTexture = () => {
		const size = 128;
		const canvas = document.createElement('canvas');
		canvas.width = size;
		canvas.height = size;
		const ctx = canvas.getContext('2d')!;
		const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
		gradient.addColorStop(0, 'rgba(255,255,255,0.9)');
		gradient.addColorStop(0.35, 'rgba(255,255,255,0.45)');
		gradient.addColorStop(1, 'rgba(255,255,255,0)');
		ctx.fillStyle = gradient;
		ctx.fillRect(0, 0, size, size);
		const texture = new THREE.CanvasTexture(canvas);
		texture.needsUpdate = true;
		return texture;
	};

	const updateColors = () => {
		if (!colorRef) return;
		const tokens = readThemeTokens(colorRef);
		if (scene.background instanceof THREE.Color) {
			scene.background.set(tokens.background);
		} else {
			scene.background = new THREE.Color(tokens.background);
		}
		primaryColor = new THREE.Color(tokens.primary);
		secondaryColor = new THREE.Color(tokens.secondary);

		// Theme-aware blending: additive glows on dark backdrops, normal on
		// light ones so the orbs never wash out.
		const isDark = hexLuminance(tokens.background) < 0.5;
		const next = isDark ? THREE.AdditiveBlending : THREE.NormalBlending;
		for (const orb of orbs) {
			orb.material.color.copy(primaryColor).lerp(secondaryColor, orb.phase);
			if (orb.material.blending !== next) {
				orb.material.blending = next;
				orb.material.needsUpdate = true;
			}
		}
	};

	onMount(() => {
		if (typeof window === 'undefined') return;

		const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

		// 1. Renderer + scene
		scene = new THREE.Scene();
		camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 200);
		camera.position.set(0, 0, 26);
		camera.lookAt(0, 0, -10);

		renderer = new THREE.WebGLRenderer({
			antialias: true,
			alpha: false,
			powerPreference: 'high-performance'
		});
		renderer.setSize(window.innerWidth, window.innerHeight);
		renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
		container.appendChild(renderer.domElement);

		// 2. Orbs
		const texture = makeOrbTexture();
		for (let i = 0; i < count; i++) {
			const phase = Math.random();
			const material = new THREE.SpriteMaterial({
				map: texture,
				transparent: true,
				depthWrite: false,
				blending: THREE.NormalBlending
			});
			material.color.copy(primaryColor).lerp(secondaryColor, phase);

			const sprite = new THREE.Sprite(material);
			sprite.position.set(
				(Math.random() * 2 - 1) * 34,
				(Math.random() * 2 - 1) * 16,
				-Math.random() * 34 + 4
			);

			const baseScale = 3.2 + Math.random() * 6;
			sprite.scale.set(baseScale, baseScale, 1);
			scene.add(sprite);

			orbs.push({
				sprite,
				material,
				baseScale,
				rise: 0.02 + Math.random() * 0.05,
				phase,
				breathe: 0.4 + Math.random() * 0.7,
				baseOpacity: 0.32 + Math.random() * 0.3
			});
		}

		// 3. Theme sync (initial + live)
		updateColors();
		themeObserver = createThemeObserver(updateColors);

		// 4. Listeners
		const onResize = () => {
			if (!camera || !renderer) return;
			camera.aspect = window.innerWidth / window.innerHeight;
			camera.updateProjectionMatrix();
			renderer.setSize(window.innerWidth, window.innerHeight);
		};
		const onVisibility = () => {
			if (document.hidden) {
				running = false;
				cancelAnimationFrame(rafId);
			} else if (!disposed) {
				running = true;
				animate();
			}
		};
		window.addEventListener('resize', onResize);
		window.addEventListener('visibilitychange', onVisibility);
		removeListeners = () => {
			window.removeEventListener('resize', onResize);
			window.removeEventListener('visibilitychange', onVisibility);
		};

		// 5. Animation loop
		const animate = () => {
			if (disposed || !running) return;
			rafId = requestAnimationFrame(animate);

			const t = performance.now() / 1000;

			// Idle camera sway — slow Lissajous drift, no pointer coupling.
			camera.position.x = Math.sin(t * 0.05) * 1.4;
			camera.position.y = Math.cos(t * 0.04) * 0.9;
			camera.lookAt(0, 0, -10);

			// Drift orbs upward, wrapping at the top; breathe size/opacity.
			for (const orb of orbs) {
				const sprite = orb.sprite;
				sprite.position.y += orb.rise * speed * 0.35;
				if (sprite.position.y > 18) {
					sprite.position.y = -18;
					sprite.position.x = (Math.random() * 2 - 1) * 34;
				}
				const breath = 1 + 0.14 * Math.sin(t * orb.breathe * speed + orb.phase * Math.PI * 2);
				const scale = orb.baseScale * breath;
				sprite.scale.set(scale, scale, 1);
				orb.material.opacity =
					orb.baseOpacity *
					(0.75 + 0.25 * Math.sin(t * orb.breathe * 0.8 + orb.phase * Math.PI * 2));
			}

			renderer.render(scene, camera);
		};

		if (reducedMotion) {
			// One calm frame, no motion.
			renderer.render(scene, camera);
		} else {
			running = true;
			animate();
		}

		return () => {
			removeListeners?.();
		};
	});

	onDestroy(() => {
		if (typeof window === 'undefined') return;
		disposed = true;
		running = false;
		cancelAnimationFrame(rafId);
		themeObserver?.disconnect();
		removeListeners?.();
		for (const orb of orbs) {
			scene.remove(orb.sprite);
			orb.material.dispose();
		}
		orbs = [];
		if (renderer) {
			renderer.dispose();
			renderer.forceContextLoss();
		}
	});
</script>

<div bind:this={container} class="bokeh-bg" aria-hidden="true"></div>

<!--
	Hidden element resolving the active theme's tokens:
	--p  -> color            (orb gradient start)
	--s  -> --ref-secondary  (orb gradient end)
	--b1 -> background-color (backdrop)
-->
<div
	bind:this={colorRef}
	style="display: none; color: oklch(var(--p)); background-color: oklch(var(--b1)); --ref-secondary: oklch(var(--s));"
></div>

<style>
	.bokeh-bg {
		position: fixed;
		inset: 0;
		width: 100%;
		height: 100vh;
		z-index: -2;
		overflow: hidden;
		pointer-events: none;
	} /* Soft atmosphere: keep the orbs fully visible, gently frame the edges. */
	.bokeh-bg::after {
		content: '';
		position: absolute;
		inset: 0;
		background: radial-gradient(
			130% 100% at 50% 40%,
			transparent 62%,
			color-mix(in oklch, oklch(var(--b1)) 45%, transparent) 100%
		);
		pointer-events: none;
	}
</style>
