import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// Everything is derived from disk so a new dependency, asset folder or audio
// file fails here until the ledger is updated. No hardcoded lists.
const root = process.cwd();
const read = (...p) => fs.readFileSync(path.join(root, ...p), 'utf8');
// Read per test so a missing ledger fails those tests, not the audio guard.
const readLedger = () => read('docs', 'licenses.md');

const subdirs = (rel) =>
  fs.readdirSync(path.join(root, rel), { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => `${rel}/${d.name}`);

describe('licence ledger', () => {
  it('every runtime dependency is in the ledger with its declared licence', () => {
    const ledgerLines = readLedger().split('\n');
    const deps = Object.keys(JSON.parse(read('package.json')).dependencies);
    expect(deps.length).toBeGreaterThan(0);
    for (const pkg of deps) {
      const { license } = JSON.parse(read('node_modules', pkg, 'package.json'));
      expect(license, `${pkg} declares no licence`).toBeTruthy();
      const found = ledgerLines.some((l) => l.includes(pkg) && l.includes(license));
      expect(found, `${pkg} (${license}) missing from docs/licenses.md`).toBe(true);
    }
  });

  it('every shipped asset folder is named in the ledger', () => {
    const ledger = readLedger();
    const dirs = [...subdirs('public'), ...subdirs('public/assets')];
    expect(dirs.length).toBeGreaterThan(0);
    for (const dir of dirs) {
      expect(ledger.includes(dir), `${dir} missing from docs/licenses.md`).toBe(true);
    }
  });

  it('every audio file has an ATTRIBUTIONS row', () => {
    const attributions = read('public', 'audio', 'ATTRIBUTIONS.md');
    const stems = new Set();
    for (const sub of ['sfx', 'music']) {
      // Audio only: sfx/ also holds a .gitkeep.
      const audio = fs.readdirSync(path.join(root, 'public/audio', sub)).filter((f) => /\.(mp3|ogg)$/.test(f));
      for (const f of audio) {
        stems.add(path.parse(f).name);
      }
    }
    expect(stems.size).toBeGreaterThan(0);
    for (const stem of stems) {
      expect(attributions.includes(`\`${stem}.`), `${stem} missing from ATTRIBUTIONS.md`).toBe(true);
    }
  });
});
