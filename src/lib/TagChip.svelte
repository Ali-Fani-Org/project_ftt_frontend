<script lang="ts">
	import type { Tag } from './api';
	import { getTagIcon } from './tagIcons';

	interface Props {
		tag: Tag;
		size?: 'xs' | 'sm' | 'md';
	}

	let { tag, size = 'sm' }: Props = $props();

	const sizes = {
		xs: 'text-[10px] px-1.5 py-0.5 gap-1',
		sm: 'text-xs px-2 py-0.5 gap-1',
		md: 'text-sm px-2.5 py-1 gap-1.5'
	};

	const iconSizes = { xs: 11, sm: 12, md: 15 };
	const Icon = $derived(getTagIcon(tag.icon));
</script>

<span
	class="inline-flex items-center rounded-full font-medium whitespace-nowrap {sizes[size]}"
	style="background:{tag.color}1f;color:{tag.color};border:1px solid {tag.color}55;"
>
	<Icon size={iconSizes[size]} strokeWidth={2} />
	{tag.title}
</span>