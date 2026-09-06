/**
 * TEMPORARY gate: passkey (WebAuthn) ceremonies are disabled on web builds.
 *
 * The backend RP ID is still bound to the pre-move setup, so registration
 * and authentication ceremonies fail in browsers. The Tauri desktop shell
 * keeps passkeys enabled.
 *
 * To re-enable on web after the RP ID migration (which requires users to
 * re-register): delete this module and remove its `disabled` bindings in
 * `src/routes/+page.svelte` (passkey sign-in) and
 * `src/lib/PasskeyManager.svelte` (registration/management).
 */
export function passkeysEnabled(): boolean {
	if (typeof window === 'undefined') return false;
	const w = window as unknown as Record<string, unknown>;
	return Boolean(w.__TAURI_INTERNALS__ || w.__TAURI__ || w.isTauri);
}
