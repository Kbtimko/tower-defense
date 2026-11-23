// npm run package:itch -- build a relative-base production bundle, check it
// against itch's limits, zip it deterministically, then play-test the unpacked
// zip from a nested folder (the way itch serves it).
//   --no-verify        skip the device flow
//   --devices <list>   flow devices (default desktop,iphone)

import { build } from 'vite';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { VENDORED_NOTICES } from '../src/data/vendoredNotices.js';
import { ITCH_LIMITS, JUNK_FILES } from '../src/data/release.js';
import { buildIdentity, checkItchLimits, findAbsoluteUrls, missingNotices, zipName } from '../src/systems/itchPackage.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(ROOT);

function findOnPath(name) {
  for (const dir of (process.env.PATH || '').split(path.delimiter)) {
    if (!dir) continue;
    const p = path.join(dir, name);
    try {
      if (fs.statSync(p).isFile()) { fs.accessSync(p, fs.constants.X_OK); return p; }
    } catch { /* not here */ }
  }
  return null;
}

const args = process.argv.slice(2);
const verify = !args.includes('--no-verify');
const di = args.indexOf('--devices');
const devices = di >= 0 && args[di + 1] ? args[di + 1] : 'desktop,iphone';

for (const tool of ['zip', 'unzip']) {
  if (!findOnPath(tool)) {
    console.error(`package:itch needs \`${tool}\` on PATH`);
    process.exit(2);
  }
}

// A zip left over from an earlier run must never sit beside this run's result:
// the user uploads release/*.zip by hand, so the folder has to tell the truth.
fs.mkdirSync('release', { recursive: true });
for (const f of fs.readdirSync('release')) {
  if (/^last-light-.*\.zip$/.test(f)) fs.rmSync(path.join('release', f));
}

const OUT = 'release/itch';
await build({ mode: 'production', base: './', logLevel: 'warn', build: { outDir: OUT, emptyOutDir: true } });

function walk(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(abs));
    else out.push(abs);
  }
  return out;
}

for (const abs of walk(OUT)) {
  if (JUNK_FILES.includes(path.basename(abs))) fs.rmSync(abs);
}

const files = walk(OUT).map(abs => ({
  abs,
  path: path.relative(OUT, abs).split(path.sep).join('/'),
  bytes: fs.statSync(abs).size,
}));

const problems = checkItchLimits(files, ITCH_LIMITS);
for (const f of files) {
  if (f.path !== 'index.html' && !f.path.endsWith('.css')) continue;
  for (const url of findAbsoluteUrls(fs.readFileSync(f.abs, 'utf8'))) {
    problems.push(`root-absolute URL ${url} in ${f.path}`);
  }
}
if (problems.length) {
  console.error('itch package problems:');
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}

// MIT/ISC/OFL require the notice to travel with copies. eventemitter3 (inlined
// by Phaser) and the vendored entries are not package.json dependencies.
const noticesPath = path.join(OUT, 'THIRD_PARTY_NOTICES.txt');
const required = [...Object.keys(JSON.parse(fs.readFileSync('package.json', 'utf8')).dependencies || {}), 'eventemitter3', ...VENDORED_NOTICES.map(v => v.name)];
if (!fs.existsSync(noticesPath)) {
  console.error('itch package problems:\n  - THIRD_PARTY_NOTICES.txt missing from the build');
  process.exit(1);
}
const lacking = missingNotices(fs.readFileSync(noticesPath, 'utf8'), required);
if (lacking.length) {
  console.error(`itch package problems:\n  - THIRD_PARTY_NOTICES.txt has no section for: ${lacking.join(', ')}`);
  process.exit(1);
}

const { sha, dirty } = buildIdentity(a => spawnSync('git', a, { encoding: 'utf8' }));
if (sha === 'nogit') console.warn('WARNING: git unavailable or HEAD unresolved; naming the zip nogit-dirty');
const version = JSON.parse(fs.readFileSync('package.json', 'utf8')).version;
const name = zipName({ version, sha, dirty, unverified: !verify });
const zipPath = path.join('release', name);
const failVerify = msg => { fs.rmSync(zipPath, { force: true }); console.error(msg); process.exit(1); };
const z = spawnSync('zip', ['-r', '-X', '-q', path.join('..', name), '.'], { cwd: OUT, stdio: 'inherit' });
if (z.status !== 0) { console.error('zip failed'); process.exit(1); }

if (verify) {
  fs.rmSync('release/verify', { recursive: true, force: true });
  const dest = 'release/verify/html/12345';
  fs.mkdirSync(dest, { recursive: true });
  const u = spawnSync('unzip', ['-q', zipPath, '-d', dest], { stdio: 'inherit' });
  if (u.status !== 0) failVerify('unzip failed');
  const r = spawnSync('node', ['scripts/capture.mjs', '--flow', '--devices', devices, '--serve', dest, '--base-path', '/html/12345'], { stdio: 'inherit' });
  if (r.status !== 0) failVerify('flow verification failed; zip removed');
}

console.log(`${zipPath}: ${files.length} files, ${(fs.statSync(zipPath).size / 1e6).toFixed(1)} MB, ${verify ? `verified on ${devices}` : 'NOT verified (--no-verify)'}`);
