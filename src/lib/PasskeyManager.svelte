<script lang="ts">
	import { authStore } from './auth-context';

	interface PasskeyInfo {
		id: number;
		device_name: string;
		created_at: string;
		last_used_at: string;
	}

	let passkeys: PasskeyInfo[] = $state([]);
	let loading = $state(false);
	let registering = $state(false);
	let deviceName = $state('');
	let error = $state('');
	let success = $state('');

	async function loadPasskeys() {
		loading = true;
		try {
			passkeys = await authStore.listPasskeys();
		} catch {
			error = 'Failed to load passkeys';
		} finally {
			loading = false;
		}
	}

	async function handleRegister() {
		registering = true;
		error = '';
		success = '';

		const result = await authStore.registerPasskey(deviceName || undefined);
		if (result.success) {
			success = 'Passkey registered successfully!';
			deviceName = '';
			await loadPasskeys();
		} else {
			if ('error' in result) {
				error = result.error;
			}
		}

		registering = false;
	}

	async function handleDelete(id: number) {
		error = '';
		success = '';

		const result = await authStore.deletePasskey(id);
		if (result.success) {
			success = 'Passkey removed';
			await loadPasskeys();
		} else {
			if ('error' in result) {
				error = result.error;
			}
		}
	}

	function formatDate(iso: string): string {
		return new Date(iso).toLocaleDateString(undefined, {
			year: 'numeric',
			month: 'short',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	$effect(() => {
		loadPasskeys();
	});
</script>

<div class="passkey-manager">
	<h3>Passkeys</h3>

	{#if error}
		<div class="error" role="alert">{error}</div>
	{/if}

	{#if success}
		<div class="success" role="status">{success}</div>
	{/if}

	<!-- Register new passkey -->
	<div class="register-form">
		<input
			type="text"
			bind:value={deviceName}
			placeholder="Device name (optional)"
			disabled={registering}
		/>
		<button onclick={handleRegister} disabled={registering}>
			{registering ? 'Registering...' : '+ Add Passkey'}
		</button>
	</div>

	<!-- List existing passkeys -->
	{#if loading}
		<p>Loading passkeys...</p>
	{:else if passkeys.length === 0}
		<p class="empty">No passkeys registered yet.</p>
	{:else}
		<ul class="passkey-list">
			{#each passkeys as pk (pk.id)}
				<li>
					<div class="passkey-info">
						<strong>{pk.device_name || 'Unnamed passkey'}</strong>
						<span class="meta">
							Created {formatDate(pk.created_at)}
							· Last used {formatDate(pk.last_used_at)}
						</span>
					</div>
					<button class="delete-btn" onclick={() => handleDelete(pk.id)}>Remove</button>
				</li>
			{/each}
		</ul>
	{/if}
</div>

<style>
	.passkey-manager {
		margin-top: 1.5rem;
	}

	.passkey-manager h3 {
		margin-bottom: 0.75rem;
		font-size: 1.1rem;
	}

	.register-form {
		display: flex;
		gap: 0.5rem;
		margin-bottom: 1rem;
	}

	.register-form input {
		flex: 1;
		padding: 0.5rem 0.75rem;
		border: 1px solid #d1d5db;
		border-radius: 0.375rem;
		font-size: 0.875rem;
	}

	.register-form button {
		white-space: nowrap;
		padding: 0.5rem 1rem;
		background: #3b82f6;
		color: white;
		border: none;
		border-radius: 0.375rem;
		cursor: pointer;
		font-size: 0.875rem;
	}

	.register-form button:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.error {
		color: #dc2626;
		background: #fef2f2;
		padding: 0.5rem 0.75rem;
		border-radius: 0.375rem;
		margin-bottom: 0.75rem;
		font-size: 0.875rem;
	}

	.success {
		color: #16a34a;
		background: #f0fdf4;
		padding: 0.5rem 0.75rem;
		border-radius: 0.375rem;
		margin-bottom: 0.75rem;
		font-size: 0.875rem;
	}

	.empty {
		color: #6b7280;
		font-size: 0.875rem;
	}

	.passkey-list {
		list-style: none;
		padding: 0;
		margin: 0;
	}

	.passkey-list li {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0.75rem;
		border: 1px solid #e5e7eb;
		border-radius: 0.375rem;
		margin-bottom: 0.5rem;
	}

	.passkey-info strong {
		display: block;
		font-size: 0.875rem;
	}

	.passkey-info .meta {
		font-size: 0.75rem;
		color: #9ca3af;
	}

	.delete-btn {
		padding: 0.25rem 0.75rem;
		background: transparent;
		color: #dc2626;
		border: 1px solid #fca5a5;
		border-radius: 0.375rem;
		cursor: pointer;
		font-size: 0.8rem;
	}

	.delete-btn:hover {
		background: #fef2f2;
	}
</style>
