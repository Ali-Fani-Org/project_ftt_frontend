<script lang="ts">
	import markUrl from '$lib/assets/brand-mark.png';

	let {
		size = 40,
		running = false,
		class: className = ''
	}: {
		size?: number;
		running?: boolean;
		class?: string;
	} = $props();
</script>

<img
	src={markUrl}
	width={size}
	height={size}
	alt=""
	draggable="false"
	class="brand-mark {running ? 'is-running' : ''} {className}"
	style="width:{size}px;height:{size}px"
/>

<style>
	.brand-mark {
		display: block;
		flex-shrink: 0;
		border-radius: 22%;
		object-fit: cover;
	}

	.brand-mark.is-running {
		animation: mark-pulse 2.4s ease-in-out infinite;
	}

	@keyframes mark-pulse {
		50% {
			filter: brightness(1.14);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.brand-mark.is-running {
			animation: none;
		}
	}
</style>
