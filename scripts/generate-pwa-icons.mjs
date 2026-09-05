#!/usr/bin/env node
/**
 * generate-pwa-icons.mjs — rasterize src/lib/assets/brand-mark.svg into PWA
 * and Tauri icon slots.
 *
 * The SVG is a transparent square around the rounded glass tile. Purpose:any
 * icons keep that alpha. Maskable / Apple-touch flatten onto a deep navy
 * sampled from the mark (iOS ignores alpha; maskable crops ~10% off each edge).
 *
 * Usage: node ./scripts/generate-pwa-icons.mjs
 * Re-run after changing test.svg (scripts/prepare-brand-mark.mjs) or the mark.
 */
import sharp from 'sharp';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

await import(pathToFileURL(path.join(process.cwd(), 'scripts', 'prepare-brand-mark.mjs')).href);

const root = process.cwd();
const SRC = path.join(root, 'src', 'lib', 'assets', 'brand-mark.svg');
const STATIC = path.join(root, 'static');
const TAURI_ICON = path.join(root, 'src-tauri', 'icons', 'icon.png');
const BRAND_BG = { r: 14, g: 28, b: 48, alpha: 1 }; // navy from the mark

async function raster(size, { flatten = false } = {}) {
	let img = sharp(SRC, { density: 400 }).resize(size, size, {
		fit: 'contain',
		background: { r: 0, g: 0, b: 0, alpha: 0 }
	});
	if (flatten) {
		img = img.flatten({ background: BRAND_BG });
	}
	return img.png();
}

const pwa192 = path.join(STATIC, 'pwa-192x192.png');
const pwa512 = path.join(STATIC, 'pwa-512x512.png');
const maskable = path.join(STATIC, 'maskable-icon.png');
const apple = path.join(STATIC, 'apple-touch-icon.png');
const favicon = path.join(STATIC, 'favicon.png');
const inApp = path.join(root, 'src', 'lib', 'assets', 'brand-mark.png');

await (await raster(192)).toFile(pwa192);
await (await raster(512)).toFile(pwa512);
await (await raster(512, { flatten: true })).toFile(maskable);
await (await raster(180, { flatten: true })).toFile(apple);
await (await raster(32)).toFile(favicon);
await (await raster(256)).toFile(inApp);
await (await raster(512)).toFile(TAURI_ICON);

console.log('PWA icons written to static/:');
for (const f of [pwa192, pwa512, maskable, apple, favicon, inApp, TAURI_ICON]) {
	const m = await sharp(f).metadata();
	console.log(`  ${path.relative(root, f)}: ${m.width}x${m.height} alpha=${m.hasAlpha}`);
}

const tauri = spawnSync(
	'bun',
	['x', '--bun', 'tauri', 'icon', TAURI_ICON],
	{ cwd: root, stdio: 'inherit', shell: true }
);
if (tauri.status !== 0) {
	console.warn('tauri icon generation skipped or failed — src-tauri/icons/icon.png was still updated.');
}
