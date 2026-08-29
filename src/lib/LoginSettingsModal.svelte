<script lang="ts">
	import { baseUrl, baseUrlHistory } from './stores';
	import { createEventDispatcher } from 'svelte';
	import { onMount } from 'svelte';
	import { pingBaseUrl, type BaseUrlPingResult } from './network';
	import { createForm } from '@tanstack/svelte-form';

	const dispatch = createEventDispatcher();

	let saveError = $state('');
	let lastTest = $state<BaseUrlPingResult | null>(null);
	let isRefreshingHistory = $state(false);

	const normalizeBaseUrl = (value: string) => value.trim().replace(/\/+$/, '');

	// TanStack Form: validation lives in the field validator, the submit handler
	// owns the ping → history → save flow.
	const form = createForm(() => ({
		defaultValues: {
			baseUrl: $baseUrl
		},
		onSubmit: async ({ value }) => {
			saveError = '';
			lastTest = null;

			const nextUrl = normalizeBaseUrl(value.baseUrl);
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
		}
	}));

	const isSubmitting = form.useSelector((state) => state.isSubmitting);

	function selectFromHistory(url: string) {
		form.setFieldValue('baseUrl', url);
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

	function cancel() {
		form.reset();
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
			<form.Field
				name="baseUrl"
				validators={{
					onChange: ({ value }) => {
						const url = normalizeBaseUrl(String(value));
						if (!url) return 'Base URL is required';
						try {
							new URL(url);
						} catch {
							return 'Invalid URL (must include http:// or https://)';
						}
						return undefined;
					}
				}}
			>
				{#snippet children(field)}
					<input
						id="baseUrl"
						type="url"
						placeholder="https://hr.alpharency.com"
						class="input input-bordered {field.state.meta.errors.length ? 'input-error' : ''}"
						name={field.name}
						value={field.state.value}
						onblur={field.handleBlur}
						oninput={(e) => field.handleChange(e.currentTarget.value)}
					/>
					{#if field.state.meta.errors.length}
						<div class="label">
							<span class="label-text-alt text-error">{field.state.meta.errors[0]}</span>
						</div>
					{/if}
				{/snippet}
			</form.Field>
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
			<button class="btn btn-primary" onclick={() => form.handleSubmit()} disabled={isSubmitting.current}>
				{#if isSubmitting.current}
					Testing...
				{:else}
					Test & Save
				{/if}
			</button>
		</div>
	</div>
</div>
