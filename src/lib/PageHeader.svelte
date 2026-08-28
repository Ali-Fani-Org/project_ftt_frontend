<script lang="ts">
	import type { Component, Snippet } from 'svelte';
	let {
		icon: Icon,
		title,
		subtitle = '',
		children
	}: {
		icon: Component;
		title: string;
		subtitle?: string;
		children?: Snippet;
	} = $props();
</script>

<!--
  Theme-proof by design: the icon tile uses base-content (the theme's ink)
  for both the tile wash and the icon. Unlike per-color tints (e.g. text-info
  on bg-info/10), this keeps full contrast in every built-in and custom theme —
  a light-blue info on the aqua theme can't wash out here.
-->
<header class="page-header flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
	<div class="flex items-center gap-3.5 min-w-0">
		<div
			class="w-10 h-10 rounded-2xl bg-base-content/10 text-base-content flex items-center justify-center shrink-0 ring-1 ring-inset ring-base-content/10 shadow-sm"
		>
			<Icon class="w-6 h-6" />
		</div>
		<div class="min-w-0">
			<h1 class="text-2xl font-bold tracking-tight leading-tight truncate">{title}</h1>
			{#if subtitle}
				<p class="text-sm text-base-content/60 mt-0.5 truncate">{subtitle}</p>
			{/if}
		</div>
	</div>
	<div class="flex items-center gap-2 shrink-0">
		{@render children?.()}
	</div>
</header>

<style>
	/* Keep headings legible over animated canvases without hiding the animation. */
	.page-header {
		position: relative;
		isolation: isolate;
		padding: 0.65rem 0.75rem;
		margin: -0.65rem -0.75rem;
		border: 1px solid color-mix(in oklch, oklch(var(--bc)) 12%, transparent);
		border-radius: 1rem;
		background: color-mix(in oklch, oklch(var(--b1)) 72%, transparent);
		box-shadow: 0 0.5rem 1.5rem color-mix(in oklch, oklch(var(--b1)) 18%, transparent);
		backdrop-filter: blur(12px) saturate(115%);
		-webkit-backdrop-filter: blur(12px) saturate(115%);
	}

	.page-header::before {
		content: '';
		position: absolute;
		inset: 0;
		z-index: -1;
		border-radius: inherit;
		background: color-mix(in oklch, oklch(var(--b1)) 18%, transparent);
		pointer-events: none;
	}

	.page-header h1,
	.page-header p {
		text-shadow: 0 1px 2px color-mix(in oklch, oklch(var(--b1)) 45%, transparent);
	}
</style>
