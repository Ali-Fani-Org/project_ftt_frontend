<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import * as THREE from 'three';
	import { readThemeTokens, createThemeObserver, hexLuminance, hexToRgba } from './themeColors';

	// ------------------------------------------------------------------
	// Lattice — a glowing, depth-faded web of particles.
	//
	// Optimized for the app shell:
	//  - the grid is sized from the camera frustum (with a margin past the
	//    viewport edges), so it always covers the whole window — including
	//    fullscreen and ultrawide — instead of leaving empty side bands
	//  - the grid is rebuilt on resize (debounced) so fullscreen toggles
	//    and window drags keep full coverage
	//  - pixel-ratio capped at 1.5 and a budgeted ~48fps loop, so the
	//    background never competes with the UI for the GPU
	//  - per-vertex alpha gives an edge fade + z-depth fog (the lattice
	//    melts into the backdrop instead of hard-cutting at window edges)
	//  - soft radial glow dots instead of hard squares
	//  - a theme-aware vignette blends the lattice into the page corners
	//
	// Theme-aware: additive blending on dark themes (glow), normal
	// blending on light themes (readable tint).
	// ------------------------------------------------------------------

	export let cols = 0; // 0 = auto (derived from viewport + camera frustum)
	export let rows = 0;
	export let speed = 0.35;

	// Render at most every ~21ms (~48fps). A calm backdrop doesn't need to
	// repaint at 60/120/144Hz — this alone cuts GPU/CPU cost by up to 65%.
	const FRAME_BUDGET_MS = 1000 / 48;
	const MAX_PIXEL_RATIO = 1.5;

	// Camera + frustum constants. The grid is derived from these so the
	// lattice always fills the visible area at the lattice plane (z≈0).
	const FOV_DEG = 55;
	const CAMERA_Z = 46;
	const GRID_MARGIN = 1.25; // grid extends 25% past the viewport edges
	const spacing = 2.9;

	// Mouse interaction — depth parallax + cursor ripples.
	// - The camera eases toward the pointer, so the depth-fogged lattice
	//   shows genuine parallax between near/far layers as you move the mouse.
	// - Moving the mouse drops ripples that travel outward as z-waves,
	//   like drops on water, bending the mesh as they pass.
	const PARALLAX_X = 4.5; // camera x offset (world units) at the screen edge
	const PARALLAX_Y = 2.5;
	const MOUSE_EASE = 0.055; // smoothing of the pointer position
	const RIPPLE_RADIUS = 15; // world units the wave travels
	const RIPPLE_SPEED = 7; // units per second
	const RIPPLE_AMP = 2.8; // max z displacement of the wave
	const RIPPLE_WIDTH = 1.6; // wave band width (units)
	const RIPPLE_LIFETIME = 2100; // ms until a ripple fades out
	const RIPPLE_MIN_GAP = 140; // ms between ripples while moving
	const MAX_RIPPLES = 5;

	let container: HTMLDivElement;
	let colorRef: HTMLDivElement; // hidden element resolving theme CSS vars
	let vignetteRef: HTMLDivElement;
	let rafId = 0;
	let disposed = false;
	let running = false;
	let baseAlpha = 0.9;
	let resizeTimer: ReturnType<typeof setTimeout> | null = null;

	let renderer: THREE.WebGLRenderer;
	let scene: THREE.Scene;
	let camera: THREE.PerspectiveCamera;
	let group: THREE.Group;
	let themeObserver: MutationObserver;
	let removeListeners: (() => void) | null = null;

	let pointMaterial: THREE.PointsMaterial;
	let lineMaterial: THREE.LineBasicMaterial;
	let pointGeo: THREE.BufferGeometry;
	let lineGeo: THREE.BufferGeometry;
	let glowTexture: THREE.Texture;

	// --- Geometry data (mutated by buildGrid / rebuildGrid, read each frame) ---
	let gridRows = 0;
	let gridCols = 0;
	let basePositions: number[] = [];
	let phases: number[] = [];
	let lineIndexMap: number[] = []; // line vertex -> point index
	let pointColors: Float32Array; // rgba per point (edge fade * depth fog)
	let lineColors: Float32Array; // rgba per line vertex
	let pointAttr: THREE.BufferAttribute;
	let lineAttr: THREE.BufferAttribute;
	let points: Float32Array;
	let lines: Float32Array;

	// Mouse interaction state.
	let pointerNX = 0; // smoothed pointer NDC (-1..1)
	let pointerNY = 0;
	let pointerNXTarget = 0;
	let pointerNYTarget = 0;
	let ripples: { x: number; y: number; born: number }[] = [];
	let lastRippleAt = -Infinity;

	const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
	const smoothstep = (e0: number, e1: number, x: number) => {
		const t = clamp((x - e0) / (e1 - e0), 0, 1);
		return t * t * (3 - 2 * t);
	};

	/** Soft round dot texture (radial gradient) instead of hard square points. */
	const makeGlowTexture = (): THREE.Texture => {
		const size = 64;
		const canvas = document.createElement('canvas');
		canvas.width = size;
		canvas.height = size;
		const ctx = canvas.getContext('2d')!;
		const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
		grad.addColorStop(0, 'rgba(255,255,255,1)');
		grad.addColorStop(0.35, 'rgba(255,255,255,0.55)');
		grad.addColorStop(1, 'rgba(255,255,255,0)');
		ctx.fillStyle = grad;
		ctx.fillRect(0, 0, size, size);
		const texture = new THREE.CanvasTexture(canvas);
		texture.needsUpdate = true;
		return texture;
	};

	// ------------------------------------------------------------------
	// Grid + connectivity
	// ------------------------------------------------------------------

	const buildGrid = () => {
		basePositions = [];
		phases = [];
		pointColors = new Float32Array(gridRows * gridCols * 4);

		// Half-extents used to normalize distance-from-center for the fade.
		const halfW = ((gridCols - 1) / 2) * spacing;
		const halfH = ((gridRows - 1) / 2) * spacing;

		let i = 0;
		for (let r = 0; r < gridRows; r++) {
			for (let c = 0; c < gridCols; c++) {
				const x = (c - (gridCols - 1) / 2) * spacing;
				const y = (r - (gridRows - 1) / 2) * spacing;
				const z = (Math.random() * 2 - 1) * 5;
				basePositions.push(x, y, z);
				phases.push(Math.random() * Math.PI * 2);

				// Edge fade (distance from center) x depth fog (|z|).
				const dx = x / (halfW || 1);
				const dy = y / (halfH || 1);
				const dist = Math.sqrt(dx * dx + dy * dy);
				const edge = 1 - smoothstep(0.45, 1.05, dist);
				const fog = clamp(1 - Math.abs(z) / 11, 0.35, 1);
				const a = edge * fog;
				pointColors[i * 4] = 1;
				pointColors[i * 4 + 1] = 1;
				pointColors[i * 4 + 2] = 1;
				pointColors[i * 4 + 3] = a;
				i++;
			}
		}

		// Lines: right + bottom neighbours; remember which point each vertex
		// references so the per-frame copy is a straight index walk.
		const idx = (r: number, c: number) => r * gridCols + c;
		const pairs: number[] = [];
		for (let r = 0; r < gridRows; r++) {
			for (let c = 0; c < gridCols; c++) {
				if (c < gridCols - 1) pairs.push(idx(r, c), idx(r, c + 1));
				if (r < gridRows - 1) pairs.push(idx(r, c), idx(r + 1, c));
			}
		}
		lineIndexMap = pairs;
		lineColors = new Float32Array(pairs.length * 4);
		for (let v = 0; v < pairs.length; v++) {
			const a = pointColors[pairs[v] * 4 + 3];
			lineColors[v * 4] = 1;
			lineColors[v * 4 + 1] = 1;
			lineColors[v * 4 + 2] = 1;
			lineColors[v * 4 + 3] = a * 0.85;
		}
	};

	const buildGeometry = () => {
		const n = gridRows * gridCols;

		pointGeo = new THREE.BufferGeometry();
		const pointArray = new Float32Array(n * 3);
		for (let i = 0; i < n; i++) {
			pointArray[i * 3] = basePositions[i * 3];
			pointArray[i * 3 + 1] = basePositions[i * 3 + 1];
			pointArray[i * 3 + 2] = basePositions[i * 3 + 2];
		}
		pointGeo.setAttribute('position', new THREE.BufferAttribute(pointArray, 3));
		pointGeo.setAttribute('color', new THREE.BufferAttribute(pointColors, 4));

		lineGeo = new THREE.BufferGeometry();
		const lineArray = new Float32Array(lineIndexMap.length * 3);
		// Initialize from the base positions so the first frame is valid.
		for (let v = 0; v < lineIndexMap.length; v++) {
			const src = lineIndexMap[v] * 3;
			lineArray[v * 3] = pointArray[src];
			lineArray[v * 3 + 1] = pointArray[src + 1];
			lineArray[v * 3 + 2] = pointArray[src + 2];
		}
		lineGeo.setAttribute('position', new THREE.BufferAttribute(lineArray, 3));
		lineGeo.setAttribute('color', new THREE.BufferAttribute(lineColors, 4));

		// Bind the live arrays the animation loop mutates each frame.
		pointAttr = pointGeo.attributes.position as THREE.BufferAttribute;
		lineAttr = lineGeo.attributes.position as THREE.BufferAttribute;
		points = pointAttr.array as Float32Array;
		lines = lineAttr.array as Float32Array;
	};

	/**
	 * Size the grid from the camera frustum at the lattice plane (z≈0), plus
	 * GRID_MARGIN so the lattice extends past every viewport edge. Without
	 * this the pattern only fills a narrow central band on wide windows.
	 */
	const rebuildGrid = (vw: number, vh: number) => {
		if (cols > 0 && rows > 0) {
			gridCols = cols;
			gridRows = rows;
		} else {
			const halfH = Math.tan((FOV_DEG * Math.PI) / 360) * CAMERA_Z;
			const halfW = halfH * (vw / vh);
			gridCols = cols || Math.max(10, Math.ceil((halfW * 2 * GRID_MARGIN) / spacing) + 1);
			gridRows = rows || Math.max(8, Math.ceil((halfH * 2 * GRID_MARGIN) / spacing) + 1);
		}

		const oldPointGeo = pointGeo;
		const oldLineGeo = lineGeo;

		buildGrid();
		buildGeometry();

		if (oldPointGeo) oldPointGeo.dispose();
		if (oldLineGeo) oldLineGeo.dispose();

		if (group) {
			group.clear();
			group.add(new THREE.Points(pointGeo, pointMaterial));
			group.add(new THREE.LineSegments(lineGeo, lineMaterial));
		}

		// Expose sizing for debugging / tuning.
		(window as any).__latticeDebug = {
			cols: gridCols,
			rows: gridRows,
			spacing,
			visibleHalfW: Math.tan((FOV_DEG * Math.PI) / 360) * CAMERA_Z * (vw / vh),
			visibleHalfH: Math.tan((FOV_DEG * Math.PI) / 360) * CAMERA_Z,
			gridW: (gridCols - 1) * spacing,
			gridH: (gridRows - 1) * spacing,
			// Live arrays so the warp can be measured from the console.
			points,
			base: basePositions
		};
	};

	const updateColors = () => {
		if (!pointMaterial || !colorRef) return;
		const tokens = readThemeTokens(colorRef);
		if (scene.background instanceof THREE.Color) {
			scene.background.set(tokens.background);
		} else {
			scene.background = new THREE.Color(tokens.background);
		}

		const isDark = hexLuminance(tokens.background) < 0.5;
		baseAlpha = isDark ? 0.9 : 0.55;
		const next = isDark ? THREE.AdditiveBlending : THREE.NormalBlending;
		if (pointMaterial.blending !== next || lineMaterial.blending !== next) {
			pointMaterial.blending = next;
			lineMaterial.blending = next;
			pointMaterial.needsUpdate = true;
			lineMaterial.needsUpdate = true;
		}
		pointMaterial.color.set(tokens.primary);
		lineMaterial.color.set(tokens.primary);
		pointMaterial.opacity = baseAlpha;
		lineMaterial.opacity = baseAlpha;

		// Theme-aware vignette: fade the lattice into the backdrop at the edges.
		if (vignetteRef) {
			const strength = isDark ? 0.5 : 0.28;
			vignetteRef.style.background = `radial-gradient(130% 100% at 50% 42%, transparent 52%, ${hexToRgba(
				tokens.background,
				strength
			)} 100%)`;
		}
	};

	onMount(() => {
		if (typeof window === 'undefined') return;

		const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		const vw = window.innerWidth;
		const vh = window.innerHeight;

		// 1. Renderer + scene
		scene = new THREE.Scene();
		camera = new THREE.PerspectiveCamera(FOV_DEG, vw / vh, 0.1, 250);
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

		// 2. Materials
		glowTexture = makeGlowTexture();

		pointMaterial = new THREE.PointsMaterial({
			color: 0x8b5cf6,
			size: 0.5,
			sizeAttenuation: true,
			map: glowTexture,
			transparent: true,
			vertexColors: true,
			opacity: baseAlpha,
			depthWrite: false
		});

		lineMaterial = new THREE.LineBasicMaterial({
			color: 0x8b5cf6,
			transparent: true,
			vertexColors: true,
			opacity: baseAlpha,
			depthWrite: false
		});

		// A group so the whole lattice can rotate slowly around Z.
		group = new THREE.Group();
		scene.add(group);

		// 3. Grid sized to cover the frustum (+ margin), then theme sync.
		rebuildGrid(vw, vh);
		updateColors();
		themeObserver = createThemeObserver(updateColors);

		// 4. Listeners
		const onResize = () => {
			if (!camera || !renderer) return;
			const w = window.innerWidth;
			const h = window.innerHeight;
			camera.aspect = w / h;
			camera.updateProjectionMatrix();
			renderer.setSize(w, h);
			// Debounced rebuild: fullscreen toggles / window drags must keep
			// the grid covering the new viewport (grid is frustum-derived).
			if (resizeTimer) clearTimeout(resizeTimer);
			resizeTimer = setTimeout(() => {
				if (disposed) return;
				rebuildGrid(w, h);
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
		// Mouse interaction: track the pointer (NDC for parallax) and drop
		// ripples at its position on the lattice plane (raycast to z=0, so
		// they stay under the cursor even while the camera sways).
		const pointerRay = new THREE.Raycaster();
		const latticePlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
		const pointerHit = new THREE.Vector3();
		const onMouseMove = (e: MouseEvent) => {
			if (disposed) return;
			pointerNXTarget = (e.clientX / window.innerWidth) * 2 - 1;
			pointerNYTarget = -(e.clientY / window.innerHeight) * 2 + 1;

			// Throttled ripple emission while the pointer moves.
			const now = performance.now();
			if (now - lastRippleAt >= RIPPLE_MIN_GAP) {
				pointerRay.setFromCamera(new THREE.Vector2(pointerNXTarget, pointerNYTarget), camera);
				if (pointerRay.ray.intersectPlane(latticePlane, pointerHit)) {
					ripples.push({ x: pointerHit.x, y: pointerHit.y, born: now });
					if (ripples.length > MAX_RIPPLES) ripples.shift();
					lastRippleAt = now;
				}
			}
		};
		const onMouseLeave = () => {
			// Ease the parallax back to center; ripples die out on their own.
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

		// 5. Animation loop — budgeted to ~48fps, slow wave displacement,
		// gentle camera sway and a barely-there rotation.
		let lastFrame = performance.now();

		const animate = () => {
			if (disposed || !running) return;
			rafId = requestAnimationFrame(animate);

			const now = performance.now();
			const elapsed = now - lastFrame;
			if (elapsed < FRAME_BUDGET_MS) return; // skip this frame
			lastFrame = now;
			const t = now / 1000;

			const count = gridCols * gridRows;

			// Ease the pointer toward its target (parallax follows smoothly).
			pointerNX += (pointerNXTarget - pointerNX) * MOUSE_EASE;
			pointerNY += (pointerNYTarget - pointerNY) * MOUSE_EASE;

			// Drop ripples that outlived their lifetime.
			if (ripples.length) {
				ripples = ripples.filter((r) => now - r.born < RIPPLE_LIFETIME);
			}
			const rippleCount = ripples.length;

			// Displace the grid with two crossing sine waves + cursor ripples.
			for (let i = 0; i < count; i++) {
				const bx = basePositions[i * 3];
				const by = basePositions[i * 3 + 1];
				const bz = basePositions[i * 3 + 2];
				const p = phases[i];
				let px = bx + Math.sin(t * 0.5 * speed + p) * 0.8;
				let py = by + Math.cos(t * 0.42 * speed + p * 1.3) * 0.8;
				let pz = bz + Math.sin(bx * 0.25 + t * 0.8 * speed + p) * 2.2;

				// Cursor ripples: a traveling z-wave ring from each drop point.
				for (let r = 0; r < rippleCount; r++) {
					const rip = ripples[r];
					const dx = px - rip.x;
					const dy = py - rip.y;
					const dist = Math.sqrt(dx * dx + dy * dy);
					if (dist < RIPPLE_RADIUS) {
						// Phase: the wave crest sits at speed*age, falling to 0.
						const phase = ((now - rip.born) / 1000) * RIPPLE_SPEED - dist;
						if (phase > 0 && phase < RIPPLE_WIDTH) {
							// Falloff with distance + smooth half-sine pulse.
							const env = 1 - dist / RIPPLE_RADIUS;
							const wave = Math.sin((phase / RIPPLE_WIDTH) * Math.PI) * env * env;
							pz += wave * RIPPLE_AMP;
						}
					}
				}

				points[i * 3] = px;
				points[i * 3 + 1] = py;
				points[i * 3 + 2] = pz;
			}
			pointAttr.needsUpdate = true;

			// Lines follow their source points via the precomputed index map.
			for (let v = 0; v < lineIndexMap.length; v++) {
				const src = lineIndexMap[v] * 3;
				const dst = v * 3;
				lines[dst] = points[src];
				lines[dst + 1] = points[src + 1];
				lines[dst + 2] = points[src + 2];
			}
			lineAttr.needsUpdate = true;

			// Slow rotation + gentle sway + depth parallax toward the pointer.
			group.rotation.z = t * 0.02 * speed;
			camera.position.x = Math.sin(t * 0.05) * 2.2 + pointerNX * PARALLAX_X;
			camera.position.y = Math.cos(t * 0.04) * 1.3 + pointerNY * PARALLAX_Y;
			camera.lookAt(0, 0, 0);

			// Debug: expose live interaction state for tuning/verification.
			const dbg = (window as any).__latticeDebug;
			if (dbg) {
				dbg.pointerNX = pointerNX;
				dbg.pointerNY = pointerNY;
				dbg.rippleCount = rippleCount;
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
		if (renderer) {
			renderer.dispose();
			renderer.forceContextLoss();
		}
		if (pointMaterial) pointMaterial.dispose();
		if (lineMaterial) lineMaterial.dispose();
		if (glowTexture) glowTexture.dispose();
		if (pointGeo) pointGeo.dispose();
		if (lineGeo) lineGeo.dispose();
	});
</script>

<div bind:this={container} class="lattice-bg" aria-hidden="true"></div>
<div bind:this={vignetteRef} class="lattice-vignette" aria-hidden="true"></div>

<!--
	Hidden element resolving the active theme's tokens:
	--p  -> color            (dots + lines)
	--s  -> secondary
	--b1 -> background-color (backdrop + vignette)
-->
<div
	bind:this={colorRef}
	style="display: none; color: oklch(var(--p)); background-color: oklch(var(--b1)); --ref-secondary: oklch(var(--s));"
></div>

<style>
	.lattice-bg {
		position: fixed;
		inset: 0;
		width: 100%;
		height: 100vh;
		z-index: -2;
		overflow: hidden;
		pointer-events: none;
	}

	/* Soft edge vignette sits above the canvas, below all content. */
	.lattice-vignette {
		position: fixed;
		inset: 0;
		z-index: -1;
		pointer-events: none;
		transition: background 0.6s ease;
	}
</style>
