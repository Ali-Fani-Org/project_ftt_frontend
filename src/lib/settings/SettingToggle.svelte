<script lang="ts">
	// Custom toggle switch. Pure CSS pill + knob (a positioned span), no native
	// checkbox and no appearance/box-shadow tricks — daisyUI toggles can render
	// half-applied in the Tauri WebView2 webview, so this renders reliably
	// everywhere and always reflects the bound `checked` state.
	let {
		checked,
		onChange,
		label
	}: {
		checked: boolean;
		onChange: (next: boolean) => void;
		label?: string;
	} = $props();
</script>

<button
	type="button"
	role="switch"
	aria-checked={checked}
	aria-label={label}
	class="inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors duration-150 {checked
		? 'border-primary bg-primary'
		: 'border-base-content/20 bg-base-content/20'}"
	onclick={() => onChange(!checked)}
>
	<span
		class="inline-block h-4 w-4 rounded-full bg-base-100 shadow-sm transition-transform duration-150 {checked
			? 'translate-x-5'
			: 'translate-x-1'}"
	></span>
</button>
