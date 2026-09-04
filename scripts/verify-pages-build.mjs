#!/usr/bin/env node
/**
 * verify-pages-build.mjs — local simulation of .github/workflows/gh-pages.yml
 *
 * Usage:
 *   node scripts/verify-pages-build.mjs --pages [--serve]   # web (PWA) target
 *   node scripts/verify-pages-build.mjs --tauri             # desktop regression gate
 *
 * --pages replicates the Pages workflow 1:1:
 *   BASE_PATH=/project_ftt_frontend ENABLE_PWA=true bun run build
 *   cp build/index.html build/404.html
 *   + static assertions (subpath assets, manifest scope, SW, fallback)
 *
 * --tauri replicates what release.yml / test-build.yml do (no BASE_PATH, no
 * ENABLE_PWA) and asserts the desktop output is unchanged: no SW/manifest,
 * no Pages subpath leaks.
 *
 * --serve (pages only) starts `vite preview` afterwards for the manual browser
 * checklist (DevTools → Application → Manifest/Service Workers, offline reload,
 * deep-link load). For a live Tauri run check use `bun tauri dev` separately —
 * it opens the desktop window and can't run headless inside this script.
 *
 * Fidelity limits: localhost allows SW (good) but can't replicate the real
 * https://<user>.github.io/project_ftt_frontend/ origin, Pages 404 handling,
 * or production backend CORS. Local green + one draft Pages deploy = proof.
 */

import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const buildDir = path.join(root, 'build');
const REPO_BASE = '/project_ftt_frontend';

const args = new Set(process.argv.slice(2));
const mode = args.has('--tauri') ? 'tauri' : 'pages';
const serve = args.has('--serve');

let failures = 0;
function check(name, ok, hint = '') {
	if (ok) {
		console.log(`  ✅ ${name}`);
	} else {
		failures += 1;
		console.log(`  ❌ ${name}${hint ? ` — ${hint}` : ''}`);
	}
}

function run(cmd, env) {
	console.log(`\n$ ${cmd}`);
	const res = spawnSync(cmd, {
		cwd: root,
		env: { ...process.env, ...env },
		stdio: 'inherit',
		shell: true
	});
	if (res.status !== 0) {
		console.error(`\nCommand failed with exit code ${res.status}: ${cmd}`);
		process.exit(res.status ?? 1);
	}
}

if (mode === 'pages') {
	console.log('Mode: pages (web/PWA target, mirrors gh-pages.yml)');
	rmSync(buildDir, { recursive: true, force: true });

	run('bun run build', { BASE_PATH: REPO_BASE, ENABLE_PWA: 'true' });

	// Pages SPA fallback (same step as the workflow)
	copyFileSync(path.join(buildDir, 'index.html'), path.join(buildDir, '404.html'));
	console.log('\nCreated build/404.html from build/index.html');

	console.log('\nAssertions (pages):');
	const indexHtml = readFileSync(path.join(buildDir, 'index.html'), 'utf8');

	check('build/index.html exists', existsSync(path.join(buildDir, 'index.html')));
	check('build/404.html exists (Pages SPA fallback)', existsSync(path.join(buildDir, '404.html')));

	check(
		'assets use Pages subpath',
		indexHtml.includes(`${REPO_BASE}/_app/`),
		`expected "${REPO_BASE}/_app/" in build/index.html`
	);
	check(
		'no bare root-absolute /_app/ asset refs',
		!/(["'])\/_app\//.test(indexHtml),
		'found href="/_app/..." or src="/_app/..." which 404s on project Pages'
	);

	const manifestPath = path.join(buildDir, 'manifest.webmanifest');
	check('manifest.webmanifest emitted', existsSync(manifestPath));
	if (existsSync(manifestPath)) {
		try {
			const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
			check('manifest.scope matches subpath', manifest.scope === `${REPO_BASE}/`, `got "${manifest.scope}"`);
			check(
				'manifest.start_url matches subpath',
				manifest.start_url === `${REPO_BASE}/`,
				`got "${manifest.start_url}"`
			);
		} catch (e) {
			check('manifest.webmanifest is valid JSON', false, String(e));
		}
	}

	const swPath = path.join(buildDir, 'sw.js');
	check('sw.js emitted (PWA)', existsSync(swPath));
	check(
		'sw.js registered under subpath scope',
		!existsSync(swPath) || readFileSync(swPath, 'utf8').length > 0,
		'sw.js is empty'
	);
	for (const icon of ['pwa-192x192.png', 'pwa-512x512.png', 'apple-touch-icon.png']) {
		check(`static/${icon} bundled`, existsSync(path.join(buildDir, icon)));
	}

	if (failures > 0) {
		console.error(`\n${failures} pages assertion(s) failed.`);
		process.exit(1);
	}
	console.log('\nAll pages assertions passed.');

	if (serve) {
		console.log(
			`\nStarting preview — open http://localhost:4173${REPO_BASE}/ and run the manual checklist:`
		);
		console.log('  1. App loads, login → dashboard works');
		console.log('  2. DevTools → Application → Manifest: no errors');
		console.log('  3. DevTools → Application → Service Workers: sw.js with scope ' + REPO_BASE + '/');
		console.log('  4. DevTools → Network → Offline → reload /timer → app-shell renders');
		console.log(`  5. Direct load http://localhost:4173${REPO_BASE}/timer renders (fallback)`);
		console.log('  6. Console has no __TAURI__ / autostart exceptions');
		run('bun run preview', { BASE_PATH: REPO_BASE });
	} else {
		console.log(`\nTip: re-run with --serve, then open http://localhost:4173${REPO_BASE}/ for the manual PWA checklist.`);
	}
} else {
	console.log('Mode: tauri (desktop regression gate, mirrors release.yml/test-build.yml env)');
	rmSync(buildDir, { recursive: true, force: true });

	// Deliberately NO BASE_PATH / ENABLE_PWA — exactly like the Tauri workflows.
	const env = { ...process.env };
	delete env.BASE_PATH;
	delete env.ENABLE_PWA;
	run('bun run build', {});

	console.log('\nAssertions (tauri regression):');
	const indexPath = path.join(buildDir, 'index.html');
	check('build/index.html exists', existsSync(indexPath));
	if (existsSync(indexPath)) {
		const html = readFileSync(indexPath, 'utf8');
		check('no Pages subpath leaks into desktop build', !html.includes(REPO_BASE));
	}
	check('no sw.js in desktop build (PWA skipped)', !existsSync(path.join(buildDir, 'sw.js')));
	check(
		'no manifest.webmanifest in desktop build (PWA skipped)',
		!existsSync(path.join(buildDir, 'manifest.webmanifest'))
	);
	check('no workbox-* in desktop build', !existsSync(path.join(buildDir, 'workbox-window.prod.es5.mjs')));

	if (failures > 0) {
		console.error(`\n${failures} tauri assertion(s) failed.`);
		process.exit(1);
	}
	console.log('\nTauri-mode build matches pre-PWA output shape.');
	console.log('For a live desktop run check: bun tauri dev');
}

// Keep TS happy about unused import in some editors.
void mkdirSync;
