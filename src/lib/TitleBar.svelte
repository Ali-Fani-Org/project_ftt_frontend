<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { getCurrentWindow } from '@tauri-apps/api/window';
	import { minimizeToTray, closeToTray } from '$lib/stores';

	let appWindow: any;
	let title = '';
	let minimizeToTrayValue = false;
	let closeToTrayValue = false;

	const unsubscribeMin = minimizeToTray.subscribe(value => {
		minimizeToTrayValue = value;
	});

	const unsubscribeClose = closeToTray.subscribe(value => {
		closeToTrayValue = value;
	});

	onDestroy(() => {
		unsubscribeMin();
		unsubscribeClose();
	});

	onMount(async () => {
		appWindow = getCurrentWindow();
		title = await appWindow.title();
	});

	function minimize() {
		console.log('Minimize clicked, minimizeToTrayValue:', minimizeToTrayValue);
		if (minimizeToTrayValue) {
			console.log('Hiding window to tray');
			appWindow?.hide();
		} else {
			console.log('Minimizing window normally');
			appWindow?.minimize();
		}
	}

	function toggleMaximize() {
		appWindow?.toggleMaximize();
	}

	function close() {
		if (closeToTrayValue) {
			appWindow?.hide();
		} else {
			appWindow?.close();
		}
	}
</script>

<div class="titlebar" data-tauri-drag-region>
	<div class="title-container">
		<span class="title-text">{title}</span>
	</div>
	<div class="controls">
		<button id="titlebar-minimize" on:click={minimize} title="minimize" aria-label="Minimize window">
			<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24">
				<path fill="currentColor" d="M19 13H5v-2h14z" />
			</svg>
		</button>
		<button id="titlebar-maximize" on:click={toggleMaximize} title="maximize" aria-label="Maximize window">
			<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24">
				<path fill="currentColor" d="M4 4h16v16H4zm2 4v10h12V8z" />
			</svg>
		</button>
		<button id="titlebar-close" on:click={close} title="close" aria-label="Close window">
			<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24">
				<path fill="currentColor" d="M13.46 12L19 17.54V19h-1.46L12 13.46L6.46 19H5v-1.46L10.54 12L5 6.46V5h1.46L12 10.54L17.54 5H19v1.46z" />
			</svg>
		</button>
	</div>
</div>

<style>
	.titlebar {
		height: 30px;
		background: hsl(var(--b1));
		color: hsl(var(--bc));
		border-bottom: 1px solid hsl(var(--b3));
		display: flex;
		align-items: center;
		justify-content: center;
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		z-index: 1000;
		user-select: none;
		-webkit-user-select: none;
		cursor: grab;
	}

	.title-container {
		flex: 1;
		display: flex;
		justify-content: center;
		align-items: center;
	}

	.title-text {
		font-size: 14px;
		font-weight: 500;
	}

	.controls {
		position: absolute;
		right: 0;
		display: flex;
		align-items: center;
	}

	.controls {
		display: flex;
		align-items: center;
	}

	.controls button {
		width: 30px;
		height: 30px;
		border: none;
		background: transparent;
		color: hsl(var(--bc));
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		transition: background-color 0.2s;
	}

	.controls button:hover {
		background: hsl(var(--b2));
	}

	#titlebar-close:hover {
		background: hsl(var(--er));
		color: hsl(var(--erc));
	}

	/* Enable touch/pen drag on Windows */
	*[data-tauri-drag-region] {
		app-region: drag;
	}
</style>