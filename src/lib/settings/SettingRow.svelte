<script lang="ts">
	import type { Snippet, Component } from 'svelte';

	let {
		icon: Icon,
		title,
		description,
		children
	}: {
		icon?: Component;
		title: string;
		description?: string;
		children: Snippet;
	} = $props();
</script>

<div class="flex items-center justify-between gap-4 py-3">
	<div class="flex min-w-0 items-start gap-3">
		{#if Icon}
			<span
				class="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-base-content/10 text-base-content"
			>
				<Icon size={16} />
			</span>
		{/if}
		<div class="min-w-0">
			<p class="text-sm font-medium">{title}</p>
			{#if description}
				<p class="mt-0.5 text-xs text-base-content/60">{description}</p>
			{/if}
		</div>
	</div>
	<div class="shrink-0">{@render children()}</div>
</div>
