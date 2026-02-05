<script lang="ts">
	import { toastStore } from './toast';
	import { slide, fade } from 'svelte/transition';

	let toasts = $state($toastStore);

	// Subscribe to store changes
	$effect(() => {
		toasts = $toastStore;
	});

	// Auto-dismiss toasts
	$effect(() => {
		toasts.forEach((toast) => {
			if (toast.timeout && toast.timeout > 0) {
				setTimeout(() => {
					toastStore.remove(toast.id);
				}, toast.timeout);
			}
		});
	});

	function getToastClass(type: string): string {
		switch (type) {
			case 'success':
				return 'alert-success';
			case 'error':
				return 'alert-error';
			case 'warning':
				return 'alert-warning';
			case 'info':
			default:
				return 'alert-info';
		}
	}

	function getToastIcon(type: string): string {
		switch (type) {
			case 'success':
				return `<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>`;
			case 'error':
				return `<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>`;
			case 'warning':
				return `<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>`;
			case 'info':
			default:
				return `<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>`;
		}
	}

	function dismissToast(id: string) {
		toastStore.remove(id);
	}
</script>

{#if toasts.length > 0}
	<div class="toast toast-top toast-end z-[100] gap-2 p-4">
		{#each toasts as toast (toast.id)}
			<div
				class="alert {getToastClass(toast.type)} shadow-lg"
				transition:slide={{ duration: 200 }}
			>
				<div class="flex items-center gap-2">
					<span>{@html getToastIcon(toast.type)}</span>
					<span>{toast.message}</span>
				</div>
				<button
					class="btn btn-ghost btn-xs btn-circle"
					onclick={() => dismissToast(toast.id)}
					aria-label="Dismiss"
				>
					<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
					</svg>
				</button>
			</div>
		{/each}
	</div>
{/if}

<style>
	.toast {
		position: fixed;
		top: 1rem;
		right: 1rem;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
</style>
