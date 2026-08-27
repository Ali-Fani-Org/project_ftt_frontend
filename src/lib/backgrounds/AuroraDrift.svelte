<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import * as THREE from 'three';
	import { readThemeTokens, createThemeObserver, hexLuminance } from './themeColors';

	// ------------------------------------------------------------------
	// Aurora Drift — a depth-layered particle field.
	//
	// Soft glowing orbs spread across a wide, shallow volume: each one
	// drifts gently, twinkles on its own phase, and fades with distance.
	// The camera sways idly and eases toward the pointer, so the field
	// reads as living space rather than a flat dot grid. Colors follow
	// the active theme (primary -> secondary gradient, base as backdrop)
	// and update live when the theme changes.
	// ------------------------------------------------------------------

	export let speed = 0.35; // global animation speed scale
	export let density = 750; // particle count
	export let interactive = true; // mouse parallax

	let container: HTMLDivElement;
	let colorRef: HTMLDivElement; // hidden element resolving theme CSS vars
	let rafId = 0;
	let disposed = false;
	let running = false;

	let renderer: THREE.WebGLRenderer;
	let scene: THREE.Scene;
	let camera: THREE.PerspectiveCamera;
	let points: THREE.Points;
	let material: THREE.ShaderMaterial;
	let themeObserver: MutationObserver;
	let removeListeners: (() => void) | null = null;

	// Mouse parallax (smoothed)
	let targetX = 0;
	let targetY = 0;
	let currentX = 0;
	let currentY = 0;

	const onPointerMove = (e: PointerEvent) => {
		targetX = (e.clientX / window.innerWidth) * 2 - 1;
		targetY = -((e.clientY / window.innerHeight) * 2 - 1);
	};

	const uniforms = {
		uTime: { value: 0 },
		uPrimary: { value: new THREE.Color('#7c3aed') },
		uSecondary: { value: new THREE.Color('#38bdf8') },
		uPixelRatio: { value: 1 }
	};

	const updateColors = () => {
		if (!material || !colorRef) return;
		const tokens = readThemeTokens(colorRef);
		if (scene.background instanceof THREE.Color) {
			scene.background.set(tokens.background);
		} else {
			scene.background = new THREE.Color(tokens.background);
		}
		uniforms.uPrimary.value.set(tokens.primary);
		uniforms.uSecondary.value.set(tokens.secondary);

		// Theme-aware blending: additive makes the orbs glow on dark
		// backdrops (where normal blending nearly vanishes), while light
		// themes keep normal blending so they never wash out.
		const isDark = hexLuminance(tokens.background) < 0.5;
		const next = isDark ? THREE.AdditiveBlending : THREE.NormalBlending;
		if (material.blending !== next) {
			material.blending = next;
			material.needsUpdate = true;
		}
	};

	// ------------------------------------------------------------------
	// Shaders
	// ------------------------------------------------------------------
	const vertexShader = /* glsl */ `
		attribute float aSize;
		attribute float aPhase;
		attribute vec3 aDrift;

		uniform float uTime;
		uniform float uPixelRatio;

		varying float vAlpha;
		varying float vDepth;

		void main() {
			vec3 p = position;

			// Gentle per-particle drift: slow orbit wobble + a lazy vertical
			// sway. Bounded (no linear uTime term) so orbs never drift
			// off-screen no matter how long the app runs.
			p.x += sin(uTime * 0.14 + aDrift.x) * 0.7;
			p.y += cos(uTime * 0.11 + aDrift.y) * 0.55 + sin(uTime * 0.05 + aDrift.z) * 2.2;
			p.z += sin(uTime * 0.09 + aDrift.z) * 1.1;

			vec4 mv = modelViewMatrix * vec4(p, 1.0);
			gl_Position = projectionMatrix * mv;

			// Twinkle: every orb breathes on its own phase.
			float twinkle = 0.7 + 0.3 * sin(uTime * 1.3 + aPhase);
			vAlpha = twinkle;

			// Depth fade so far orbs melt into the backdrop.
			float dist = -mv.z;
			vDepth = dist;
			vAlpha *= smoothstep(70.0, 8.0, dist);

			// Perspective size attenuation.
			gl_PointSize = aSize * uPixelRatio * (320.0 / max(dist, 0.1));
		}
	`;

	const fragmentShader = /* glsl */ `
		uniform vec3 uPrimary;
		uniform vec3 uSecondary;

		varying float vAlpha;
		varying float vDepth;

		void main() {
			vec2 uv = gl_PointCoord - 0.5;
			float d = length(uv) * 2.0;

			// Soft round glow with a tight core.
			float glow = pow(smoothstep(1.0, 0.0, d), 1.7);

			// Radial gradient: primary core fading into the secondary hue.
			vec3 color = mix(uPrimary, uSecondary, clamp(d, 0.0, 1.0));

			gl_FragColor = vec4(color, glow * vAlpha);
		}
	`;

	// ------------------------------------------------------------------
	// Lifecycle
	// ------------------------------------------------------------------
	onMount(() => {
		if (typeof window === 'undefined') return;

		const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

		// 1. Renderer + scene
		scene = new THREE.Scene();
		camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 200);
		camera.position.set(0, 0, 16);
		camera.lookAt(0, 0, -6);

		renderer = new THREE.WebGLRenderer({
			antialias: true,
			alpha: false,
			powerPreference: 'high-performance'
		});
		renderer.setSize(window.innerWidth, window.innerHeight);
		renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
		uniforms.uPixelRatio.value = renderer.getPixelRatio();
		container.appendChild(renderer.domElement);

		// 2. Particle field
		const geometry = new THREE.BufferGeometry();
		const positions = new Float32Array(density * 3);
		const sizes = new Float32Array(density);
		const phases = new Float32Array(density);
		const drifts = new Float32Array(density * 3);

		for (let i = 0; i < density; i++) {
			positions[i * 3] = (Math.random() * 2 - 1) * 30;
			positions[i * 3 + 1] = (Math.random() * 2 - 1) * 17;
			// Spread deep behind the camera plane for real parallax depth.
			positions[i * 3 + 2] = Math.random() * 44 - 40;
			sizes[i] = 0.2 + Math.random() * 0.6;
			phases[i] = Math.random() * Math.PI * 2;
			drifts[i * 3] = Math.random() * Math.PI * 2;
			drifts[i * 3 + 1] = Math.random() * Math.PI * 2;
			drifts[i * 3 + 2] = Math.random() * Math.PI * 2;
		}

		geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
		geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
		geometry.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
		geometry.setAttribute('aDrift', new THREE.BufferAttribute(drifts, 3));

		material = new THREE.ShaderMaterial({
			vertexShader,
			fragmentShader,
			uniforms,
			transparent: true,
			depthWrite: false,
			// Normal blending (not additive): additive orbs wash out to
			// invisible on light themes, while normal lets the theme colors
			// read on any backdrop.
			blending: THREE.NormalBlending
		});

		points = new THREE.Points(geometry, material);
		scene.add(points);

		// 3. Theme sync (initial + live)
		updateColors();
		themeObserver = createThemeObserver(updateColors);

		// 4. Listeners
		const onResize = () => {
			if (!camera || !renderer) return;
			camera.aspect = window.innerWidth / window.innerHeight;
			camera.updateProjectionMatrix();
			renderer.setSize(window.innerWidth, window.innerHeight);
			renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
			uniforms.uPixelRatio.value = renderer.getPixelRatio();
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
		if (interactive && !reducedMotion) {
			window.addEventListener('pointermove', onPointerMove, { passive: true });
		}
		removeListeners = () => {
			window.removeEventListener('resize', onResize);
			window.removeEventListener('visibilitychange', onVisibility);
			window.removeEventListener('pointermove', onPointerMove);
		};

		// 5. Animation loop
		const animate = () => {
			if (disposed || !running) return;
			rafId = requestAnimationFrame(animate);

			uniforms.uTime.value += speed;

			// Idle camera sway + eased pointer parallax.
			const t = uniforms.uTime.value;
			currentX += (targetX - currentX) * 0.045;
			currentY += (targetY - currentY) * 0.045;
			camera.position.x = currentX * 2.6 + Math.sin(t * 0.06) * 0.6;
			camera.position.y = currentY * 1.7 + Math.cos(t * 0.05) * 0.4;
			camera.lookAt(0, 0, -6);

			renderer.render(scene, camera);
		};

		if (reducedMotion) {
			// One calm frame, no motion.
			uniforms.uTime.value = 0;
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
		if (renderer) {
			renderer.dispose();
			renderer.forceContextLoss();
		}
		if (material) material.dispose();
		if (points && points.geometry) points.geometry.dispose();
	});
</script>

<div bind:this={container} class="aurora-bg" aria-hidden="true"></div>

<!--
	Hidden element resolving the active theme's tokens:
	--p  -> color            (particle core)
	--s  -> --ref-secondary  (particle edge)
	--b1 -> background-color (backdrop)
-->
<div
	bind:this={colorRef}
	style="display: none; color: oklch(var(--p)); background-color: oklch(var(--b1)); --ref-secondary: oklch(var(--s));"
></div>

<style>
	.aurora-bg {
		position: fixed;
		inset: 0;
		width: 100%;
		height: 100vh;
		z-index: -2;
		overflow: hidden;
		pointer-events: none;
	} /* Soft atmosphere: keep the field fully visible and only gently frame
	   the edges. No heavy center wash (that dimmed the orbs where the
	   backdrop shows most). All theme-proof via --b1. */
	.aurora-bg::after {
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
