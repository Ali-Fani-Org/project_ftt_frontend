<script lang="ts">
	import type { TimeEntry } from '$lib/api';

	interface Props {
		entries: TimeEntry[];
	}

	let { entries }: Props = $props();

	interface ProjectData {
		name: string;
		totalSeconds: number;
		formattedDuration: string;
		percentage: number;
	}

	const projectsData = $derived.by(() => {
		if (!entries || entries.length === 0) return [];

		// Group entries by project and sum durations
		const projectMap = new Map<string, number>();

		for (const entry of entries) {
			const projectName = entry.project || 'No Project';
			let durationSeconds = 0;

			if (entry.duration) {
				durationSeconds = parseInt(entry.duration, 10) || 0;
			} else if (entry.is_active) {
				// For active entries, calculate from start time to now
				const startTime = new Date(entry.start_time).getTime();
				durationSeconds = Math.floor((Date.now() - startTime) / 1000);
			}

			const current = projectMap.get(projectName) || 0;
			projectMap.set(projectName, current + durationSeconds);
		}

		// Convert to array and calculate percentages
		const totalSeconds = Array.from(projectMap.values()).reduce((a, b) => a + b, 0);
		const projects: ProjectData[] = [];

		for (const [name, seconds] of projectMap.entries()) {
			projects.push({
				name,
				totalSeconds: seconds,
				formattedDuration: formatDuration(seconds),
				percentage: totalSeconds > 0 ? (seconds / totalSeconds) * 100 : 0
			});
		}

		// Sort by duration descending
		return projects.sort((a, b) => b.totalSeconds - a.totalSeconds);
	});

	const maxSeconds = $derived(
		projectsData.length > 0 ? Math.max(...projectsData.map((p) => p.totalSeconds)) : 0
	);

	function formatDuration(seconds: number): string {
		if (isNaN(seconds) || seconds < 0) return '0m';

		const hours = Math.floor(seconds / 3600);
		const minutes = Math.floor((seconds % 3600) / 60);

		if (hours === 0) {
			return `${minutes}m`;
		} else if (minutes === 0) {
			return `${hours}h`;
		} else {
			return `${hours}h ${minutes}m`;
		}
	}

	function getBarWidth(seconds: number): number {
		if (maxSeconds <= 0 || seconds <= 0) return 0;
		return (seconds / maxSeconds) * 100;
	}

	// Color palette for projects
	const colors = [
		'bg-primary',
		'bg-secondary',
		'bg-accent',
		'bg-info',
		'bg-success',
		'bg-warning',
		'bg-error'
	];

	function getColor(index: number): string {
		return colors[index % colors.length];
	}
</script>

<div class="card bg-base-100 shadow-lg h-full">
	<div class="card-body p-4">
		<h3 class="card-title text-sm font-normal text-base-content/70 mb-2">
			<svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
				></path>
			</svg>
			Projects Today
		</h3>

		{#if projectsData.length === 0}
			<div class="text-center py-4 text-base-content/50">
				<svg class="w-8 h-8 mx-auto mb-2 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
					></path>
				</svg>
				<p class="text-xs">No projects tracked today</p>
			</div>
		{:else}
			<div class="space-y-2 max-h-40 overflow-y-auto">
				{#each projectsData as project, index}
					<div class="flex flex-col gap-1">
						<div class="flex justify-between items-center text-xs">
							<span class="font-medium truncate max-w-[60%]" title={project.name}>
								{project.name}
							</span>
							<span class="text-base-content/60 font-mono">
								{project.formattedDuration}
							</span>
						</div>
						<div class="w-full bg-base-200 rounded-full h-2 overflow-hidden">
							<div
								class="{getColor(index)} h-full rounded-full transition-all duration-500 ease-out"
								style="width: {getBarWidth(project.totalSeconds)}%"
							></div>
						</div>
					</div>
				{/each}
			</div>
		{/if}
	</div>
</div>
