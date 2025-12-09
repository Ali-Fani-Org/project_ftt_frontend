<script lang="ts">
  import { onMount } from 'svelte';
  import { timeEntries, type TimeEntry, type PaginatedTimeEntries } from '$lib/api';
  import ky from 'ky';
  import { authToken, baseUrl } from '$lib/stores';
  import { get } from 'svelte/store';

  // Chart data structure
  interface DayData {
    date: string;
    label: string;
    totalSeconds: number;
    formattedDuration: string;
    segments: number[]; // 8 segments for different times of day (3-hour intervals)
    maxSegmentSeconds: number; // max seconds in any segment for this day
  }

  interface TimeSegment {
    start: number; // start hour (0-23)
    end: number;   // end hour (0-23)
    seconds: number;
  }

  let chartData = $state<DayData[]>([]);
  let loading = $state(true);
  let error = $state('');
  let dateTooltip = $state<{ show: boolean; date: string; x: number; y: number }>({
    show: false,
    date: '',
    x: 0,
    y: 0
  });
  let tooltipTimeout: number | null = null;

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

  function showDateTooltip(date: string, event: MouseEvent) {
    if (tooltipTimeout) {
      clearTimeout(tooltipTimeout);
    }

    // Set a timeout to show the tooltip after 3 seconds
    tooltipTimeout = setTimeout(() => {
      dateTooltip = {
        show: true,
        date,
        x: event.clientX,
        y: event.clientY - 30 // Position above the cursor
      };
    }, 2000) as unknown as number;
  }

  function hideDateTooltip() {
    if (tooltipTimeout) {
      clearTimeout(tooltipTimeout);
      tooltipTimeout = null;
    }

    dateTooltip.show = false;
  }

  function loadSampleData() {
    // Sample data showing how tasks should be distributed across time segments
    const today: DayData = {
      date: '2025-12-09',
      label: 'Today',
      totalSeconds: 2 * 3600 + 30 * 60, // 2.5 hours
      formattedDuration: '2h 30m',
      segments: [0, 0, 30*60, 60*60, 0, 0, 0, 0], // Tasks from 06:00-09:00
      maxSegmentSeconds: 60 * 60,
    };

    const yesterday: DayData = {
      date: '2025-12-08',
      label: 'Yesterday',
      totalSeconds: 4 * 3600 + 15 * 60, // 4.25 hours
      formattedDuration: '4h 15m',
      segments: [0, 0, 0, 90*60, 120*60, 0, 0, 0], // Tasks from 09:00-15:00
      maxSegmentSeconds: 120 * 60,
    };

    const twoDaysAgo: DayData = {
      date: '2025-12-07',
      label: '2 days ago',
      totalSeconds: 8 * 3600, // 8 hours
      formattedDuration: '8h 0m',
      segments: [0, 0, 60*60, 120*60, 120*60, 120*60, 60*60, 0], // Tasks spread throughout day
      maxSegmentSeconds: 120 * 60,
    };

    const threeDaysAgo: DayData = {
      date: '2025-12-06',
      label: '3 days ago',
      totalSeconds: 1 * 3600 + 45 * 60, // 1.75 hours
      formattedDuration: '1h 45m',
      segments: [0, 0, 0, 0, 45*60, 60*60, 60*60, 0], // Tasks from 12:00-21:00
      maxSegmentSeconds: 60 * 60,
    };

    chartData = [today, yesterday, twoDaysAgo, threeDaysAgo, ...Array(3).fill(null).map((_, i) => ({
      date: new Date(new Date().setDate(new Date().getDate() - 3 - i)).toISOString().split('T')[0],
      label: `${3 + i + 1} days ago`,
      totalSeconds: 0,
      formattedDuration: '0m',
      segments: [0, 0, 0, 0, 0, 0, 0, 0],
      maxSegmentSeconds: 0
    }))];

    loading = false;
    error = '';
  }

  async function loadLast7DaysData() {
    try {
      loading = true;
      error = '';

      // Calculate today's date string in Asia/Tehran timezone
      const now = new Date();
      // Format the date in Asia/Tehran timezone
      const year = now.toLocaleString('en', { year: 'numeric', timeZone: 'Asia/Tehran' });
      const month = now.toLocaleString('en', { month: '2-digit', timeZone: 'Asia/Tehran' });
      const day = now.toLocaleString('en', { day: '2-digit', timeZone: 'Asia/Tehran' });
      const todayStr = `${year}-${month}-${day}`;

      // Get date range for the last 7 days
      // We need to calculate the date 7 days ago in Tehran timezone as well
      const sevenDaysAgo = new Date(now);
      sevenDaysAgo.setDate(now.getDate() - 7);
      // Format this date in Tehran timezone too
      const year7 = sevenDaysAgo.toLocaleString('en', { year: 'numeric', timeZone: 'Asia/Tehran' });
      const month7 = sevenDaysAgo.toLocaleString('en', { month: '2-digit', timeZone: 'Asia/Tehran' });
      const day7 = sevenDaysAgo.toLocaleString('en', { day: '2-digit', timeZone: 'Asia/Tehran' });
      const sevenDaysAgoStr = `${year7}-${month7}-${day7}`;

      // Collect all entries across all pages using direct API calls
      let allEntries: TimeEntry[] = [];
      let currentPageUrl: string | null = `api/time_entries/?start_date_after_tz=${sevenDaysAgoStr}&start_date_before_tz=${todayStr}&limit=200`;
      let hasMorePages = true;

      // Fetch all pages using pagination
      while (hasMorePages && currentPageUrl) {
        // Create the API request with proper authentication
        const token = get(authToken);
        const baseUrlValue = get(baseUrl);
        // Construct full URL - if currentPageUrl is a relative path, add baseUrl with trailing slash
        let fullUrl;
        if (currentPageUrl.startsWith('http')) {
          // If currentPageUrl is already a full URL (from next/previous), use as-is
          fullUrl = currentPageUrl;
        } else {
          // If currentPageUrl is a relative path, prepend the base URL with trailing slash
          fullUrl = `${baseUrlValue}${baseUrlValue.endsWith('/') ? '' : '/'}${currentPageUrl}`;
        }

        const response = await ky.get(fullUrl, {
          headers: {
            'Authorization': token ? `Token ${token}` : '',
          }
        }).json<PaginatedTimeEntries>();

        allEntries = allEntries.concat(response.results);
        currentPageUrl = response.next; // This will be null when no more pages are available
        hasMorePages = !!currentPageUrl; // Continue if there's a next page
      }

      // Initialize all 7 days (today first), but only dates within the actual data range
      const dayMap = new Map<string, DayData>();

      // First, create entries for the last 7 days using Tehran timezone
      for (let i = 0; i <= 6; i++) {
        const date = new Date(now);
        date.setDate(now.getDate() - i);
        // Format in Tehran timezone to ensure consistency
        const year = date.toLocaleString('en', { year: 'numeric', timeZone: 'Asia/Tehran' });
        const month = date.toLocaleString('en', { month: '2-digit', timeZone: 'Asia/Tehran' });
        const dayVal = date.toLocaleString('en', { day: '2-digit', timeZone: 'Asia/Tehran' });
        const dateStr = `${year}-${month}-${dayVal}`;
        const label = i === 0 ? 'Today' : i === 1 ? 'Yesterday' : `${i} days ago`;

        dayMap.set(dateStr, {
          date: dateStr,
          label,
          totalSeconds: 0,
          formattedDuration: '0h 0m',
          segments: [0, 0, 0, 0, 0, 0, 0, 0], // 8 time segments (3-hour intervals)
          maxSegmentSeconds: 0
        });
      }

      // Calculate total time for each day and distribute across segments based on actual time ranges
      for (const entry of allEntries) {
        // The start_time from API is now in the correct timezone, so we extract the date part
        const entryDateStr = entry.start_time.split('T')[0];
        const dayData = dayMap.get(entryDateStr);

        if (!dayData) continue;

        // Calculate duration based on start/end times
        let durationSeconds = 0;
        if (entry.duration) {
          // Parse duration like "02:30:45" (HH:MM:SS)
          const parts = entry.duration.split(':').map(Number);
          durationSeconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
        } else if (entry.end_time) {
          // If we have an explicit end_time but no duration, derive it
          const startTime = new Date(entry.start_time).getTime();
          const endTime = new Date(entry.end_time).getTime();
          durationSeconds = Math.max(0, Math.floor((endTime - startTime) / 1000));
        } else if (entry.is_active) {
          // For active entries, calculate from start time to now
          const startTime = new Date(entry.start_time).getTime();
          durationSeconds = Math.floor((Date.now() - startTime) / 1000);
        } else {
          // Fallback: entries with no duration/end_time and not active.
          durationSeconds = 5 * 60; // 5 minutes
        }

        if (durationSeconds <= 0) continue;

        // Calculate time segments based on the actual start and end times
        const startTime = new Date(entry.start_time);
        const endTime = entry.end_time ? new Date(entry.end_time) : new Date();

        // Add the time to the appropriate segments based on actual time range
        distributeTimeByHourRange(dayData, startTime, endTime, durationSeconds);

        // Add to total for the day
        dayData.totalSeconds += durationSeconds;
      }

      // Format durations and compute segment max for each day
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

  // Distribute time based on the actual hour range of the task
  function distributeTimeByHourRange(dayData: DayData, start: Date, end: Date, totalSeconds: number) {
    // Calculate start and end minutes from the beginning of the day
    const startMinutesFromDayStart = start.getHours() * 60 + start.getMinutes() + (start.getSeconds() / 60);
    let endMinutesFromDayStart = end.getHours() * 60 + end.getMinutes() + (end.getSeconds() / 60);

    // If the entry goes beyond the current day (end time has different date), cap at end of day
    if (start.getDate() !== end.getDate() || end.getDate() !== start.getDate()) {
      // For entries that span to the next day, only calculate for the current day
      endMinutesFromDayStart = 24 * 60; // End of the day (24:00)
    }

    // Handle impossible case where duration is negative
    if (endMinutesFromDayStart < startMinutesFromDayStart) {
      return; // Skip this entry
    }

    // Determine which 3-hour segments this time range covers
    const segmentStartHours = [0, 3, 6, 9, 12, 15, 18, 21]; // Start hours of each 3-hour segment

    // Calculate how many total minutes this entry spans
    let durationMinutes = endMinutesFromDayStart - startMinutesFromDayStart;

    // If the duration is 0 or negative, no need to continue
    if (durationMinutes <= 0) return;

    // Cap duration at 24 hours (1440 minutes) to avoid impossible calculations
    durationMinutes = Math.min(durationMinutes, 24 * 60);

    // Distribute the time based on which segments it overlaps
    for (let i = 0; i < segmentStartHours.length; i++) {
      const segmentStartMinutes = segmentStartHours[i] * 60;
      const segmentEndMinutes = Math.min(segmentStartMinutes + 3 * 60, 24 * 60); // 3 hours or until end of day

      // Calculate overlap between task time and segment time
      const overlapStart = Math.max(startMinutesFromDayStart, segmentStartMinutes);
      const overlapEnd = Math.min(endMinutesFromDayStart, segmentEndMinutes);

      if (overlapEnd > overlapStart && durationMinutes > 0) {
        const overlapMinutes = overlapEnd - overlapStart;
        const segmentRatio = overlapMinutes / durationMinutes;
        const segmentSeconds = Math.floor(totalSeconds * segmentRatio);

        dayData.segments[i] += segmentSeconds;
      }
    }
  }

  function formatDuration(seconds: number): string {
    // Handle NaN or invalid values
    if (isNaN(seconds) || seconds < 0) {
      return '0m';
    }

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

  function getSegmentFillHeight(day: DayData, segmentSeconds: number): number {
    if (segmentSeconds <= 0) {
      return 0;
    }

    // Use a fixed scaling approach to make bars more visible
    // Consider that a full day of work might be around 8-12 hours (28800-43200 seconds)
    // So we'll scale based on a reasonable maximum for a 3-hour segment
    const maxPossibleForSegment = 3 * 3600; // 3 hours max for a segment
    const ratio = segmentSeconds / maxPossibleForSegment;

    // Scale to 0-100% but apply a curve to make smaller values more visible
    const scaledRatio = Math.pow(Math.min(1, ratio), 0.6);
    const percent = scaledRatio * 100;

    return Math.min(100, Math.max(10, percent)); // Minimum 10% to ensure visibility
  }

  function getSegmentTimeRangeLabel(index: number): string {
    // Each segment represents 3 hours
    const startHour = index * 3;
    const endHour = Math.min((index + 1) * 3, 24);

    const startStr = startHour.toString().padStart(2, '0');
    const endStr = endHour.toString().padStart(2, '0');

    return `${startStr}:00\u2013${endStr === '24' ? '23:59' : `${endStr}:59`}`;
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
      <div class="flex justify-center items-center h-16">
        <div class="flex space-x-1">
          {#each Array(7) as _}
            <div class="w-4 h-10 bg-base-300 rounded-sm animate-pulse"></div>
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
          <div class="flex items-center">
            <!-- Day label with date tooltip -->
            <div
              class="w-14 text-[0.7rem] font-medium text-base-content/90 mr-1.5 flex-shrink-0 relative"
              on:mouseenter={() => showDateTooltip(day.date, event)}
              on:mouseleave={() => hideDateTooltip()}
            >
              <div>{day.label}</div>
            </div>

            <!-- Activity segments container: bar chart -->
            <div class="flex-1 flex flex-col items-center">
              <div class="flex items-end justify-center w-full space-x-1 mb-1">
                {#each day.segments as segment, index}
                  <div class="tooltip tooltip-top" data-tip={getSegmentTooltip(day, index)}>
                    <div
                      class="w-3 rounded-sm bg-base-200/50 relative overflow-hidden"
                      style="min-height: 0.25rem; width: 1rem; height: 1.75rem;"
                    >
                      <div
                        class="absolute inset-x-0 bottom-0 rounded-sm bg-primary transition-all duration-300 ease-out"
                        style="height: {getSegmentFillHeight(day, segment)}%;"
                      ></div>
                    </div>
                  </div>
                {/each}
              </div>
              <div class="flex justify-center w-full space-x-1">
                {#each day.segments as segment, index}
                  <div class="text-[0.6rem] text-base-content/60 w-3" style="width: 1rem;">
                    {getSegmentTimeRangeLabel(index).substring(0, 2)}
                  </div>
                {/each}
              </div>
            </div>

            <!-- Duration -->
            <div class="w-10 text-[0.7rem] text-base-content/60 ml-1.5 text-right flex-shrink-0">
              {day.formattedDuration}
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </div>
</div>

{#if dateTooltip.show}
  <div
    class="fixed z-50 bg-base-300 text-base-content text-xs px-2 py-1 rounded shadow-lg pointer-events-none"
    style="left: {dateTooltip.x}px; top: {dateTooltip.y}px;"
  >
    {dateTooltip.date}
  </div>
{/if}

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
