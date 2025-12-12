<script lang="ts">
  import { type TimeEntry } from './api';
  import { createEventDispatcher } from 'svelte';

  const dispatch = createEventDispatcher();

  interface Props {
    entry: TimeEntry | null;
  }

  let { entry = $bindable(null) }: Props = $props();

  function formatDate(dateStr: string): string {
    const date = new Date(dateStr);
    const options: Intl.DateTimeFormatOptions = {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    };
    return date.toLocaleDateString('en-US', options);
  }

  function formatTime(dateStr: string): string {
    const date = new Date(dateStr);
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  }

  function formatDateOnly(dateStr: string): string {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  }

  function formatDuration(duration: string | null): string {
    if (!duration) return 'Active';
    // Duration is now in seconds as string (e.g., "8.0", "127172.0")
    const totalSeconds = parseInt(duration, 10) || 0;
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    if (hours > 0) {
      return `${hours}h ${minutes}m ${seconds}s`;
    }
    return `${minutes}m ${seconds}s`;
  }

  function getStatusBadge(entry: TimeEntry) {
    if (entry.is_active) {
      return { text: 'Active', class: 'badge-success' };
    } else {
      return { text: 'Completed', class: 'badge-neutral' };
    }
  }

  function close() {
    dispatch('close');
  }
</script>

{#if entry}
  <div class="modal modal-open">
    <div class="modal-box max-w-5xl w-11/12">
      <!-- Header -->
      <div class="flex items-start justify-between mb-6">
        <div>
          <h3 class="font-bold text-3xl text-primary">{entry.title}</h3>
          <div class="flex items-center gap-4 mt-2">
            {#if entry}
              {@const status = getStatusBadge(entry)}
              <span class="badge {status.class} badge-lg">
                {status.text}
              </span>
            {/if}
          </div>
        </div>
        <button class="btn btn-sm btn-circle btn-ghost" onclick={close}>
          ✕
        </button>
      </div>

      <!-- Main Content with Sidebar -->
      <div class="flex gap-8">
        <!-- Left Column - Description and Additional Info -->
        <div class="flex-1 space-y-6">
          <!-- Description Section -->
          {#if entry.description}
            <div class="card bg-base-200">
              <div class="card-body">
                <h4 class="font-semibold text-xl mb-4 flex items-center gap-2">
                  <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
                  </svg>
                  Description
                </h4>
                <div class="prose prose-base max-w-none">
                  <p class="text-base-content/80 leading-relaxed text-lg">{entry.description}</p>
                </div>
              </div>
            </div>
          {/if}

          <!-- Tags Section -->
          {#if entry.tags && entry.tags.length > 0}
            <div class="card bg-base-200">
              <div class="card-body">
                <h4 class="font-semibold text-lg mb-3 flex items-center gap-2">
                  <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"></path>
                  </svg>
                  Tags
                </h4>
                <div class="flex flex-wrap gap-2">
                  {#each entry.tags as tag}
                    <span class="badge badge-outline badge-lg">{tag}</span>
                  {/each}
                </div>
              </div>
            </div>
          {/if}
        </div>

        <!-- Right Sidebar - Details -->
        <div class="w-80 space-y-4">
          <!-- Project Information -->
          <div class="card bg-base-200">
            <div class="card-body">
              <h4 class="font-semibold text-lg mb-3 flex items-center gap-2">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"></path>
                </svg>
                Project Info
              </h4>
              <div class="space-y-3">
                <div>
                  <span class="text-sm text-base-content/60">Project Name</span>
                  <div class="font-semibold text-primary text-lg">{entry.project}</div>
                </div>
              </div>
            </div>
          </div>

          <!-- Time Details -->
          <div class="card bg-base-200">
            <div class="card-body">
              <h4 class="font-semibold text-lg mb-3 flex items-center gap-2">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                </svg>
                Time Details
              </h4>
              <div class="space-y-4">
                <div>
                  <span class="text-sm text-base-content/60">Start Time</span>
                  <div class="font-mono text-sm bg-base-300 rounded px-2 py-1 mt-1">
                    {formatDate(entry.start_time)}
                  </div>
                  <div class="text-xs text-base-content/50 mt-1">
                    {formatTime(entry.start_time)}
                  </div>
                </div>

                {#if entry.end_time}
                  <div>
                    <span class="text-sm text-base-content/60">End Time</span>
                    <div class="font-mono text-sm bg-base-300 rounded px-2 py-1 mt-1">
                      {formatDate(entry.end_time)}
                    </div>
                    <div class="text-xs text-base-content/50 mt-1">
                      {formatTime(entry.end_time)}
                    </div>
                  </div>
                {/if}

                <div class="border-t border-base-300 pt-3">
                  <span class="text-sm text-base-content/60">Duration</span>
                  <div class="font-mono text-xl font-semibold text-primary mt-1">
                    {formatDuration(entry.duration)}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Entry Details -->
          <div class="card bg-base-200">
            <div class="card-body">
              <h4 class="font-semibold text-lg mb-3 flex items-center gap-2">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
                </svg>
                Entry Details
              </h4>
              <div class="space-y-3">
                <div>
                  <span class="text-sm text-base-content/60">Entry ID</span>
                  <div class="font-mono text-sm">{entry.id}</div>
                </div>

                <div>
                  <span class="text-sm text-base-content/60">User</span>
                  <div class="font-medium">{entry.user}</div>
                </div>

                <div>
                  <span class="text-sm text-base-content/60">Status</span>
                  <div class="flex items-center gap-2 mt-1">
                    {#if entry}
                      {@const status = getStatusBadge(entry)}
                      <span class="badge {status.class}">
                        {status.text}
                      </span>
                    {/if}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Active Entry Alert -->
      {#if entry.is_active}
        <div class="mt-6">
          <div class="alert alert-info">
            <svg class="w-6 h-6 stroke-current shrink-0 stroke-2" fill="none" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
            </svg>
            <span>This time entry is currently active</span>
          </div>
        </div>
      {/if}

      <!-- Modal Actions -->
      <div class="modal-action">
        <button class="btn btn-primary" onclick={close}>Close</button>
      </div>
    </div>
  </div>
{/if}