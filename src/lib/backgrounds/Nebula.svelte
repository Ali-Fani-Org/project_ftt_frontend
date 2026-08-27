<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import * as THREE from 'three';
	import { readThemeTokens, createThemeObserver, hexLuminance, hexToRgba } from './themeColors';

	// ------------------------------------------------------------------
	// Nebula — drifting layers of deep-space fog.
	//
	// Three depth layers give the scene volume and parallax:
	//  - back: huge, dim, slow fog orbs (the deep haze)
	//  - mid : the theme-tinted clouds (the main visual)
	//  - near: tiny twinkling sparkles that drift closest to the camera,
	//          so mouse parallax reads strongly
	//
	// Optimized for the app shell:
	//  - the cloud wander spread is derived from the camera frustum (+ a
	//    margin past the edges), so the nebula always fills the window —
	//    including fullscreen and ultrawide — and is rebuilt on resize
	//  - pixel-ratio capped at 1.5 and a budgeted ~48fps loop
	//  - theme-aware vignette blends the nebula into the page corners
	//  - mouse depth-parallax: the camera eases toward the pointer, so the
	//    depth layers shift relative to each other
	//
	// Theme-aware: additive blending on dark themes (glow), normal
	// blending on light themes (readable tint).
	// ------------------------------------------------------------------

	export let count = 7; // mid-layer clouds
	export let speed = 0.35;

	// Render at most every ~21ms (~48fps).
	const FRAME_BUDGET_MS = 1000 / 48;
	const MAX_PIXEL_RATIO = 1.5;

	const FOV_DEG = 50;
	const CAMERA_Z = 30;
	const SPREAD_MARGIN = 1.2; // wander spread extends 20% past viewport edges

	// Mouse depth-parallax.
	const PARALLAX_X = 3.2;
	const PARALLAX_Y = 1.8;
	const MOUSE_EASE = 0.06;

	// Shooting stars — occasional bright streaks across the near layer.
	const STAR_MIN_INTERVAL = 4000; // ms between stars
	const STAR_MAX_INTERVAL = 9000;
	const STAR_LIFE = 2000; // ms a star lives
	const STAR_SPEED = 22; // world units/s (base; randomized)
	const MAX_STARS = 3;

	let container: HTMLDivElement;
	let colorRef: HTMLDivElement; // hidden element resolving theme CSS vars
	let vignetteRef: HTMLDivElement;
	let rafId = 0;
	let disposed = false;
	let running = false;
	let resizeTimer: ReturnType<typeof setTimeout> | null = null;

	let renderer: THREE.WebGLRenderer;
	let scene: THREE.Scene;
	let camera: THREE.PerspectiveCamera;
	let group: THREE.Group;
	let themeObserver: MutationObserver;
	let removeListeners: (() => void) | null = null;

	let primaryColor: THREE.Color = new THREE.Color('#7c3aed');
	let secondaryColor: THREE.Color = new THREE.Color('#38bdf8');

	// Wander spread (world units) — derived from the frustum on mount/resize.
	let rangeX = 30;
	let rangeY = 18;
	let fogTexture: THREE.Texture;

	type Layer = {
		sprite: THREE.Sprite;
		material: THREE.SpriteMaterial;
		baseScale: number;
		baseOpacity: number;
		phase: number;
		mix: number; // 0..1 lerp primary->secondary
		zBase: number; // center z for z-wander
		zAmp: number;
	};

	let orbs: Layer[] = [];
	let clouds: Layer[] = [];
	let sparkles: Layer[] = [];

	type ShootingStar = {
		head: THREE.Sprite;
		headMat: THREE.SpriteMaterial;
		tail: THREE.Sprite;
		tailMat: THREE.SpriteMaterial;
		glow: THREE.Sprite;
		glowMat: THREE.SpriteMaterial;
		start: THREE.Vector3;
		vel: THREE.Vector3;
		born: number;
		life: number;
		dir: number; // travel angle (radians)
		tailLen: number;
		headScale: number;
	};

	let stars: ShootingStar[] = [];
	let nextStarAt = 0;

	// Mouse depth-parallax state.
	let pointerNX = 0;
	let pointerNY = 0;
	let pointerNXTarget = 0;
	let pointerNYTarget = 0;

	const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
	const smooth = (a: number, b: number, x: number) => {
		const t = clamp((x - a) / (b - a), 0, 1);
		return t * t * (3 - 2 * t);
	};

	/** Soft radial fog texture (white core -> transparent edge). */
	const makeFogTexture = (): THREE.Texture => {
		const size = 128;
		const canvas = document.createElement('canvas');
		canvas.width = size;
		canvas.height = size;
		const ctx = canvas.getContext('2d')!;
		const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
		grad.addColorStop(0, 'rgba(255,255,255,1)');
		grad.addColorStop(0.3, 'rgba(255,255,255,0.55)');
		grad.addColorStop(0.6, 'rgba(255,255,255,0.22)');
		grad.addColorStop(1, 'rgba(255,255,255,0)');
		ctx.fillStyle = grad;
		ctx.fillRect(0, 0, size, size);
		const texture = new THREE.CanvasTexture(canvas);
		texture.needsUpdate = true;
		return texture;
	};

	const makeLayer = (
		scale: number,
		opacity: number,
		mix: number,
		zBase: number,
		zAmp: number
	): Layer => {
		const material = new THREE.SpriteMaterial({
			map: fogTexture,
			transparent: true,
			depthWrite: false,
			blending: THREE.NormalBlending
		});
		const sprite = new THREE.Sprite(material);
		sprite.scale.set(scale, scale, 1);
		group.add(sprite);
		return {
			sprite,
			material,
			baseScale: scale,
			baseOpacity: opacity,
			phase: Math.random() * Math.PI * 2,
			mix,
			zBase,
			zAmp
		};
	};

	/** (Re)build all layers with positions derived from the current viewport. */
	const buildLayers = (vw: number, vh: number) => {
		// Frustum half-extents at the nebula plane (z≈0), + margin.
		const halfH = Math.tan((FOV_DEG * Math.PI) / 360) * CAMERA_Z;
		const halfW = halfH * (vw / vh);
		rangeX = halfW * SPREAD_MARGIN;
		rangeY = halfH * SPREAD_MARGIN;

		for (const l of [...orbs, ...clouds, ...sparkles]) {
			group.remove(l.sprite);
			l.material.dispose();
		}
		orbs = [];
		clouds = [];
		sparkles = [];

		// Back layer: huge, dim fog orbs deep behind the mid clouds.
		const orbCount = 3;
		for (let i = 0; i < orbCount; i++) {
			const scale = 26 + Math.random() * 18;
			const opacity = 0.1 + Math.random() * 0.08;
			const zBase = -38 - i * 9;
			const orb = makeLayer(scale, opacity, 0.25 + Math.random() * 0.4, zBase, 4);
			// Pre-scatter so the first frame isn't a collapsed blob.
			orb.sprite.position.set(
				(Math.random() * 2 - 1) * rangeX,
				(Math.random() * 2 - 1) * rangeY,
				zBase
			);
			orbs.push(orb);
		}

		// Mid layer: the theme-tinted clouds (the main visual).
		for (let i = 0; i < count; i++) {
			const scale = 9 + Math.random() * 9;
			const opacity = 0.2 + Math.random() * 0.18;
			const zBase = -22 + Math.random() * 14;
			const cloud = makeLayer(scale, opacity, [0, 0.5, 1][i % 3], zBase, 5);
			cloud.sprite.position.set(
				(Math.random() * 2 - 1) * rangeX,
				(Math.random() * 2 - 1) * rangeY,
				zBase
			);
			clouds.push(cloud);
		}

		// Near layer: small twinkling sparkles closest to the camera, so the
		// mouse parallax reads strongly.
		const sparkleCount = 14;
		for (let i = 0; i < sparkleCount; i++) {
			const scale = 0.35 + Math.random() * 0.5;
			const opacity = 0.25 + Math.random() * 0.35;
			const zBase = 2 + Math.random() * 10;
			const sparkle = makeLayer(scale, opacity, 0.5 + Math.random() * 0.5, zBase, 2.5);
			sparkle.sprite.position.set(
				(Math.random() * 2 - 1) * rangeX,
				(Math.random() * 2 - 1) * rangeY,
				zBase
			);
			sparkles.push(sparkle);
		}

		// Expose live state for debugging / tuning.
		(window as any).__nebulaDebug = {
			orbs: orbs.length,
			clouds: clouds.length,
			sparkles: sparkles.length,
			rangeX,
			rangeY
		};
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

		const isDark = hexLuminance(tokens.background) < 0.5;
		const next = isDark ? THREE.AdditiveBlending : THREE.NormalBlending;
		const tint = new THREE.Color();
		for (const layer of [...orbs, ...clouds, ...sparkles]) {
			tint.copy(primaryColor).lerp(secondaryColor, layer.mix);
			layer.material.color.copy(tint);
			if (layer.material.blending !== next) {
				layer.material.blending = next;
				layer.material.needsUpdate = true;
			}
		}
		// Shooting stars share the theme too (near-white tint + blending).
		for (const star of stars) {
			tint.copy(primaryColor).lerp(secondaryColor, 0.85);
			star.headMat.color.copy(tint);
			star.tailMat.color.copy(tint);
			star.glowMat.color.copy(tint);
			if (star.headMat.blending !== next) {
				star.headMat.blending = next;
				star.headMat.needsUpdate = true;
				star.tailMat.blending = next;
				star.tailMat.needsUpdate = true;
				star.glowMat.blending = next;
				star.glowMat.needsUpdate = true;
			}
		}

		// Theme-aware vignette: blend the nebula into the backdrop at the edges.
		if (vignetteRef) {
			const strength = isDark ? 0.5 : 0.28;
			vignetteRef.style.background = `radial-gradient(130% 100% at 50% 42%, transparent 52%, ${hexToRgba(
				tokens.background,
				strength
			)} 100%)`;
		}
	}; /** Spawn a shooting star just above the viewport, streaking diagonally
	 * down through the near layer. Head + trailing tail (texture rotated
	 * along the velocity), bright near-white tint. */
	const spawnStar = () => {
		// Diagonally downward (THREE +y is up on screen): lean ±20° from
		// straight-down so the star streaks across the view, not away from it.
		const dir = -Math.PI / 2 + (Math.random() * 0.7 - 0.35);
		const speed = STAR_SPEED * (0.85 + Math.random() * 0.5);
		const dirVec = new THREE.Vector3(Math.cos(dir), Math.sin(dir), 0);
		const vel = dirVec.clone().multiplyScalar(speed);

		const tailLen = 5 + Math.random() * 4;
		const headScale = 0.55 + Math.random() * 0.45;

		// Bright head + elongated tail, both from the fog texture.
		const headMat = new THREE.SpriteMaterial({
			map: fogTexture,
			transparent: true,
			depthWrite: false,
			blending: THREE.AdditiveBlending
		});
		const tailMat = new THREE.SpriteMaterial({
			map: fogTexture,
			transparent: true,
			depthWrite: false,
			blending: THREE.AdditiveBlending,
			rotation: dir // rotate the streak along the travel direction
		});
		// Soft halo behind the streak: a big, dim glow that lights the
		// surrounding fog as the star passes.
		const glowMat = new THREE.SpriteMaterial({
			map: fogTexture,
			transparent: true,
			depthWrite: false,
			blending: THREE.AdditiveBlending
		});
		const tint = new THREE.Color().copy(primaryColor).lerp(secondaryColor, 0.85);
		headMat.color.copy(tint);
		tailMat.color.copy(tint);
		glowMat.color.copy(tint);
		headMat.opacity = 0;
		tailMat.opacity = 0;
		glowMat.opacity = 0;

		const head = new THREE.Sprite(headMat);
		head.scale.set(headScale, headScale, 1);
		const tail = new THREE.Sprite(tailMat);
		tail.scale.set(tailLen, 0.6, 1);
		// Big soft halo, ~3.5x the head, centered just behind it.
		const glow = new THREE.Sprite(glowMat);
		glow.scale.set(headScale * 3.5, headScale * 3.5, 1);

		// Start above the top edge; z in the near (sparkle) layer.
		const start = new THREE.Vector3(
			(Math.random() * 2 - 1) * rangeX * 1.1,
			rangeY * (1.2 + Math.random() * 0.6),
			4 + Math.random() * 8
		);
		head.position.copy(start);
		// Tail trails behind the head; the glow sits just behind the head.
		tail.position.copy(start).addScaledVector(dirVec, -tailLen * 0.5);
		glow.position.copy(start).addScaledVector(dirVec, -headScale * 1.2);

		group.add(head);
		group.add(tail);
		group.add(glow);
		stars.push({
			head,
			headMat,
			tail,
			tailMat,
			glow,
			glowMat,
			start,
			vel,
			born: performance.now(),
			life: STAR_LIFE,
			dir,
			tailLen,
			headScale
		});
	};

	onMount(() => {
		if (typeof window === 'undefined') return;

		const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		const vw = window.innerWidth;
		const vh = window.innerHeight;

		// 1. Renderer + scene
		scene = new THREE.Scene();
		camera = new THREE.PerspectiveCamera(FOV_DEG, vw / vh, 0.1, 300);
		camera.position.set(0, 0, CAMERA_Z);
		camera.lookAt(0, 0, 0);

		renderer = new THREE.WebGLRenderer({
			antialias: true,
			alpha: false,
			powerPreference: 'high-performance'
		});
		renderer.setSize(vw, vh);
		renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO));
		container.appendChild(renderer.domElement);

		// 2. Layers (a group so the whole nebula can rotate very slowly).
		group = new THREE.Group();
		scene.add(group);
		fogTexture = makeFogTexture();
		buildLayers(vw, vh);

		// 3. Theme sync (initial + live)
		updateColors();
		themeObserver = createThemeObserver(updateColors);

		// Schedule the first shooting star shortly after load.
		nextStarAt = performance.now() + STAR_MIN_INTERVAL * 0.5;

		// 4. Listeners
		const onResize = () => {
			if (!camera || !renderer) return;
			const w = window.innerWidth;
			const h = window.innerHeight;
			camera.aspect = w / h;
			camera.updateProjectionMatrix();
			renderer.setSize(w, h);
			// Debounced rebuild: fullscreen toggles / window drags must keep
			// the nebula covering the new viewport (spread is frustum-derived).
			if (resizeTimer) clearTimeout(resizeTimer);
			resizeTimer = setTimeout(() => {
				if (disposed) return;
				buildLayers(w, h);
				updateColors();
				if (reducedMotion) renderer.render(scene, camera);
			}, 200);
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
		// Mouse depth-parallax: track the pointer in NDC.
		const onMouseMove = (e: MouseEvent) => {
			if (disposed) return;
			pointerNXTarget = (e.clientX / window.innerWidth) * 2 - 1;
			pointerNYTarget = -(e.clientY / window.innerHeight) * 2 + 1;
		};
		const onMouseLeave = () => {
			pointerNXTarget = 0;
			pointerNYTarget = 0;
		};
		window.addEventListener('mousemove', onMouseMove);
		// mouseleave (not mouseout) — only fires when the pointer leaves the
		// window, not when it crosses child elements.
		document.documentElement.addEventListener('mouseleave', onMouseLeave);

		window.addEventListener('resize', onResize);
		window.addEventListener('visibilitychange', onVisibility);
		removeListeners = () => {
			window.removeEventListener('mousemove', onMouseMove);
			document.documentElement.removeEventListener('mouseleave', onMouseLeave);
			window.removeEventListener('resize', onResize);
			window.removeEventListener('visibilitychange', onVisibility);
		};

		// 5. Animation loop — budgeted to ~48fps: slow Lissajous wander,
		// breathing opacity, twinkling sparkles, shooting stars, gentle
		// sway + parallax.
		const trailDir = new THREE.Vector3(); // scratch vector (no per-frame alloc)
		let lastFrame = performance.now();

		const animate = () => {
			if (disposed || !running) return;
			rafId = requestAnimationFrame(animate);

			const now = performance.now();
			const elapsed = now - lastFrame;
			if (elapsed < FRAME_BUDGET_MS) return; // skip this frame
			lastFrame = now;
			const t = now / 1000;

			// Ease the pointer (parallax follows smoothly).
			pointerNX += (pointerNXTarget - pointerNX) * MOUSE_EASE;
			pointerNY += (pointerNYTarget - pointerNY) * MOUSE_EASE;

			// Back orbs: very slow drift + subtle breathing.
			for (let i = 0; i < orbs.length; i++) {
				const o = orbs[i];
				const p = o.phase;
				const s = o.sprite;
				s.position.x = Math.sin(t * 0.02 * speed + p) * rangeX * 0.85;
				s.position.y = Math.cos(t * 0.016 * speed + p * 1.4) * rangeY * 0.85;
				s.position.z = o.zBase + Math.sin(t * 0.01 * speed + p * 0.6) * o.zAmp;
				o.material.opacity = o.baseOpacity * (0.75 + 0.25 * Math.sin(t * 0.05 + p * 2));
			}

			// Mid clouds: Lissajous wander across the frustum + breathing.
			for (let i = 0; i < clouds.length; i++) {
				const c = clouds[i];
				const p = c.phase;
				const s = c.sprite;
				s.position.x =
					Math.sin(t * 0.06 * speed + p) * rangeX +
					Math.cos(t * 0.021 * speed + p * 1.7) * rangeX * 0.33;
				s.position.y =
					Math.cos(t * 0.05 * speed + p * 1.3) * rangeY +
					Math.sin(t * 0.017 * speed + p) * rangeY * 0.33;
				s.position.z = c.zBase + Math.sin(t * 0.03 * speed + p * 0.8) * c.zAmp;
				c.material.opacity = c.baseOpacity * (0.7 + 0.3 * Math.sin(t * 0.11 * speed + p * 2));
			}

			// Near sparkles: fast-ish drift + strong twinkle (they're the
			// layer that makes parallax obvious).
			for (let i = 0; i < sparkles.length; i++) {
				const sp = sparkles[i];
				const p = sp.phase;
				const s = sp.sprite;
				s.position.x =
					Math.sin(t * 0.1 * speed + p) * rangeX * 0.9 +
					Math.cos(t * 0.04 * speed + p * 2.1) * rangeX * 0.2;
				s.position.y =
					Math.cos(t * 0.09 * speed + p * 1.6) * rangeY * 0.9 +
					Math.sin(t * 0.033 * speed + p) * rangeY * 0.25;
				s.position.z = sp.zBase + Math.sin(t * 0.06 * speed + p * 1.3) * sp.zAmp;
				sp.material.opacity =
					sp.baseOpacity * (0.45 + 0.55 * Math.sin(t * (1.2 + p * 0.4) + p * 3));
			}

			// Shooting stars: spawn on schedule, streak, fade, expire.
			if (stars.length < MAX_STARS && now >= nextStarAt) {
				spawnStar();
				nextStarAt =
					now + STAR_MIN_INTERVAL + Math.random() * (STAR_MAX_INTERVAL - STAR_MIN_INTERVAL);
			}
			for (let i = stars.length - 1; i >= 0; i--) {
				const st = stars[i];
				const age = now - st.born;
				const lifeFrac = age / st.life;
				if (lifeFrac >= 1) {
					// Expired: remove and dispose.
					group.remove(st.head, st.tail, st.glow);
					st.headMat.dispose();
					st.tailMat.dispose();
					st.glowMat.dispose();
					stars.splice(i, 1);
					continue;
				}
				// Position: linear streak from start along velocity.
				st.head.position.copy(st.start).addScaledVector(st.vel, age / 1000);
				// Tail trails behind the head; glow just behind the head.
				trailDir.set(Math.cos(st.dir), Math.sin(st.dir), 0);
				st.tail.position.copy(st.head.position).addScaledVector(trailDir, -st.tailLen * 0.5);
				st.glow.position.copy(st.head.position).addScaledVector(trailDir, -st.headScale * 1.2);
				// Envelope: fade in fast, hold, fade out near the end. The glow
				// rides a slightly softer envelope so the fog lingers a touch
				// longer than the streak itself.
				const env = smooth(0, 0.12, lifeFrac) * (1 - smooth(0.62, 1, lifeFrac));
				const envGlow = smooth(0, 0.2, lifeFrac) * (1 - smooth(0.5, 1, lifeFrac));
				st.headMat.opacity = 0.95 * env;
				st.tailMat.opacity = 0.55 * env;
				st.glowMat.opacity = 0.32 * envGlow;
			}

			// Barely-there rotation + sway + mouse depth-parallax.
			group.rotation.z = t * 0.008 * speed;
			camera.position.x = Math.sin(t * 0.04) * 1.6 + pointerNX * PARALLAX_X;
			camera.position.y = Math.cos(t * 0.032) * 1.1 + pointerNY * PARALLAX_Y;
			camera.lookAt(0, 0, 0);

			// Debug: expose live state for tuning/verification.
			const dbg = (window as any).__nebulaDebug;
			if (dbg) {
				dbg.pointerNX = pointerNX;
				dbg.pointerNY = pointerNY;
				dbg.rangeX = rangeX;
				dbg.rangeY = rangeY;
				dbg.starCount = stars.length;
				dbg.stars = stars.map((st) => ({
					x: +st.head.position.x.toFixed(1),
					y: +st.head.position.y.toFixed(1),
					z: +st.head.position.z.toFixed(1),
					headOp: +st.headMat.opacity.toFixed(2),
					tailOp: +st.tailMat.opacity.toFixed(2),
					glowOp: +st.glowMat.opacity.toFixed(2),
					glowScale: +st.glow.scale.x.toFixed(1)
				}));
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
		if (resizeTimer) clearTimeout(resizeTimer);
		themeObserver?.disconnect();
		removeListeners?.();
		for (const l of [...orbs, ...clouds, ...sparkles]) {
			group?.remove(l.sprite);
			l.material.dispose();
		}
		for (const st of stars) {
			group?.remove(st.head, st.tail, st.glow);
			st.headMat.dispose();
			st.tailMat.dispose();
			st.glowMat.dispose();
		}
		orbs = [];
		clouds = [];
		sparkles = [];
		stars = [];
		if (fogTexture) fogTexture.dispose();
		if (renderer) {
			renderer.dispose();
			renderer.forceContextLoss();
		}
	});
</script>

<div bind:this={container} class="nebula-bg" aria-hidden="true"></div>
<div bind:this={vignetteRef} class="nebula-vignette" aria-hidden="true"></div>

<!--
	Hidden element resolving the active theme's tokens:
	--p  -> color            (cloud start hue)
	--s  -> --ref-secondary  (cloud end hue)
	--b1 -> background-color (backdrop + vignette)
-->
<div
	bind:this={colorRef}
	style="display: none; color: oklch(var(--p)); background-color: oklch(var(--b1)); --ref-secondary: oklch(var(--s));"
></div>

<style>
	.nebula-bg {
		position: fixed;
		inset: 0;
		width: 100%;
		height: 100vh;
		z-index: -2;
		overflow: hidden;
		pointer-events: none;
	}

	/* Soft edge vignette sits above the canvas, below all content. */
	.nebula-vignette {
		position: fixed;
		inset: 0;
		z-index: -1;
		pointer-events: none;
		transition: background 0.6s ease;
	}
</style>
