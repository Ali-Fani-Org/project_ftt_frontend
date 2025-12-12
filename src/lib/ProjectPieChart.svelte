<script lang="ts">
  import { onMount } from 'svelte';
  import { timeEntries, projects, type TimeEntry, type Project } from '$lib/api';

  interface ProjectTimeData {
    projectName: string;
    seconds: number;
    percentage: number;
    color: string;
  }

  let projectData = $state<ProjectTimeData[]>([]);
  let loading = $state(true);
  let error = $state('');
  let totalSeconds = $state(0);
  let hoveredSlice = $state<number | null>(null);

  // Simple, reliable color palette using DaisyUI theme variables
  function getColors(): string[] {
    return [
      'hsl(var(--p))',     // primary
      'hsl(var(--s))',     // secondary
      'hsl(var(--a))',     // accent
      'hsl(var(--in))',    // info
      'hsl(var(--su))',    // success
      'hsl(var(--wa))',    // warning
      'hsl(var(--er))',    // error
      'hsl(var(--nf))',    // neutral-focus
      'hsl(var(--b2))',    // base-200
      'hsl(var(--b3))',    // base-300
    ];
  }

  onMount(async () => {
    await loadProjectTimeData();
  });

  async function loadProjectTimeData() {
    try {
      loading = true;
      error = '';

      // Get time entries from the last 30 days for a good sample
      const today = new Date();
      const thirtyDaysAgo = new Date(today);
      thirtyDaysAgo.setDate(today.getDate() - 30);

      const startDate = thirtyDaysAgo.toISOString().split('T')[0];
      const endDate = today.toISOString().split('T')[0];

      const [entriesResponse, projectsList] = await Promise.all([
        timeEntries.listWithFilters({
          start_date_after: startDate,
          start_date_before: endDate,
          limit: 500 // Get enough entries for meaningful data
        }),
        projects.list()
      ]);

      // Calculate time per project
      const projectTimeMap = new Map<string, number>();
      let total = 0;

      for (const entry of entriesResponse.results) {
        let seconds = 0;

        if (entry.duration) {
          // Duration is now in seconds as string (e.g., "8.0", "127172.0")
          seconds = parseInt(entry.duration, 10) || 0;
        } else if (entry.end_time) {
          // Calculate from start and end time
          const startTime = new Date(entry.start_time).getTime();
          const endTime = new Date(entry.end_time).getTime();
          seconds = Math.max(0, Math.floor((endTime - startTime) / 1000));
        } else if (entry.is_active) {
          // For active entries, calculate from start time to now
          const startTime = new Date(entry.start_time).getTime();
          seconds = Math.floor((Date.now() - startTime) / 1000);
        } else {
          // Fallback: give small nominal value
          seconds = 5 * 60;
        }

        const projectName = entry.project || 'Unknown';
        projectTimeMap.set(projectName, (projectTimeMap.get(projectName) || 0) + seconds);
        total += seconds;
      }

      // Convert to array and calculate percentages
      const colors = getColors();
      const data: ProjectTimeData[] = Array.from(projectTimeMap.entries())
        .map(([projectName, seconds], index) => ({
          projectName,
          seconds,
          percentage: total > 0 ? Math.round((seconds / total) * 100) : 0,
          color: colors[index % colors.length]
        }))
        .sort((a, b) => b.seconds - a.seconds) // Sort by time spent (descending)
        .slice(0, 5); // Show top 5 projects

      totalSeconds = total;
      projectData = data;
      loading = false;
    } catch (err) {
      console.error('Failed to load project time data:', err);
      error = 'Failed to load project data';
      loading = false;
    }
  }

  function formatDuration(seconds: number): string {
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

  function getPieSlicePath(data: ProjectTimeData[], index: number, total: number): string {
    let startAngle = 0;

    // Calculate start angle for this slice
    for (let i = 0; i < index; i++) {
      startAngle += (data[i].seconds / total) * 360;
    }

    const percentage = data[index].seconds / total;
    const endAngle = startAngle + (percentage * 360);

    // Convert to radians
    const startRad = (startAngle * Math.PI) / 180;
    const endRad = (endAngle * Math.PI) / 180;

    // Pie chart center and radius
    const centerX = 120;
    const centerY = 120;
    const radius = 80;

    // Calculate points
    const x1 = centerX + radius * Math.cos(startRad);
    const y1 = centerY + radius * Math.sin(startRad);
    const x2 = centerX + radius * Math.cos(endRad);
    const y2 = centerY + radius * Math.sin(endRad);

    // Create SVG path
    const largeArcFlag = endAngle - startAngle > 180 ? 1 : 0;

    if (percentage < 0.01) {
      // Very small slice, just show a line
      return `M ${centerX} ${centerY} L ${x1} ${y1}`;
    }

    return `M ${centerX} ${centerY} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${x2} ${y2} Z`;
  }
</script>

<div class="card bg-base-100 shadow-sm">
  <div class="card-body p-4">
    <h2 class="card-title text-sm mb-4 flex items-center">
      <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z"></path>
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z"></path>
      </svg>
      Project Time Distribution
    </h2>

    {#if loading}
      <div class="flex justify-center items-center h-32">
        <span class="loading loading-spinner loading-sm"></span>
      </div>
    {:else if error}
      <div class="alert alert-error alert-sm">
        <span class="text-xs">{error}</span>
      </div>
    {:else if projectData.length === 0}
      <div class="text-center py-8 text-base-content/50">
        <svg class="w-12 h-12 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path>
        </svg>
        <p class="text-xs">No project data available</p>
      </div>
    {:else}
      <div class="flex justify-center">
        <div class="relative">
          <!-- Pie Chart -->
          <svg width="240" height="240" viewBox="0 0 240 240" class="transform -rotate-90">
            {#each projectData as data, index}
              <g
                onmouseenter={() => hoveredSlice = index}
                onmouseleave={() => hoveredSlice = null}
                class="cursor-pointer"
              >
                <path
                  d={getPieSlicePath(projectData, index, totalSeconds)}
                  fill={data.color}
                  stroke="hsl(var(--bc))"
                  stroke-width="3"
                  class="hover:opacity-80 transition-opacity"
                />
              </g>
            {/each}
          </svg>

          <!-- Tooltip -->
          {#if hoveredSlice !== null}
            {@const data = projectData[hoveredSlice]}
            <div class="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-full -mt-8 bg-base-100 border border-base-300 rounded-lg shadow-lg p-3 z-50 pointer-events-none">
              <div class="text-center whitespace-nowrap transform rotate-90">
                <div class="font-medium text-sm">{data.projectName}</div>
                <div class="text-xs text-base-content/70">
                  {data.percentage >= 1 ? `${data.percentage}%` : '<1%'}
                </div>
                <div class="text-xs text-base-content/60">
                  {formatDuration(data.seconds)}
                </div>
              </div>
            </div>
          {/if}
        </div>
      </div>

      <!-- Legend -->
      <div class="mt-4 flex flex-wrap justify-center gap-2">
        {#each projectData as data}
          <div class="flex items-center space-x-1 text-xs">
            <div
              class="w-3 h-3 rounded-full"
              style="background-color: {data.color}"
            ></div>
            <span class="truncate max-w-20">{data.projectName}</span>
          </div>
        {/each}
      </div>

      {#if totalSeconds > 0}
        <div class="mt-2 text-center text-xs text-base-content/60">
          Total: {formatDuration(totalSeconds)}
        </div>
      {/if}
    {/if}
  </div>
</div>
