<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import {
		Chart,
		BarElement,
		BarController,
		CategoryScale,
		LinearScale,
		Tooltip
	} from 'chart.js';

	Chart.register(
		BarElement,
		BarController,
		CategoryScale,
		LinearScale,
		Tooltip
	);

	let { entries } = $props<{
		entries: any[];
	}>();

	let canvas: HTMLCanvasElement;
	let chart: Chart | null = null;

	// Get theme colors from CSS - works with both built-in and custom themes
	function getThemeColors() {
		if (typeof document === 'undefined') {
			return { primary: 'rgb(59, 130, 246)', primaryBg: 'rgba(59, 130, 246, 0.2)', grid: 'rgba(128, 128, 128, 0.1)', text: 'rgb(128, 128, 128)', primaryRgb: '59, 130, 246' };
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
			primaryBg: `rgba(${primaryRgb}, 0.2)`,
			grid: 'rgba(128, 128, 128, 0.1)',
			text: 'rgb(128, 128, 128)',
			primaryRgb
		};
	}

	// Create gradient for bars using RGB values
	function createGradient(ctx: CanvasRenderingContext2D, primaryRgb: string) {
		const gradient = ctx.createLinearGradient(0, 0, ctx.canvas.width, 0);
		gradient.addColorStop(0, `rgba(${primaryRgb}, 0.7)`);
		gradient.addColorStop(1, `rgb(${primaryRgb})`);
		return gradient;
	}

	function getAggregatedData() {
		// Aggregate time by task title
		const titleTotals = new Map<string, number>();

		for (const entry of entries) {
			const title = entry.title || 'Untitled Task';
			let durationHours = 0;

			if (entry.duration) {
				durationHours = (parseInt(entry.duration, 10) || 0) / 3600;
			} else if (entry.is_active) {
				durationHours = (Date.now() - new Date(entry.start_time).getTime()) / 1000 / 3600;
			}

			if (durationHours > 0) {
				titleTotals.set(title, (titleTotals.get(title) || 0) + durationHours);
			}
		}

		// Sort and get top 5
		const sorted = Array.from(titleTotals.entries())
			.sort((a, b) => b[1] - a[1])
			.slice(0, 5);

		// Truncate long titles
		const maxTitleLength = 25;
		const labels = sorted.map(s => s[0].length > maxTitleLength ? s[0].substring(0, maxTitleLength) + '...' : s[0]);

		return {
			labels,
			data: sorted.map(s => s[1])
		};
	}

	function renderChart() {
		if (!canvas) return;

		if (chart) {
			chart.destroy();
		}

		const { labels, data } = getAggregatedData();
		
		if (labels.length === 0) return;

		const colors = getThemeColors();
		
		// Create gradient using canvas context
		const ctx = canvas.getContext('2d');
		const gradient = ctx ? createGradient(ctx, colors.primaryRgb) : colors.primary;

		chart = new Chart(canvas, {
			type: 'bar',
			data: {
				labels,
				datasets: [
					{
						label: 'Hours Tracked',
						data: data,
						backgroundColor: gradient,
						borderWidth: 0,
						borderRadius: 4
					}
				]
			},
			options: {
				indexAxis: 'y' as const,
				responsive: true,
				maintainAspectRatio: false,
				plugins: {
					legend: {
						display: false
					},
					tooltip: {
						callbacks: {
							label: function (context: any) {
								if (context.parsed.x !== null) {
									const hours = Math.floor(context.parsed.x);
									const mins = Math.round((context.parsed.x - hours) * 60);
									return `${hours}h ${mins}m`;
								}
								return '';
							}
						}
					}
				},
				scales: {
					x: {
						beginAtZero: true,
						title: {
							display: true,
							text: 'Hours',
							color: colors.text
						},
						grid: {
							color: colors.grid
						},
						ticks: {
							color: colors.text
						}
					},
					y: {
						grid: {
							display: false
						},
						ticks: {
							color: colors.text,
							autoSkip: false
						}
					}
				}
			}
		});
	}

	$effect(() => {
		entries;
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

<div class="w-full h-64">
	{#if getAggregatedData().labels.length === 0}
		<div class="h-full flex items-center justify-center text-base-content/50 italic text-sm">
			No tasks found for this period.
		</div>
	{:else}
		<canvas bind:this={canvas}></canvas>
	{/if}
</div>
