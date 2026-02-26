<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import {
		Chart,
		LineElement,
		PointElement,
		LineController,
		BarController,
		CategoryScale,
		LinearScale,
		Title,
		Tooltip,
		Legend,
		Filler
	} from 'chart.js';

	Chart.register(
		LineElement,
		PointElement,
		LineController,
		BarController,
		CategoryScale,
		LinearScale,
		Title,
		Tooltip,
		Legend,
		Filler
	);

	let { entries, dateRange } = $props<{
		entries: any[];
		dateRange: { start: string | null; end: string | null };
	}>();

	let canvas: HTMLCanvasElement;
	let chart: Chart | null = null;
	let chartType = $state<'bar' | 'line'>('bar');

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
			primaryBg: `rgba(${primaryRgb}, 0.15)`,
			grid: 'rgba(128, 128, 128, 0.1)',
			text: 'rgb(128, 128, 128)',
			primaryRgb
		};
	}

	// Function to aggregate data by date
	function getAggregatedData() {
		const dailyTotals = new Map<string, number>();

		// Helper to format date as YYYY-MM-DD using local time
		const formatDate = (date: Date) => {
			const year = date.getFullYear();
			const month = String(date.getMonth() + 1).padStart(2, '0');
			const day = String(date.getDate()).padStart(2, '0');
			return `${year}-${month}-${day}`;
		};

		// Determine date range
		let start = dateRange.start ? new Date(dateRange.start + 'T00:00:00') : new Date();
		let end = dateRange.end ? new Date(dateRange.end + 'T23:59:59') : new Date();

		// If no start date, default to oldest entry or 30 days ago
		if (!dateRange.start && entries.length > 0) {
			const oldest = entries.reduce((min: Date, e: any) => {
				const d = new Date(e.start_time);
				return d < min ? d : min;
			}, new Date());
			start = oldest;
		} else if (!dateRange.start) {
			start.setDate(end.getDate() - 30);
		}

		// Initialize all dates in range with 0 (including empty days)
		let current = new Date(start);
		current.setHours(0, 0, 0, 0);
		let endMidnight = new Date(end);
		endMidnight.setHours(0, 0, 0, 0);
		
		while (current <= endMidnight) {
			dailyTotals.set(formatDate(current), 0);
			current.setDate(current.getDate() + 1);
		}

		// Aggregate entry durations - only use entries within the date range
		for (const entry of entries) {
			const date = new Date(entry.start_time);
			const dateStr = formatDate(date);

			// Check if entry is within the requested date range
			if (dateRange.start && date < new Date(dateRange.start + 'T00:00:00')) continue;
			if (dateRange.end && date > new Date(dateRange.end + 'T23:59:59')) continue;

			let durationHours = 0;
			if (entry.duration) {
				durationHours = (parseInt(entry.duration, 10) || 0) / 3600;
			} else if (entry.is_active) {
				durationHours = (Date.now() - new Date(entry.start_time).getTime()) / 1000 / 3600;
			}

			dailyTotals.set(dateStr, (dailyTotals.get(dateStr) || 0) + durationHours);
		}

		// Sort by date
		const sortedEntries = Array.from(dailyTotals.entries()).sort((a, b) => a[0].localeCompare(b[0]));
		
		return {
			labels: sortedEntries.map(([date]) => new Date(date + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })),
			data: sortedEntries.map(([, total]) => total)
		};
	}

	function renderChart() {
		if (!canvas) return;

		if (chart) {
			chart.destroy();
		}

		const { labels, data } = getAggregatedData();
		const colors = getThemeColors();
		const isLine = chartType === 'line';
		
		chart = new Chart(canvas, {
			type: isLine ? 'line' : 'bar',
			data: {
				labels,
				datasets: [
					{
						label: 'Hours Tracked',
						data: data,
						fill: isLine ? true : false,
						backgroundColor: isLine ? colors.primaryBg : colors.primary,
						borderColor: colors.primary,
						borderWidth: 1,
						borderRadius: isLine ? 0 : 4,
						borderSkipped: false,
						tension: 0.3,
						pointRadius: isLine ? 2 : 0,
						pointHoverRadius: 5
					}
				]
			},
			options: {
				responsive: true,
				maintainAspectRatio: false,
				plugins: {
					legend: {
						display: false
					},
					tooltip: {
						callbacks: {
							label: function (context: any) {
								let label = context.dataset.label || '';
								if (label) {
									label += ': ';
								}
								if (context.parsed.y !== null) {
									const hours = Math.floor(context.parsed.y);
									const mins = Math.round((context.parsed.y - hours) * 60);
									label += `${hours}h ${mins}m`;
								}
								return label;
							}
						}
					}
				},
				scales: {
					y: {
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
					x: {
						grid: {
							display: false
						},
						ticks: {
							color: colors.text,
							maxTicksLimit: 10
						}
					}
				},
				interaction: {
					mode: 'nearest' as const,
					axis: 'x' as const,
					intersect: false
				}
			}
		});
	}

	// Watch for entries or dateRange changes and re-render
	$effect(() => {
		// Just referencing these will trigger effect on change
		entries;
		dateRange;
		chartType;
		// Force re-render on theme change by accessing the computed style
		if (typeof document !== 'undefined') {
			document.body.className; // Force dependency
		}
		if (canvas) {
			// Destroy and recreate to ensure fresh colors
			if (chart) {
				chart.destroy();
				chart = null;
			}
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

<div class="w-full">
	<div class="flex justify-end mb-2">
		<div class="join join-xs">
			<button class="btn btn-xs {chartType === 'bar' ? 'btn-primary' : 'btn-ghost'}" onclick={() => chartType = 'bar'}>Bar</button>
			<button class="btn btn-xs {chartType === 'line' ? 'btn-primary' : 'btn-ghost'}" onclick={() => chartType = 'line'}>Line</button>
		</div>
	</div>
	<div class="h-64">
		<canvas bind:this={canvas}></canvas>
	</div>
</div>
