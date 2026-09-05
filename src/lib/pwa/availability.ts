import { writable } from 'svelte/store';

/** Native Chrome/Edge install event is available (prompt() works). */
export const pwaNativeInstall = writable(false);
/** Show a manual “add to home screen” hint (iOS, or Android when BIP never fires). */
export const pwaManualInstall = writable(false);
/** A new service worker is waiting. */
export const pwaNeedRefresh = writable(false);

export function isStandalone(): boolean {
	if (typeof window === 'undefined') return false;
	const mm = window.matchMedia;
	return (
		(typeof mm === 'function' &&
			(mm('(display-mode: standalone)').matches ||
				mm('(display-mode: fullscreen)').matches ||
				mm('(display-mode: minimal-ui)').matches)) ||
		(window.navigator as { standalone?: boolean }).standalone === true
	);
}

export function isIosDevice(): boolean {
	if (typeof navigator === 'undefined') return false;
	return (
		/iphone|ipad|ipod/i.test(navigator.userAgent) ||
		(navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
	);
}

export function isAndroidDevice(): boolean {
	if (typeof navigator === 'undefined') return false;
	return /android/i.test(navigator.userAgent);
}

const DISMISS_KEY = 'pwa-install-dismissed-at';
const DISMISS_MS = 7 * 24 * 60 * 60 * 1000;

export function installHintDismissed(): boolean {
	try {
		const at = Number(localStorage.getItem(DISMISS_KEY) || '0');
		return at > 0 && Date.now() - at < DISMISS_MS;
	} catch {
		return false;
	}
}

export function dismissInstallHint() {
	try {
		localStorage.setItem(DISMISS_KEY, String(Date.now()));
	} catch {
		/* ignore */
	}
	pwaNativeInstall.set(false);
	pwaManualInstall.set(false);
}
