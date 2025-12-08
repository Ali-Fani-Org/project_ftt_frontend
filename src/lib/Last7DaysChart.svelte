<script lang="ts">
  import { onMount } from 'svelte';
  import { timeEntries, type TimeEntry } from '$lib/api';

  // Chart data structure
  interface DayData {
    date: string;
    label: string;
    totalSeconds: number;
    formattedDuration: string;
    segments: number[]; // 8 segments for different times of day
    maxSegmentSeconds: number; // max seconds in any segment for this day
  }

  let chartData = $state<DayData[]>([]);
  let loading = $state(true);
  let error = $state('');

  // Toggle this to true to preview the component with static sample data instead of
  // hitting the API. Useful while designing styles.
  const USE_SAMPLE_DATA = false;

  onMount(async () => {
    if (USE_SAMPLE_DATA) {
      loadSampleData();
    } else {
      await loadLast7DaysData();
    }
  });

  function loadSampleData() {
    // Expanded sample data with varied activity across all 7 days
    const today: DayData = {
      date: '2025-12-04',
      label: 'Today',
      totalSeconds: 0,
      formattedDuration: '0m',
      segments: [0, 0, 0, 0, 0, 0, 0, 120 * 60],
      maxSegmentSeconds: 120 * 60,
    };

    const yesterday: DayData = {
      date: '2025-12-03',
      label: 'Yesterday',
      totalSeconds: 4 * 3600 + 19 * 60,
      formattedDuration: '4h 19m',
      segments: [0, 30 * 60, 40 * 60, 80 * 60, 55 * 60, 0, 0, 0],
      maxSegmentSeconds: 80 * 60,
    };

    const twoDaysAgo: DayData = {
      date: '2025-12-02',
      label: '2 days ago',
      totalSeconds: 6 * 3600 + 12 * 60,
      formattedDuration: '6h 12m',
      segments: [20 * 60, 90 * 60, 60 * 60, 120 * 60, 45 * 60, 30 * 60, 0, 0],
      maxSegmentSeconds: 120 * 60,
    };

    const threeDaysAgo: DayData = {
      date: '2025-12-01',
      label: '3 days ago',
      totalSeconds: 2 * 3600 + 45 * 60,
      formattedDuration: '2h 45m',
      segments: [0, 0, 50 * 60, 30 * 60, 15 * 60, 0, 0, 0],
      maxSegmentSeconds: 50 * 60,
    };

    const fourDaysAgo: DayData = {
      date: '2025-11-30',
      label: '4 days ago',
      totalSeconds: 5 * 3600 + 30 * 60,
      formattedDuration: '5h 30m',
      segments: [0, 60 * 60, 80 * 60, 70 * 60, 90 * 60, 40 * 60, 0, 0],
      maxSegmentSeconds: 90 * 60,
    };

    const fiveDaysAgo: DayData = {
      date: '2025-11-29',
      label: '5 days ago',
      totalSeconds: 3 * 3600 + 5 * 60,
      formattedDuration: '3h 5m',
      segments: [10 * 60, 0, 55 * 60, 45 * 60, 20 * 60, 0, 0, 0],
      maxSegmentSeconds: 55 * 60,
    };

    const sixDaysAgo: DayData = {
      date: '2025-11-28',
      label: '6 days ago',
      totalSeconds: 1 * 3600 + 20 * 60,
      formattedDuration: '1h 20m',
      segments: [0, 0, 0, 20 * 60, 15 * 60, 0, 0, 0],
      maxSegmentSeconds: 20 * 60,
    };

    chartData = [
      today,
      yesterday,
      twoDaysAgo,
      threeDaysAgo,
      fourDaysAgo,
      fiveDaysAgo,
      sixDaysAgo,
    ];

    loading = false;
    error = '';
  }

  async function loadLast7DaysData() {
    try {
      loading = true;
      error = '';
      
      // Get date range for last 7 days
      const today = new Date();
      const sevenDaysAgo = new Date(today);
      sevenDaysAgo.setDate(today.getDate() - 7);
      sevenDaysAgo.setHours(0, 0, 0, 0);
      
      // Format dates for API (YYYY-MM-DD)
      const startDate = sevenDaysAgo.toISOString().split('T')[0];
      const endDate = today.toISOString().split('T')[0];
      
      // Use the advanced filtering API
      const response = await timeEntries.listWithFilters({
        start_date_after: startDate,
        start_date_before: endDate,
        limit: 100 // Get enough entries for the week
      });
      
      // Process data for each day
      const dayMap = new Map<string, DayData>();
      
      // Initialize all 7 days (today first)
      for (let i = 0; i <= 6; i++) {
        const date = new Date(today);
        date.setDate(today.getDate() - i);
        const dateStr = date.toISOString().split('T')[0];
        const label = i === 0 ? 'Today' : i === 1 ? 'Yesterday' : `${i} days ago`;
        
        dayMap.set(dateStr, {
          date: dateStr,
          label,
          totalSeconds: 0,
          formattedDuration: '0h 0m',
          segments: [0, 0, 0, 0, 0, 0, 0, 0], // 8 time segments
          maxSegmentSeconds: 0
        });
      }
      
      // Calculate total time for each day and distribute across segments
      for (const entry of response.results) {
        const entryDate = new Date(entry.start_time).toISOString().split('T')[0];
        const dayData = dayMap.get(entryDate);
        
        if (dayData) {
          let seconds = 0;
          if (entry.duration) {
            // Parse duration like "02:30:45" (HH:MM:SS)
            const parts = entry.duration.split(':').map(Number);
            seconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
          } else if (entry.end_time) {
            // If we have an explicit end_time but no duration, derive it
            const startTime = new Date(entry.start_time).getTime();
            const endTime = new Date(entry.end_time).getTime();
            seconds = Math.max(0, Math.floor((endTime - startTime) / 1000));
          } else if (entry.is_active) {
            // For active entries, calculate from start time to now
            const startTime = new Date(entry.start_time).getTime();
            seconds = Math.floor((Date.now() - startTime) / 1000);
          } else {
            // Fallback: entries with no duration/end_time and not active.
            // Give them a small nominal value so they are visible in the chart.
            seconds = 5 * 60; // 5 minutes
          }
          
          dayData.totalSeconds += seconds;
          
          // Distribute this entry's time across appropriate segments based on start time
          distributeEntryTimeAcrossSegments(dayData, entry.start_time, entry.end_time || new Date().toISOString(), seconds);
        }
      }
      
      // Format durations and distribute time across segments
      for (const dayData of dayMap.values()) {
        dayData.formattedDuration = formatDuration(dayData.totalSeconds);
        // Compute per-day max segment value for relative bar heights
        dayData.maxSegmentSeconds = Math.max(0, ...dayData.segments);
      }
      
      // Convert to array and sort by date (today first)
      chartData = Array.from(dayMap.values()).sort((a, b) => 
        new Date(b.date).getTime() - new Date(a.date).getTime()
      );
      
      loading = false;
    } catch (err) {
      console.error('Failed to load last 7 days data:', err);
      error = 'Failed to load activity data';
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

  function distributeEntryTimeAcrossSegments(dayData: DayData, startTime: string, endTime: string, totalSeconds: number) {
    const start = new Date(startTime);
    const end = new Date(endTime);
    
    // Get hour of day (0-23)
    const startHour = start.getHours();
    const endHour = end.getHours();
    
    // Map hours to 8 practical time segments (every 3 hours)
    // Segment 0: 0-3, Segment 1: 3-6, Segment 2: 6-9, Segment 3: 9-12
    // Segment 4: 12-15, Segment 5: 15-18, Segment 6: 18-21, Segment 7: 21-24
    const hourToSegment = (hour: number) => {
      if (hour >= 0 && hour < 3) return 0;   // 0-3
      if (hour >= 3 && hour < 6) return 1;   // 3-6
      if (hour >= 6 && hour < 9) return 2;   // 6-9
      if (hour >= 9 && hour < 12) return 3;  // 9-12
      if (hour >= 12 && hour < 15) return 4; // 12-15
      if (hour >= 15 && hour < 18) return 5; // 15-18
      if (hour >= 18 && hour < 21) return 6; // 18-21
      return 7; // 21-24
    };
    
    const startSegment = hourToSegment(startHour);
    const endSegment = hourToSegment(endHour);
    
    // If same segment, add all time to that segment
    if (startSegment === endSegment) {
      dayData.segments[startSegment] += totalSeconds;
    } else {
      // Distribute across multiple segments
      const segmentCount = endSegment - startSegment + 1;
      const secondsPerSegment = totalSeconds / segmentCount;
      
      for (let i = startSegment; i <= endSegment && i < 8; i++) {
        dayData.segments[i] += secondsPerSegment;
      }
    }
  }

  function distributeTimeAcrossSegments(dayData: DayData) {
    // This function is now handled by distributeEntryTimeAcrossSegments
    // Kept for backwards compatibility (no-op)
  }

  function getSegmentFillHeight(day: DayData, segmentSeconds: number): number {
    if (!day.maxSegmentSeconds || segmentSeconds <= 0) {
      return 0;
    }

    // Ratio of this segment vs the busiest segment for that day
    const ratio = segmentSeconds / day.maxSegmentSeconds; // 0..1

    // Use a square-root easing so smaller values are still visible
    const eased = Math.sqrt(ratio);

    // Map to 0-100%, but keep a small minimum so non-zero work is visible
    const percent = eased * 100;
    return Math.min(100, Math.max(8, percent));
  }

  function getSegmentTimeRangeLabel(index: number): string {
    // Keep this in sync with hourToSegment in distributeEntryTimeAcrossSegments
    switch (index) {
      case 0:
        return '00:00–02:59';
      case 1:
        return '03:00–05:59';
      case 2:
        return '06:00–08:59';
      case 3:
        return '09:00–11:59';
      case 4:
        return '12:00–14:59';
      case 5:
        return '15:00–17:59';
      case 6:
        return '18:00–20:59';
      case 7:
      default:
        return '21:00–23:59';
    }
  }

  function getSegmentTooltip(day: DayData, index: number): string {
    const seconds = day.segments[index] ?? 0;
    const range = getSegmentTimeRangeLabel(index);

    if (!seconds) {
      return `${range} \u2022 No tracked time`;
    }

    const durationLabel = formatDuration(seconds);
    const share = day.totalSeconds ? Math.round((seconds / day.totalSeconds) * 100) : 0;
    return `${range} \u2022 ${durationLabel} (${share}% of day)`;
  }
</script>

<div class="card bg-base-100 shadow-sm">
  <div class="card-body p-4">
    <h2 class="card-title text-sm mb-4 flex items-center">
      <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path>
      </svg>
      Last 7 Days
    </h2>
    
    {#if loading}
      <div class="flex justify-center items-center h-12">
        <div class="flex space-x-0.5">
          {#each Array(7) as _}
            <div class="w-3 h-7 bg-base-300 rounded-sm animate-pulse"></div>
          {/each}
        </div>
      </div>
    {:else if error}
      <div class="alert alert-error alert-sm">
        <span class="text-xs">{error}</span>
      </div>
    {:else}
      <div class="space-y-1">
        {#each chartData as day}
          <div class="flex items-center space-x-1">
            <!-- Day label -->
            <div class="w-16 text-xs font-medium text-base-content/70 text-right">
              {day.label}
            </div>
            
            <!-- Activity segments container: bar chart -->
            <div class="flex-1 flex items-center h-10">
              <div class="flex items-end justify-center w-full space-x-2 h-full">
                {#each day.segments as segment, index}
                  <div class="tooltip tooltip-top" data-tip={getSegmentTooltip(day, index)}>
                    <div
                      class="w-[18px] md:w-[20px] h-8 rounded-md bg-base-200/30 relative overflow-hidden"
                    >
                      <div
                        class="absolute inset-x-0 bottom-0 rounded-md bg-primary animate-slide-in"
                        style="height: {getSegmentFillHeight(day, segment)}%; animation-delay: {index * 50}ms"
                      ></div>
                    </div>
                  </div>
                {/each}
              </div>
            </div>
            
            <!-- Duration label -->
            <div class="w-10 text-xs text-right text-base-content/60">
              {day.formattedDuration}
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </div>
</div>

<style>
  /* Custom animations for bars */
  @keyframes slideInFromBottom {
    from {
      transform: scaleY(0);
      opacity: 0;
    }
    to {
      transform: scaleY(1);
      opacity: 1;
    }
  }
  
  .animate-slide-in {
    animation: slideInFromBottom 0.5s ease-out forwards;
    transform-origin: bottom;
  }
</style>
