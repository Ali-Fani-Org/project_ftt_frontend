<script>
  import { onMount, onDestroy } from 'svelte';
  import * as THREE from 'three';

  // Props to override defaults if needed
  export let speed = 0.02;     // Lower = Slower animation
  export let waveHeight = 1.2; // Height of the peaks
  export let density = 50;     // Number of rows/cols (higher = more CPU usage)

  let canvasContainer;
  let animationId;
  let renderer, scene, camera, particles;
  let themeObserver;

  // --- Helper: Parse DaisyUI CSS Variables ---
  // DaisyUI 4 uses oklch() values which Three.js cannot read directly.
  // We use a temp element to let the browser compute the final RGB value for us.
  const getThemeColor = (variableName, fallbackHex) => {
    if (typeof window === 'undefined') return fallbackHex;
    
    const style = getComputedStyle(document.body);
    const val = style.getPropertyValue(variableName).trim();
    
    if (!val) return fallbackHex;

    // Create invisible temp element to compute the color
    const temp = document.createElement('div');
    temp.style.color = `oklch(${val})`; 
    // Handle cases where variable might already be hex/rgb
    if (val.startsWith('#') || val.startsWith('rgb')) temp.style.color = val; 
    
    document.body.appendChild(temp);
    const computedColor = getComputedStyle(temp).color; // returns "rgb(x, x, x)"
    document.body.removeChild(temp);
    
    return new THREE.Color(computedColor).getHex();
  };

  const updateColors = () => {
    if (!scene || !particles) return;
    
    const bgColor = getThemeColor('--b1', 0x000000); // base-100
    const dotColor = getThemeColor('--p', 0x33b5e5); // primary

    scene.background.setHex(bgColor);
    particles.material.color.setHex(dotColor);
  };

  onMount(() => {
    // 1. Scene Setup
    scene = new THREE.Scene();
    // Camera config: 75 FOV, Aspect Ratio, Near clip, Far clip
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    // Move camera back and up to see the wave
    camera.position.set(0, 10, 24); 
    camera.lookAt(0, 0, 0);

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // Limit pixel ratio for performance
    canvasContainer.appendChild(renderer.domElement);

    // 2. Generate Particles
    const geometry = new THREE.BufferGeometry();
    const positions = [];
    const separation = 1.4;
    const totalWidth = density * separation;
    const totalDepth = density * separation;

    for (let x = 0; x < density; x++) {
      for (let z = 0; z < density; z++) {
        const posX = (x * separation) - (totalWidth / 2);
        const posZ = (z * separation) - (totalDepth / 2);
        const posY = 0; 
        positions.push(posX, posY, posZ);
      }
    }

    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));

    const material = new THREE.PointsMaterial({
      color: 0xffffff, // Will be overridden by updateColors()
      size: 0.15,      // Size of the dots
      sizeAttenuation: true
    });

    particles = new THREE.Points(geometry, material);
    scene.add(particles);

    // 3. Initial Color Set
    updateColors();

    // 4. Watch for DaisyUI Theme Changes
    // DaisyUI usually toggles data-theme on the <html> tag
    themeObserver = new MutationObserver(updateColors);
    themeObserver.observe(document.documentElement, { 
      attributes: true, 
      attributeFilter: ['data-theme'] 
    });

    // 5. Animation Loop
    let time = 0;
    const animate = () => {
      animationId = requestAnimationFrame(animate);
      time += speed;

      const positions = particles.geometry.attributes.position.array;
      let i = 0;
      
      // Update Y positions based on Sine waves
      for (let x = 0; x < density; x++) {
        for (let z = 0; z < density; z++) {
          // The math behind the wave shape
          const y = (Math.sin((x * 0.25) + time) * waveHeight) + 
                    (Math.sin((z * 0.25) + time) * waveHeight);
          
          // positions[i+1] is the Y coordinate
          positions[i + 1] = y; 
          i += 3;
        }
      }
      
      particles.geometry.attributes.position.needsUpdate = true;
      renderer.render(scene, camera);
    };
    animate();

    // 6. Handle Resize
    const handleResize = () => {
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
    if (typeof window !== 'undefined') {
        cancelAnimationFrame(animationId);
        if (themeObserver) themeObserver.disconnect();
        if (renderer) renderer.dispose();
        if (scene) scene.clear();
    }
  });
</script>

<div bind:this={canvasContainer} class="wave-bg"></div>

<style>
  .wave-bg {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100vh;
    z-index: -1; /* Puts it behind your app content */
    overflow: hidden;
    pointer-events: none; /* Allows clicks to pass through to your app */
  }
</style>