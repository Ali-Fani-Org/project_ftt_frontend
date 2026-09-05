#!/usr/bin/env node
/**
 * Install-dialog screenshots for the web manifest.
 *
 * Chrome's richer PWA install UI on mobile needs at least one screenshot
 * whose form_factor is omitted or not "wide". Desktop needs form_factor
 * "wide". Both are generated here from the brand mark.
 */
import sharp from 'sharp';
import path from 'node:path';

const root = process.cwd();
const markPath = path.join(root, 'src', 'lib', 'assets', 'brand-mark.png');
const outDir = path.join(root, 'static');

async function frame({ width, height, markSize, markTop, titleY, subY, out, extra = '' }) {
	const mark = await sharp(markPath).resize(markSize, markSize).png().toBuffer();
	const markX = Math.round((width - markSize) / 2);
	const svg = Buffer.from(`
<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${width}" height="${height}" fill="#0e1c30"/>
  <rect x="${Math.round(width * 0.08)}" y="${Math.round(height * 0.08)}"
        width="${Math.round(width * 0.84)}" height="${Math.round(height * 0.84)}"
        rx="${Math.round(width * 0.04)}" fill="#12243d"/>
  <text x="50%" y="${titleY}" text-anchor="middle"
        font-family="Segoe UI, Arial, sans-serif" font-size="${Math.round(width * 0.045)}"
        font-weight="700" fill="#e8f4ff">Time Tracker</text>
  <text x="50%" y="${subY}" text-anchor="middle"
        font-family="Segoe UI, Arial, sans-serif" font-size="${Math.round(width * 0.028)}"
        fill="#8fb4c9">Track time, manage tasks and stay in flow.</text>
  ${extra}
</svg>`);
	await sharp(svg)
		.composite([{ input: mark, left: markX, top: markTop }])
		.png()
		.toFile(path.join(outDir, out));
}

await frame({
	width: 540,
	height: 720,
	markSize: 220,
	markTop: 168,
	titleY: 460,
	subY: 500,
	out: 'screenshot-narrow.png',
	extra: `<rect x="170" y="540" width="200" height="48" rx="24" fill="#3dcced"/>
  <text x="50%" y="572" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif"
        font-size="18" font-weight="600" fill="#0e1c30">Start timer</text>`
});

await frame({
	width: 1280,
	height: 720,
	markSize: 280,
	markTop: 150,
	titleY: 500,
	subY: 548,
	out: 'screenshot-wide.png'
});

for (const f of ['screenshot-narrow.png', 'screenshot-wide.png']) {
	const m = await sharp(path.join(outDir, f)).metadata();
	console.log(`  static/${f}: ${m.width}x${m.height}`);
}
