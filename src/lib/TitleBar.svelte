<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { getCurrentWindow } from '@tauri-apps/api/window';
	import { minimizeToTray, closeToTray } from '$lib/stores';
	import { Minus, Maximize2, Minimize2, X, Pin, PinOff } from '@lucide/svelte';

	interface Props {
		window?: any;
	}

	let { window: propWindow }: Props = $props();

	let appWindow: any;
	let title = $state('');
	let minimizeToTrayValue = $state(false);
	let closeToTrayValue = $state(false);
	let isTimeEntriesWindow = $state(false);
	let isAlwaysOnTop = $state(false);
	let isMaximized = $state(false);
	let unlistenResize: (() => void) | null = $state(null);

	const unsubscribeMin = minimizeToTray.subscribe(value => {
		minimizeToTrayValue = value;
	});

	const unsubscribeClose = closeToTray.subscribe(value => {
		closeToTrayValue = value;
	});

	onDestroy(() => {
		unsubscribeMin();
		unsubscribeClose();
		if (unlistenResize) {
			unlistenResize();
		}
	});

	onMount(async () => {
	  try {
	    appWindow = propWindow || getCurrentWindow();
	    console.log('TitleBar: Got window:', appWindow, 'propWindow provided:', !!propWindow);
	    title = await appWindow.title();
	    console.log('TitleBar: Window title:', title);
	    isTimeEntriesWindow = title === 'Time Entries';
	    isAlwaysOnTop = await appWindow.isAlwaysOnTop();
	    isMaximized = await appWindow.isMaximized();
	    console.log('TitleBar: Initialized for window:', title);
	  } catch (error) {
	    console.error('TitleBar: Failed to initialize:', error);
	  }

	  // Listen for window resize/maximize events to update icon state
	  unlistenResize = await appWindow.listen('tauri://resize', async () => {
	    isMaximized = await appWindow?.isMaximized();
	  });
	});

	function minimize() {
		console.log('Minimize clicked, minimizeToTrayValue:', minimizeToTrayValue);
		console.log('appWindow:', appWindow);
		if (minimizeToTrayValue) {
			console.log('Hiding window to tray');
			appWindow?.hide();
		} else {
			console.log('Minimizing window normally');
			appWindow?.minimize();
		}
	}

	async function toggleMaximize() {
		console.log('Toggle maximize clicked');
		console.log('appWindow:', appWindow);
		await appWindow?.toggleMaximize();
		// Update the maximized state after toggling
		isMaximized = await appWindow?.isMaximized();
		console.log('Window maximized state:', isMaximized);
	}

	function close() {
	  console.log('Close clicked, closeToTrayValue:', closeToTrayValue);
	  console.log('appWindow:', appWindow);
	  if (closeToTrayValue) {
	    console.log('Hiding window to tray');
	    appWindow?.hide();
	  } else {
	    console.log('Closing window');
	    appWindow?.close();
	  }
	}

	async function toggleAlwaysOnTop() {
	  console.log('Toggle always on top clicked');
	  console.log('appWindow:', appWindow);
	  isAlwaysOnTop = !isAlwaysOnTop;
	  console.log('Setting always on top to:', isAlwaysOnTop);
	  await appWindow?.setAlwaysOnTop(isAlwaysOnTop);
	}
</script>

<div class="titlebar" data-tauri-drag-region>
  <div class="title-container">
    <span class="title-text">{title}</span>
  </div>
  <div class="controls">
    {#if !isTimeEntriesWindow}
      <button id="titlebar-minimize" onclick={minimize} title="minimize" aria-label="Minimize window" class="hover:bg-base-200">
        <Minus size={16} />
      </button>
    {/if}
    {#if isTimeEntriesWindow}
      <button
        id="titlebar-pin"
        onclick={toggleAlwaysOnTop}
        title={isAlwaysOnTop ? "unpin window" : "pin window on top"}
        aria-label="Toggle always on top"
        class="pin-button {isAlwaysOnTop ? 'active' : ''} hover:bg-base-200"
      >
        {#if isAlwaysOnTop}
          <Pin size={16} class="toggle-icon-active" />
        {:else}
          <PinOff size={16} class="toggle-icon-inactive" />
        {/if}
      </button>
    {/if}
    <button
      id="titlebar-maximize"
      onclick={toggleMaximize}
      title={isMaximized ? "restore" : "maximize"}
      aria-label={isMaximized ? "Restore window" : "Maximize window"}
      class="hover:bg-base-200"
    >
      {#if isMaximized}
        <Minimize2 size={16} />
      {:else}
        <Maximize2 size={16} />
      {/if}
    </button>
    <button id="titlebar-close" onclick={close} title="close" aria-label="Close window" class="hover:bg-base-200">
      <X size={16} />
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
		right: 4px;
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
		border-radius: 4px;
		position: relative;
	}

	/* Close button uses default hover effect */

	.pin-button {
		transition: all 0.2s ease;
	}

	.pin-button.active {
		background: hsl(var(--p));
		color: hsl(var(--pc));
	}

	.pin-button.active:hover {
		background: hsl(var(--pf));
	}

	/* Toggle icon colors */
	.toggle-icon-inactive {
		color: hsl(var(--n)); /* Neutral color for inactive state */
	}

	.toggle-icon-active {
		color: white;
		background: hsl(var(--a)); /* Accent color fill for active state */
		padding: 2px;
		border-radius: 2px;
	}


	/* Enable touch/pen drag on Windows */
	*[data-tauri-drag-region] {
		app-region: drag;
	}
</style>