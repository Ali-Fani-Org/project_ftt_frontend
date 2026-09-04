#!/usr/bin/env node
/**
 * generate-pwa-icons.mjs — derive correctly-sized PWA icons from the Tauri
 * app icon (src-tauri/icons/icon.png, 512x512 with alpha).
 *
 * Why: Chrome only treats a manifest icon as usable when the file's REAL
 * pixel dimensions match (at least) the declared size. A 512px file labeled
 * 192x192 does NOT satisfy the 192px requirement, which silently kills the
 * install prompt with no console error.
 *
 * Outputs (all in static/):
 *   pwa-192x192.png   exact 192x192, transparency kept (purpose: any)
 *   pwa-512x512.png   exact 512x512, transparency kept (purpose: any)
 *   maskable-icon.png 512x512 full-bleed brand background, logo at ~80%
 *                     (purpose: maskable — OS crops ~10% off every edge)
 *   apple-touch-icon.png 180x180 flattened on white (iOS ignores alpha)
 *
 * Usage: node ./scripts/generate-pwa-icons.mjs
 * Re-run after changing the source artwork, then rebuild.
 */
import sharp from 'sharp';
import path from 'node:path';

const root = process.cwd();
const SRC = path.join(root, 'src-tauri', 'icons', 'icon.png');
const OUT = path.join(root, 'static');
const BRAND_BG = { r: 225, g: 29, b: 72, alpha: 1 }; // theme_color #e11d48

const src = sharp(SRC);
const meta = await src.metadata();
if (meta.width !== 512 || meta.height !== 512) {
	console.warn(`Unexpected source size ${meta.width}x${meta.height} (expected 512x512)`);
}

// 1. Plain sizes (purpose: any) — keep alpha.
await sharp(SRC).resize(192, 192).png().toFile(path.join(OUT, 'pwa-192x192.png'));
await sharp(SRC).resize(512, 512).png().toFile(path.join(OUT, 'pwa-512x512.png'));

// 2. Maskable: full-bleed brand background + logo at 80% centered.
const logo = await sharp(SRC).resize(410, 410).png().toBuffer();
await sharp({
	create: { width: 512, height: 512, channels: 4, background: BRAND_BG }
})
	.composite([{ input: logo, left: 51, top: 51 }])
	.png()
	.toFile(path.join(OUT, 'maskable-icon.png'));

// 3. Apple touch: flattened on white, exact 180x180.
await sharp(SRC)
	.flatten({ background: { r: 255, g: 255, b: 255 } })
	.resize(180, 180)
	.png()
	.toFile(path.join(OUT, 'apple-touch-icon.png'));

console.log('PWA icons written to static/:');
for (const f of ['pwa-192x192.png', 'pwa-512x512.png', 'maskable-icon.png', 'apple-touch-icon.png']) {
	const m = await sharp(path.join(OUT, f)).metadata();
	console.log(`  ${f}: ${m.width}x${m.height}`);
}
