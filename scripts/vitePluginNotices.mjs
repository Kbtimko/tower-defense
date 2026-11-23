// Vite build plugin: emit THIRD_PARTY_NOTICES.txt listing every npm package
// that reached the bundle, plus the code no package.json enumerates (Earcut,
// Matter.js and Simplify.js inside Phaser, Vite's modulepreload polyfill).
// MIT/ISC/OFL require the notice to travel with copies, and a build is a copy.

import fs from 'node:fs';
import { version as viteVersion } from 'vite';
import path from 'node:path';
import { createRequire } from 'node:module';
import { packageDirOf, formatNotices, collectPackages } from '../src/systems/thirdPartyNotices.js';
import { VENDORED_NOTICES } from '../src/data/vendoredNotices.js';

const LICENCE_FILE = /^(licen[cs]e|copying)(\..*)?$/i;

const readPkg = dir => JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));

// Node-style lookup from the parent's directory. Packages whose `exports`
// block package.json fall back to walking up node_modules folders by hand.
function resolveDep(name, fromDir) {
  try {
    return path.dirname(createRequire(path.join(fromDir, 'package.json')).resolve(`${name}/package.json`));
  } catch { /* exports-blocked or absent: walk */ }
  for (let dir = fromDir; ; dir = path.dirname(dir)) {
    const cand = path.join(dir, 'node_modules', name);
    if (fs.existsSync(path.join(cand, 'package.json'))) return cand;
    if (path.dirname(dir) === dir) return null;
  }
}

function readEntry(dir) {
  const pkg = readPkg(dir);
  const file = fs.readdirSync(dir).sort().find(f => LICENCE_FILE.test(f));
  if (!file) throw new Error(`third-party-notices: ${pkg.name} has no licence file`);
  const license = typeof pkg.license === 'string' ? pkg.license : (pkg.license && pkg.license.type) || 'UNKNOWN';
  return { name: pkg.name, version: pkg.version, license, text: fs.readFileSync(path.join(dir, file), 'utf8') };
}

export default function thirdPartyNotices() {
  return {
    name: 'third-party-notices',
    apply: 'build',
    generateBundle(_, bundle) {
      // getModuleIds also covers packages pulled in by CSS (@fontsource); a
      // tree-shaken package being listed is harmless, a missing one is not.
      const ids = new Set(this.getModuleIds());
      for (const chunk of Object.values(bundle)) {
        if (chunk.type === 'chunk') for (const id of Object.keys(chunk.modules)) ids.add(id);
      }
      const dirs = new Set();
      for (const id of ids) {
        const dir = packageDirOf(id);
        if (dir) dirs.add(dir);
      }
      const all = collectPackages([...dirs], readPkg, resolveDep);
      const entries = [...all].sort().map(readEntry);

      for (const v of VENDORED_NOTICES) {
        entries.push(v.version === null ? { ...v, version: viteVersion } : v);
      }

      this.emitFile({ type: 'asset', fileName: 'THIRD_PARTY_NOTICES.txt', source: formatNotices(entries) });
    },
  };
}
