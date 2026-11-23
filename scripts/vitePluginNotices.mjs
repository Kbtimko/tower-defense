// Vite build plugin: emit THIRD_PARTY_NOTICES.txt listing every npm package
// that reached the bundle, plus the code no package.json enumerates (Earcut
// inside Phaser, Vite's modulepreload polyfill). MIT/ISC/OFL require the
// notice to travel with copies, and a build is a copy.

import fs from 'node:fs';
import path from 'node:path';
import { packageDirOf, formatNotices } from '../src/systems/thirdPartyNotices.js';
import { VENDORED_NOTICES } from '../src/data/vendoredNotices.js';

const LICENCE_FILE = /^(licen[cs]e|copying)(\..*)?$/i;

function readEntry(dir) {
  const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
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
      // dist/phaser.esm.js (our entry via package.json "module") inlines
      // Phaser's npm dependencies instead of importing them, so they never
      // show up as module ids. Their code is in the bundle; list them.
      for (const dir of [...dirs]) {
        const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
        if (pkg.name !== 'phaser') continue;
        for (const dep of Object.keys(pkg.dependencies || {})) dirs.add(path.join(path.dirname(dir), dep));
      }
      const entries = [...dirs].map(readEntry);

      const viteVersion = JSON.parse(fs.readFileSync(path.resolve('node_modules/vite/package.json'), 'utf8')).version;
      for (const v of VENDORED_NOTICES) {
        entries.push(v.version === null ? { ...v, version: viteVersion } : v);
      }

      this.emitFile({ type: 'asset', fileName: 'THIRD_PARTY_NOTICES.txt', source: formatNotices(entries) });
    },
  };
}
