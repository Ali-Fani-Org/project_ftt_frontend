<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import {
		Chart,
		ArcElement,
		Tooltip,
		Legend,
		DoughnutController
	} from 'chart.js';

	Chart.register(
		ArcElement,
		Tooltip,
		Legend,
		DoughnutController
	);

	let { tagsData } = $props<{
		tagsData: { name: string; totalSeconds: number; count: number }[];
	}>();

	let canvas = $state<HTMLCanvasElement>();
	let chart: Chart | null = null;

	// Get theme colors from CSS
	function getThemeColors() {
		if (typeof document === 'undefined') {
			return { primary: 'rgb(59, 130, 246)', primaryRgb: '59, 130, 246' };
		}
		
		// Use a temp element with bg-primary class to get computed color
		const tempEl = document.createElement('div');
		tempEl.className = 'bg-primary';
		tempEl.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none;';
		document.body.appendChild(tempEl);
		
		// Get the computed background color - this may be in oklch, rgb, or other formats
		const computedColor = getComputedStyle(tempEl).backgroundColor;
		document.body.removeChild(tempEl);
		
		// Convert any color format to RGB using canvas
		let primaryRgb = '59, 130, 246'; // fallback
		try {
			const canvas = document.createElement('canvas');
			canvas.width = canvas.height = 1;
			const ctx = canvas.getContext('2d');
			if (ctx) {
				ctx.fillStyle = computedColor;
				ctx.fillRect(0, 0, 1, 1);
				const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
				primaryRgb = `${r}, ${g}, ${b}`;
			}
		} catch {
			// Fallback already set
		}
		
		return {
			primary: `rgb(${primaryRgb})`,
			primaryRgb
		};
	}

	// Create gradient colors based on theme
	function getBackgroundColors(ctx: CanvasRenderingContext2D, count: number) {
		const { primaryRgb } = getThemeColors();
		const colors = [];
		
		// Generate variations of the primary color for the doughnut
		for (let i = 0; i < count; i++) {
			// Create variations by adjusting lightness/opacity
			const opacity = 0.5 + (0.5 * (i / (count - 1 || 1)));
			colors.push(`rgba(${primaryRgb}, ${opacity})`);
		}
		
		return colors;
	}

	function renderChart() {
		if (!canvas) return;

		if (chart) {
			chart.destroy();
		}

		// Filter out tags with no time and limit to top 10
		const data = tagsData.filter((t: any) => t.totalSeconds > 0).slice(0, 10);
		
		if (data.length === 0) return;

		// Get gradient colors based on theme
		const ctx = canvas.getContext('2d');
		const colors = ctx ? getBackgroundColors(ctx, data.length) : ['rgba(59, 130, 246, 0.8)'];

		chart = new Chart(canvas, {
			type: 'doughnut',
			data: {
				labels: data.map((t: any) => t.name),
				datasets: [
					{
						data: data.map((t: any) => (t.totalSeconds / 3600).toFixed(2)),
						backgroundColor: colors,
						borderWidth: 0
					}
				]
			},
			options: {
				responsive: true,
				maintainAspectRatio: false,
				plugins: {
					legend: {
						position: 'right' as const,
						labels: {
							boxWidth: 12,
							usePointStyle: true,
						}
					},
					tooltip: {
						callbacks: {
							label: function (context: any) {
								let label = context.label || '';
								if (label) {
									label += ': ';
								}
								if (context.parsed !== null) {
									const val = Number(context.parsed);
									const hours = Math.floor(val);
									const mins = Math.round((val - hours) * 60);
									label += `${hours}h ${mins}m`;
								}
								return label;
							}
						}
					}
				},
				cutout: '65%'
			}
		});
	}

	$effect(() => {
		tagsData;
		// Force re-render on theme change
		if (typeof document !== 'undefined') {
			document.documentElement.getAttribute('data-theme');
		}
		if (canvas) {
			renderChart();
		}
	});

	onMount(() => {
		renderChart();
	});

	onDestroy(() => {
		if (chart) {
			chart.destroy();
		}
	});
</script>

<div class="w-full h-64 flex items-center justify-center">
	{#if tagsData.length === 0 || tagsData.every((t: any) => t.totalSeconds === 0)}
		<div class="text-base-content/50 italic text-sm">No tag data available for this period.</div>
	{:else}
		<canvas bind:this={canvas}></canvas>
	{/if}
</div>
