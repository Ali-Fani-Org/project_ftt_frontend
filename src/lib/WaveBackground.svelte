<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import * as THREE from 'three';

	// Component Props
	export let speed = 0.02; // Adjusted speed scale for Shader time
	export let waveHeight = 1.3;
	export let density = 50;

	// Elements
	let canvasContainer: HTMLDivElement;
	let colorReference: HTMLDivElement; // Hidden element to grab CSS variables
	let animationId: number;

	// Three.js instances
	let renderer: THREE.WebGLRenderer;
	let scene: THREE.Scene;
	let camera: THREE.PerspectiveCamera;
	let particles: THREE.Points;
	let material: THREE.PointsMaterial;
	let themeObserver: MutationObserver;

	// Color Helper
	let canvasCtx: CanvasRenderingContext2D;

	// Uniforms object shared with the Shader
	const uniforms = {
		uTime: { value: 0 },
		uWaveHeight: { value: waveHeight }
	};

	// ----------------------
	// Color Logic
	// ----------------------
	// Helper to convert CSS colors (oklch, var, etc) to valid Hex/RGB for Three.js
	const getResolvedColor = (cssColor: string) => {
		if (!canvasCtx) {
			const canvas = document.createElement('canvas');
			canvas.width = 1;
			canvas.height = 1;
			canvasCtx = canvas.getContext('2d', { willReadFrequently: true })!;
		}

		// Paint the color then read the actual pixel to get an RGB hex value.
		canvasCtx.clearRect(0, 0, 1, 1);
		canvasCtx.fillStyle = cssColor;
		canvasCtx.fillRect(0, 0, 1, 1);
		const [r, g, b, a] = canvasCtx.getImageData(0, 0, 1, 1).data;

		// If alpha is zero, treat as transparent black to avoid NaN conversions.
		const toHex = (value: number) => value.toString(16).padStart(2, '0');
		return `#${toHex(r)}${toHex(g)}${toHex(b)}${a === 255 ? '' : toHex(a)}`;
	};

	const updateColors = () => {
		if (!scene || !material || !colorReference) return;

		const computed = getComputedStyle(colorReference);

		// 1. Get Background Color (maps to --b1)
		const bgCSS = computed.getPropertyValue('background-color');
		const bgHex = getResolvedColor(bgCSS);

		if (scene.background instanceof THREE.Color) {
			scene.background.set(bgHex);
		} else {
			scene.background = new THREE.Color(bgHex);
		}

		// 2. Get Primary Color (maps to --p)
		const dotCSS = computed.color;
		const dotHex = getResolvedColor(dotCSS);
		material.color.set(dotHex);
	};

	onMount(() => {
		if (typeof window === 'undefined') return;

		// 1. Setup Scene
		scene = new THREE.Scene();
		camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
		camera.position.set(0, 10, 24);
		camera.lookAt(0, 0, 0);

		renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
		renderer.setSize(window.innerWidth, window.innerHeight);
		// Allow full device pixel ratio (no cap) to avoid implicit FPS limits.
		renderer.setPixelRatio(window.devicePixelRatio);

		canvasContainer.appendChild(renderer.domElement);

		// 2. Generate Static Geometry (Done once)
		const geometry = new THREE.BufferGeometry();
		const positions: number[] = [];
		const separation = 1.4;
		const totalWidth = density * separation;
		const totalDepth = density * separation;

		for (let x = 0; x < density; x++) {
			for (let z = 0; z < density; z++) {
				// We only set X and Z. Y is calculated on the GPU.
				positions.push(x * separation - totalWidth / 2, 0, z * separation - totalDepth / 2);
			}
		}
		geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));

		// 3. Material with Shader Injection
		// We use onBeforeCompile to keep PointsMaterial features (size attenuation)
		// but inject our own wave logic.
		material = new THREE.PointsMaterial({
			color: 0xffffff,
			size: 0.15,
			sizeAttenuation: true
		});

		material.onBeforeCompile = (shader) => {
			shader.uniforms.uTime = uniforms.uTime;
			shader.uniforms.uWaveHeight = uniforms.uWaveHeight;

			// Inject code into the vertex shader header
			shader.vertexShader =
				`
				uniform float uTime;
				uniform float uWaveHeight;
			` + shader.vertexShader;

			// Replace the standard position calculation with our wave logic
			shader.vertexShader = shader.vertexShader.replace(
				'#include <begin_vertex>',
				`
				vec3 transformed = vec3( position );
				// GPU Math: sin(x) + sin(z)
				transformed.y = sin(position.x * 0.25 + uTime) * uWaveHeight + sin(position.z * 0.25 + uTime) * uWaveHeight;
				`
			);
		};

		particles = new THREE.Points(geometry, material);
		scene.add(particles);

		// Initial Color Sync
		updateColors();

		// 4. Mutation Observer for Theme Changes
		themeObserver = new MutationObserver(updateColors);
		themeObserver.observe(document.documentElement, {
			attributes: true,
			attributeFilter: ['data-theme']
		});

		// 5. Animation Loop
		const animate = () => {
			animationId = requestAnimationFrame(animate);

			// Only update the time uniform. No heavy JS math here.
			uniforms.uTime.value += speed;

			renderer.render(scene, camera);
		};
		animate();

		// 6. Resize Handler
		const handleResize = () => {
			if (!camera || !renderer) return;
			camera.aspect = window.innerWidth / window.innerHeight;
			camera.updateProjectionMatrix();
			renderer.setSize(window.innerWidth, window.innerHeight);
		};
		window.addEventListener('resize', handleResize);

		return () => {
			window.removeEventListener('resize', handleResize);
		};
	});

	onDestroy(() => {
		if (typeof window === 'undefined') return;
		cancelAnimationFrame(animationId);
		themeObserver?.disconnect();

		// Clean up Three.js resources to prevent memory leaks
		if (renderer) {
			renderer.dispose();
			renderer.forceContextLoss();
		}
		if (material) material.dispose();
		if (particles && particles.geometry) particles.geometry.dispose();
	});

	// Reactive updates if props change
	$: if (uniforms) uniforms.uWaveHeight.value = waveHeight;
</script>

<div bind:this={canvasContainer} class="wave-bg" aria-hidden="true"></div>

<!-- 
	Hidden element to resolve DaisyUI colors via CSS.
	We map --p (primary) to color and --b1 (base-100) to background-color.
	We use oklch explicitly here to ensure we capture the variables correctly.
-->
<div
	bind:this={colorReference}
	style="display: none; color: oklch(var(--p)); background-color: oklch(var(--b1));"
></div>

<style>
	.wave-bg {
		position: fixed;
		inset: 0;
		width: 100%;
		height: 100vh;
		z-index: -2;
		overflow: hidden;
		pointer-events: none;
	}

	.wave-bg::after {
		content: '';
		position: absolute;
		inset: 0;
		background: radial-gradient(
				120% 70% at 50% 35%,
				color-mix(in oklch, oklch(var(--b1)) 85%, transparent) 0%,
				transparent 55%
			),
			linear-gradient(
				to top,
				color-mix(in oklch, oklch(var(--b1)) 75%, transparent) 0%,
				transparent 40%
			);
		pointer-events: none;
	}
</style>
