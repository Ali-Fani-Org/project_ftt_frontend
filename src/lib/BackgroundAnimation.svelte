<script lang="ts">
	import { backgroundAnimationStyle, oceanWaveCharacter } from '$lib/stores';
	import AuroraDrift from '$lib/backgrounds/AuroraDrift.svelte';
	import WaveGrid from '$lib/backgrounds/WaveGrid.svelte';
	import BokehFloat from '$lib/backgrounds/BokehFloat.svelte';
	import Ocean from '$lib/backgrounds/Ocean.svelte';
	import Nebula from '$lib/backgrounds/Nebula.svelte';
	import Lattice from '$lib/backgrounds/Lattice.svelte';
</script>

{#if $backgroundAnimationStyle === 'wave'}
	<WaveGrid />
{:else if $backgroundAnimationStyle === 'bokeh'}
	<BokehFloat />
{:else if $backgroundAnimationStyle === 'ocean'}
	<Ocean character={$oceanWaveCharacter} />
{:else if $backgroundAnimationStyle === 'nebula'}
	<Nebula />
{:else if $backgroundAnimationStyle === 'lattice'}
	<Lattice />
{:else}
	<AuroraDrift />
{/if}
