<script lang="ts">
  import { baseUrl } from './stores';
  import { createEventDispatcher } from 'svelte';

  const dispatch = createEventDispatcher();

  let localBaseUrl = $state($baseUrl);

  function save() {
    baseUrl.set(localBaseUrl);
    dispatch('close');
  }

  function cancel() {
    localBaseUrl = $baseUrl; // Reset to current value
    dispatch('close');
  }
</script>

<div class="modal modal-open">
  <div class="modal-box max-w-md">
    <h3 class="font-bold text-lg">Settings</h3>
    
    <div class="form-control mt-4">
      <label class="label" for="baseUrl">
        <span class="label-text">Base URL</span>
      </label>
      <input
        id="baseUrl"
        bind:value={localBaseUrl}
        type="text"
        placeholder="http://localhost:8000"
        class="input input-bordered"
      />
    </div>

    <div class="modal-action">
      <button class="btn" onclick={cancel}>Cancel</button>
      <button class="btn btn-primary" onclick={save}>Save</button>
    </div>
  </div>
</div>