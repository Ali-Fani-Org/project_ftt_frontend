<script lang="ts">
	import type { Snippet, Component } from 'svelte';

	let {
		id,
		icon: Icon,
		title,
		description,
		children
	}: {
		id: string;
		icon: Component;
		title: string;
		description?: string;
		children: Snippet;
	} = $props();
</script>

<section {id} class="card scroll-mt-28 border border-base-300 bg-base-100 shadow-sm">
	<div class="card-body gap-0 p-5 sm:p-6">
		<div class="mb-1 flex items-center gap-3">
			<span
				class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-base-content/10 text-base-content"
			>
				<Icon size={20} />
			</span>
			<div class="min-w-0">
				<h2 class="card-title text-lg">{title}</h2>
				{#if description}
					<p class="text-sm text-base-content/60">{description}</p>
				{/if}
			</div>
		</div>
		<div class="mt-3">{@render children()}</div>
	</div>
</section>
