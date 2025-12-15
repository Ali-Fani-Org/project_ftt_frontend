<script>
  export let active = false;
</script>

{#if active}
  <div class="debug-preload-icon">
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="12" r="10"></circle>
      <line x1="2" y1="12" x2="22" y2="12"></line>
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
    </svg>
  </div>
{/if}

<style>
  .debug-preload-icon {
    position: absolute;
    top: 5px;
    right: 5px;
    opacity: 0.7;
    z-index: 10;
  }
</style>
