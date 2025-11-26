<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';

  // Redirect to the new entries page
  onMount(() => {
    goto('/entries');
  });
</script>

<div class="container mx-auto p-4 lg:p-8">
  <div class="flex justify-center items-center min-h-[50vh]">
    <div class="text-center">
      <span class="loading loading-spinner loading-lg"></span>
      <p class="mt-4 text-base-content/70">Redirecting to Time Entries...</p>
    </div>
  </div>
</div>