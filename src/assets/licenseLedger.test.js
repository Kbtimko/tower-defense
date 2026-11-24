import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// Everything is derived from disk so a new dependency, asset folder or audio
// file fails here until the ledger is updated. No hardcoded lists.
const root = process.cwd();
const read = (...p) => fs.readFileSync(path.join(root, ...p), 'utf8');
// Read per test so a missing ledger fails those tests, not the audio guard.
const readLedger = () => read('docs', 'licenses.md');
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const subdirs = (rel) =>
  fs.readdirSync(path.join(root, rel), { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => `${rel}/${d.name}`);

// Direct plus transitive runtime dependencies, resolved from node_modules.
// Hoisted layout is assumed; a missing package.json fails loudly on read.
const runtimeDependencies = () => {
  const seen = new Set();
  const queue = Object.keys(JSON.parse(read('package.json')).dependencies);
  while (queue.length) {
    const pkg = queue.shift();
    if (seen.has(pkg)) continue;
    seen.add(pkg);
    const meta = JSON.parse(read('node_modules', pkg, 'package.json'));
    queue.push(...Object.keys(meta.dependencies ?? {}));
  }
  return [...seen];
};

describe('licence ledger', () => {
  it('every runtime dependency is in the ledger with its declared licence', () => {
    const ledgerLines = readLedger().split('\n');
    const deps = runtimeDependencies();
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
      expect(ledger.includes(`\`${dir}\``), `${dir} missing from docs/licenses.md`).toBe(true);
    }
  });

  it('every audio file has an ATTRIBUTIONS row', () => {
    const attributions = read('public', 'audio', 'ATTRIBUTIONS.md');
    const stems = new Set();
    for (const sub of ['sfx', 'music']) {
      // Skip dotfiles only (both folders hold a .gitkeep); any other file needs a row.
      const files = fs.readdirSync(path.join(root, 'public/audio', sub)).filter((f) => !f.startsWith('.'));
      for (const f of files) stems.add(path.parse(f).name);
    }
    expect(stems.size).toBeGreaterThan(0);
    for (const stem of stems) {
      // First table column only: a stem in the Source column must not count.
      const row = new RegExp(`^\\| \`${escapeRe(stem)}\\.`, 'm');
      expect(row.test(attributions), `${stem} missing from ATTRIBUTIONS.md`).toBe(true);
    }
  });
});
