#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

try {
	const root = process.cwd();
	const pkgPath = path.join(root, 'package.json');
	const tauriPath = path.join(root, 'src-tauri', 'tauri.conf.json');
	const cargoPath = path.join(root, 'src-tauri', 'Cargo.toml');
	const cargoLockPath = path.join(root, 'src-tauri', 'Cargo.lock');

	if (!fs.existsSync(pkgPath)) throw new Error('package.json not found');
	const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
	const version = pkg.version;
	if (!version) throw new Error('version not found in package.json');

	if (fs.existsSync(tauriPath)) {
		const tauri = JSON.parse(fs.readFileSync(tauriPath, 'utf8'));
		tauri.version = version;
		fs.writeFileSync(tauriPath, JSON.stringify(tauri, null, 2) + '\n');
	}

	if (fs.existsSync(cargoPath)) {
		let cargo = fs.readFileSync(cargoPath, 'utf8');
		cargo = cargo.replace(/version\s*=\s*"[^"]+"/, `version = "${version}"`);
		fs.writeFileSync(cargoPath, cargo);
	}

	// Update Cargo.lock - find the time-tracker package and update its version
	if (fs.existsSync(cargoLockPath)) {
		let cargoLock = fs.readFileSync(cargoLockPath, 'utf8');
		// Match the [[package]] block for time-tracker and update its version
		cargoLock = cargoLock.replace(
			/(\[\[package\]\]\s*\nname\s*=\s*"app"\s*\nversion\s*=\s*")[^"]+(")/,
			`$1${version}$2`
		);
		fs.writeFileSync(cargoLockPath, cargoLock);
	}

	console.log('Versions synced to', version);
	process.exit(0);
} catch (err) {
	console.error('sync-version failed:', err && err.message ? err.message : err);
	process.exit(1);
}
