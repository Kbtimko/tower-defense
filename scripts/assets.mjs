#!/usr/bin/env node
// Asset inventory: what the game asks for, what has actually landed, and
// whether it landed correctly. Run with: npm run assets [-- --strict]
//
// --strict exits non-zero if any REQUIRED asset is missing or malformed, so it
// can gate a build. Deferred art (portraits, overworld nodes, sprites) is not
// required — those all have working fallbacks — so a clean run can still list
// plenty of "missing".
import { readFileSync, existsSync, statSync } from 'node:fs';
import { requiredAssets, PUBLIC_ROOT } from '../src/assets/assetManifest.js';

const strict = process.argv.includes('--strict');

// Minimal PNG header reader — avoids a dependency for what is 20 lines.
// Returns null if the file is not a PNG at all (a common failure: an AI tool
// writing a JPEG or a partially-flushed file with a .png extension).
function pngSize(file) {
  const buf = readFileSync(file);
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (buf.length < 24 || !buf.subarray(0, 8).equals(sig)) return null;
  if (buf.subarray(12, 16).toString('ascii') !== 'IHDR') return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

const assets = requiredAssets();
const rows = [];

for (const a of assets) {
  const row = { ...a, status: 'missing', detail: '' };
  if (existsSync(a.path)) {
    const size = pngSize(a.path);
    const bytes = statSync(a.path).size;
    if (!size) {
      row.status = 'BROKEN';
      row.detail = 'not a valid PNG';
    } else if (a.expected && (size.width !== a.expected.width || size.height !== a.expected.height)) {
      row.status = 'size?';
      row.detail = `${size.width}x${size.height}, expected ${a.expected.width}x${a.expected.height}`;
    } else {
      row.status = 'ok';
      row.detail = `${size.width}x${size.height}, ${(bytes / 1024).toFixed(0)} KB`;
    }
  } else {
    // The mistake that shipped broken backdrops for two months: art placed
    // outside public/, where the dev server finds it but the build does not.
    const stray = a.path.replace(new RegExp(`^${PUBLIC_ROOT}/`), '');
    row.detail = existsSync(stray)
      ? `FOUND AT ${stray} — outside public/, so it will NOT ship in the build`
      : 'not generated yet';
  }
  rows.push(row);
}

const pad = (s, n) => String(s).padEnd(n);
const byKind = {};
for (const r of rows) (byKind[r.kind] ??= []).push(r);

console.log('\nAsset inventory — derived from the code that requests each file.\n');

for (const [kind, list] of Object.entries(byKind)) {
  const ok = list.filter(r => r.status === 'ok').length;
  console.log(`${kind}  (${ok}/${list.length} present)`);
  for (const r of list) {
    const mark = r.status === 'ok' ? '  ✓' : r.status === 'missing' ? '  ·' : '  ✗';
    console.log(`${mark} ${pad(r.id, 34)} ${pad(r.status, 8)} ${r.detail}`);
  }
  console.log('');
}

const missingRequired = rows.filter(r => r.required && r.status !== 'ok');
const misplaced = rows.filter(r => r.detail.startsWith('FOUND AT'));
const broken = rows.filter(r => r.status === 'BROKEN' || r.status === 'size?');

console.log(`${rows.filter(r => r.status === 'ok').length}/${rows.length} assets present`
          + ` · ${missingRequired.length} required missing`
          + ` · ${misplaced.length} misplaced`
          + ` · ${broken.length} malformed\n`);

if (misplaced.length) {
  console.log('Misplaced art will work on `npm run dev` and 404 in production.');
  console.log('Move it under public/ — see PR #45.\n');
}

if (strict && (missingRequired.length || misplaced.length || broken.length)) {
  console.error('strict: required assets missing, misplaced or malformed');
  process.exit(1);
}
