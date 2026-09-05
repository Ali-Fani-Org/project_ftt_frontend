#!/usr/bin/env node
/**
 * Crop test.svg to the rounded glass tile and drop the navy page background
 * so the mark sits on a transparent square (512×512 viewBox).
 */
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const srcPath = path.join(root, 'test.svg');
const outDir = path.join(root, 'src', 'lib', 'assets');
const outPath = path.join(outDir, 'brand-mark.svg');

let s = readFileSync(srcPath, 'utf8').replace(/\r\n/g, '\n');
s = s.replace(
	'width="1408" height="768" viewBox="0 0 1408 768"',
	'width="512" height="512" viewBox="448 128 512 512"'
);
s = s.replace(
	/\n  <!-- Dark navy background and subtle procedural texture -->\n  <g id="background-layer">[\s\S]*?<\/g>\n\n/,
	'\n\n'
);

mkdirSync(outDir, { recursive: true });
writeFileSync(outPath, s);
console.log('wrote', path.relative(root, outPath), `(${s.length} bytes)`);
console.log('background-layer present:', s.includes('background-layer'));
