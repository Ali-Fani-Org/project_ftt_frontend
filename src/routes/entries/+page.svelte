<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { authToken } from '$lib/stores';
  import { timeEntries, type PaginatedTimeEntries, type TimeEntry } from '$lib/api';
  import { get } from 'svelte/store';
  import TimeEntryDetailModal from '$lib/TimeEntryDetailModal.svelte';

  let data = $state<PaginatedTimeEntries | null>(null);
  let loading = $state(true);
  let error = $state('');
  let selectedEntry = $state<TimeEntry | null>(null);

  // Pagination state
  let currentCursor = $state<string | null>(null);
  let hasNext = $state(false);
  let hasPrevious = $state(false);

  onMount(async () => {
    const token = get(authToken);
    if (!token) {
      goto('/');
      return;
    }

    await loadData();
  });

  async function loadData(cursor?: string | null) {
    try {
      loading = true;
      error = '';
      const result = await timeEntries.list(cursor || undefined);
      data = result;
      currentCursor = cursor || null;
      hasNext = !!result.next;
      hasPrevious = !!result.previous;
    } catch (err) {
      error = 'Failed to load time entries';
      console.error(err);
    } finally {
      loading = false;
    }
  }

  function extractCursor(url: string): string | null {
    const urlObj = new URL(url);
    return urlObj.searchParams.get('cursor');
  }

  async function goToNext() {
    if (data?.next) {
      const cursor = extractCursor(data.next);
      await loadData(cursor);
    }
  }

  async function goToPrevious() {
    if (data?.previous) {
      const cursor = extractCursor(data.previous);
      await loadData(cursor);
    }
  }

  function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleString();
  }

  function formatDuration(duration: string | null): string {
    if (!duration) return 'Active';
    // Duration is now in seconds as string (e.g., "8.0", "127172.0")
    const totalSeconds = parseInt(duration, 10) || 0;
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  }

  function getStatusBadge(entry: TimeEntry) {
    if (entry.is_active) {
      return { text: 'Active', class: 'badge-success' };
    } else {
      return { text: 'Completed', class: 'badge-neutral' };
    }
  }

  function openEntryModal(entry: TimeEntry) {
    selectedEntry = entry;
  }

  function closeEntryModal() {
    selectedEntry = null;
  }
</script>

<div class="container mx-auto p-4 lg:p-8">
  <div class="mb-8">
    <h1 class="text-3xl font-bold text-primary">Time Entries</h1>
    <p class="text-base-content/70">View and manage all your tracked time</p>
  </div>

  {#if loading}
    <div class="flex justify-center items-center min-h-[50vh]">
      <span class="loading loading-spinner loading-lg"></span>
    </div>
  {:else if error}
    <div class="alert alert-error mb-6">
      <svg class="w-6 h-6 stroke-current shrink-0 stroke-2" fill="none" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
      </svg>
      <span>{error}</span>
    </div>
  {:else if data}
    <!-- Desktop Table View -->
    <div class="hidden lg:block">
      <div class="card bg-base-100 shadow-lg">
        <div class="card-body p-0">
          <div class="overflow-x-auto">
            <table class="table table-zebra w-full">
              <thead>
                <tr class="bg-base-200">
                  <th>Title</th>
                  <th class="w-1/3">Project</th>
                  <th>Start Time</th>
                  <th>End Time</th>
                  <th>Duration</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {#each data.results as entry (entry.id)}
                  {@const status = getStatusBadge(entry)}
                  <tr
                    class="hover:bg-base-200/50 cursor-pointer transition-colors duration-200"
                    onclick={() => openEntryModal(entry)}
                  >
                    <td>
                      <div class="font-medium">{entry.title}</div>
                    </td>
                    <td>
                      <div class="font-medium text-primary">{entry.project}</div>
                    </td>
                    <td class="text-sm">{formatDate(entry.start_time)}</td>
                    <td class="text-sm">
                      {entry.end_time ? formatDate(entry.end_time) : '-'}
                    </td>
                    <td class="font-mono text-sm">
                      {formatDuration(entry.duration)}
                    </td>
                    <td>
                      <span class="badge {status.class}">
                        {status.text}
                      </span>
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>

    <!-- Mobile Card View -->
    <div class="lg:hidden space-y-4">
      {#each data.results as entry (entry.id)}
        {@const status = getStatusBadge(entry)}
        <div
          class="card bg-base-100 shadow-lg cursor-pointer transition-all duration-200 hover:shadow-xl"
          onclick={() => openEntryModal(entry)}
        >
          <div class="card-body">
            <div class="flex items-start justify-between mb-3">
              <h3 class="font-semibold text-lg">{entry.title}</h3>
              <span class="badge {status.class} text-xs">
                {status.text}
              </span>
            </div>

            <div class="space-y-2 text-sm">
              <div class="flex items-center justify-between">
                <span class="text-base-content/60">Project:</span>
                <span class="font-medium text-primary">{entry.project}</span>
              </div>
              <div class="flex items-center justify-between">
                <span class="text-base-content/60">Duration:</span>
                <span class="font-mono">{formatDuration(entry.duration)}</span>
              </div>
              <div class="flex items-center justify-between">
                <span class="text-base-content/60">Started:</span>
                <span>{formatDate(entry.start_time)}</span>
              </div>
              {#if entry.end_time}
                <div class="flex items-center justify-between">
                  <span class="text-base-content/60">Ended:</span>
                  <span>{formatDate(entry.end_time)}</span>
                </div>
              {/if}
            </div>
          </div>
        </div>
      {/each}
    </div>

    <!-- Pagination -->
    <div class="flex flex-col sm:flex-row justify-between items-center mt-8 space-y-4 sm:space-y-0">
      <div class="text-sm text-base-content/60">
        {#if data.results.length > 0}
          Showing {data.results.length} entries
          {#if currentCursor}
            {#if hasPrevious} • Earlier entries available {:else} • Oldest entries shown {/if}
          {:else}
            {#if hasNext} • Newer entries available {:else} • All entries shown {/if}
          {/if}
        {:else}
          No entries found
        {/if}
      </div>

      <div class="flex space-x-2">
        <button
          class="btn btn-outline btn-sm"
          disabled={!hasPrevious}
          onclick={goToPrevious}
        >
          <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path>
          </svg>
          Previous
        </button>
        <button
          class="btn btn-outline btn-sm"
          disabled={!hasNext}
          onclick={goToNext}
        >
          Next
          <svg class="w-4 h-4 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path>
          </svg>
        </button>
      </div>
    </div>
  {/if}
</div>

<!-- Time Entry Detail Modal -->
{#if selectedEntry}
  <TimeEntryDetailModal entry={selectedEntry} on:close={closeEntryModal} />
{/if}