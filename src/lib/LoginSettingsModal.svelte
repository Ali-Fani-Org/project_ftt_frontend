<script lang="ts">
	import { baseUrl, baseUrlHistory } from './stores';
	import { createEventDispatcher } from 'svelte';
	import { onMount } from 'svelte';
	import { pingBaseUrl, type BaseUrlPingResult } from './network';

	const dispatch = createEventDispatcher();

	let localBaseUrl = $state($baseUrl);
	let isSaving = $state(false);
	let saveError = $state('');
	let lastTest = $state<BaseUrlPingResult | null>(null);
	let isRefreshingHistory = $state(false);

	const normalizeBaseUrl = (value: string) => value.trim().replace(/\/+$/, '');

	function selectFromHistory(url: string) {
		localBaseUrl = url;
		saveError = '';
		lastTest = null;
	}

	async function refreshHistoryPings() {
		isRefreshingHistory = true;
		try {
			const entries = $baseUrlHistory;
			const results = await Promise.all(
				entries.map(async (entry) => {
					const result = await pingBaseUrl(entry.url, { timeoutMs: 3000 });
					return {
						...entry,
						ok: result.ok,
						lastPingMs: result.pingMs,
						lastCheckedAt: result.checkedAt
					};
				})
			);
			baseUrlHistory.set(results);
		} finally {
			isRefreshingHistory = false;
		}
	}

	onMount(() => {
		const current = normalizeBaseUrl($baseUrl);
		if (current) {
			baseUrlHistory.update((entries) => {
				if (entries.some((e) => e.url === current)) return entries;
				return [{ url: current, ok: null, lastPingMs: null, lastCheckedAt: null }, ...entries];
			});
		}
		refreshHistoryPings();
	});

	async function testAndSave() {
		saveError = '';
		lastTest = null;

		const nextUrl = normalizeBaseUrl(localBaseUrl);
		if (!nextUrl) {
			saveError = 'Base URL is required';
			return;
		}

		try {
			new URL(nextUrl);
		} catch {
			saveError = 'Invalid URL (must include http:// or https://)';
			return;
		}

		isSaving = true;
		try {
			const result = await pingBaseUrl(nextUrl, { timeoutMs: 3000 });
			lastTest = result;

			baseUrlHistory.update((entries) => {
				const existingIndex = entries.findIndex((e) => e.url === nextUrl);
				const updated = {
					url: nextUrl,
					ok: result.ok,
					lastPingMs: result.pingMs,
					lastCheckedAt: result.checkedAt
				};
				if (existingIndex >= 0) {
					const next = [...entries];
					next.splice(existingIndex, 1);
					return [updated, ...next];
				}
				return [updated, ...entries];
			});

			if (!result.ok) {
				saveError = result.error ?? 'Connection test failed';
				return;
			}

			baseUrl.set(nextUrl);
			dispatch('close');
		} finally {
			isSaving = false;
		}
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
				type="url"
				placeholder="http://localhost:8000"
				class="input input-bordered"
			/>
		</div>

		{#if saveError}
			<div class="alert alert-error mt-4">
				<span>{saveError}</span>
			</div>
		{/if}

		{#if lastTest?.ok && lastTest.pingMs !== null}
			<div class="alert alert-success mt-4">
				<span>Connected in {lastTest.pingMs}ms</span>
			</div>
		{/if}

		<div class="mt-4">
			<div class="flex items-center justify-between">
				<div class="text-sm font-medium opacity-80">History</div>
				<button class="btn btn-xs" onclick={refreshHistoryPings} disabled={isRefreshingHistory}>
					Refresh
				</button>
			</div>

			{#if $baseUrlHistory.length === 0}
				<div class="text-sm opacity-60 mt-2">No saved Base URLs yet.</div>
			{:else}
				<div class="mt-2 space-y-2">
					{#each $baseUrlHistory as entry (entry.url)}
						<button
							class="btn btn-ghost btn-sm w-full justify-between"
							onclick={() => selectFromHistory(entry.url)}
							title={entry.url}
						>
							<span class="truncate max-w-[18rem] text-left">{entry.url}</span>
							<span class="text-xs opacity-70">
								{#if entry.ok === null}
									—
								{:else if entry.ok === false}
									Fail
								{:else if entry.lastPingMs !== null}
									{entry.lastPingMs}ms
								{:else}
									OK
								{/if}
							</span>
						</button>
					{/each}
				</div>
			{/if}
		</div>

		<div class="modal-action">
			<button class="btn" onclick={cancel}>Cancel</button>
			<button class="btn btn-primary" onclick={testAndSave} disabled={isSaving}>
				{#if isSaving}
					Testing...
				{:else}
					Test & Save
				{/if}
			</button>
		</div>
	</div>
</div>
