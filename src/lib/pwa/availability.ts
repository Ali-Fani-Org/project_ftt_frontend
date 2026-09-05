import { writable } from 'svelte/store';

/** Native Chrome/Edge install event is available (prompt() works). */
export const pwaNativeInstall = writable(false);
/** Manual install hint (iOS Share sheet, or Android menu if BIP never fires). */
export const pwaManualInstall = writable(false);
/** A new service worker is waiting. */
export const pwaNeedRefresh = writable(false);
/** True when this document is the installed app (standalone / WCO / related apps). */
export const pwaIsInstalled = writable(false);

export function isStandalone(): boolean {
	if (typeof window === 'undefined') return false;
	const mm = window.matchMedia;
	const standalone =
		typeof mm === 'function' &&
		(mm('(display-mode: standalone)').matches ||
			mm('(display-mode: fullscreen)').matches ||
			mm('(display-mode: window-controls-overlay)').matches);
	const iosStandalone = (window.navigator as { standalone?: boolean }).standalone === true;
	return Boolean(standalone || iosStandalone);
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

type RelatedApp = { platform?: string; url?: string; id?: string };

export async function checkInstalled(): Promise<boolean> {
	if (typeof window === 'undefined') return false;
	if (isStandalone()) {
		pwaIsInstalled.set(true);
		pwaNativeInstall.set(false);
		pwaManualInstall.set(false);
		return true;
	}
	try {
		const nav = navigator as Navigator & {
			getInstalledRelatedApps?: () => Promise<RelatedApp[]>;
		};
		if (typeof nav.getInstalledRelatedApps === 'function') {
			const apps = await nav.getInstalledRelatedApps();
			if (Array.isArray(apps) && apps.length > 0) {
				pwaIsInstalled.set(true);
				pwaNativeInstall.set(false);
				pwaManualInstall.set(false);
				return true;
			}
		}
	} catch {
		/* API missing or blocked */
	}
	pwaIsInstalled.set(false);
	return false;
}

const DISMISS_KEY = 'pwa-install-dismissed-at';
const DISMISS_MS = 30 * 60 * 1000; // 30 minutes — keep asking if they never installed

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
