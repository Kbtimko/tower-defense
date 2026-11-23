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
import { ITCH_LIMITS, JUNK_FILES } from '../src/data/release.js';
import { checkItchLimits, findAbsoluteUrls, zipName } from '../src/systems/itchPackage.js';

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

const git = a => spawnSync('git', a, { encoding: 'utf8' }).stdout.trim();
const version = JSON.parse(fs.readFileSync('package.json', 'utf8')).version;
const name = zipName({ version, sha: git(['rev-parse', '--short', 'HEAD']), dirty: git(['status', '--porcelain']) !== '' });
const zipPath = path.join('release', name);
fs.rmSync(zipPath, { force: true });
const z = spawnSync('zip', ['-r', '-X', '-q', path.join('..', name), '.'], { cwd: OUT, stdio: 'inherit' });
if (z.status !== 0) { console.error('zip failed'); process.exit(1); }

if (verify) {
  fs.rmSync('release/verify', { recursive: true, force: true });
  const dest = 'release/verify/html/12345';
  fs.mkdirSync(dest, { recursive: true });
  const u = spawnSync('unzip', ['-q', zipPath, '-d', dest], { stdio: 'inherit' });
  if (u.status !== 0) { console.error('unzip failed'); process.exit(1); }
  const r = spawnSync('node', ['scripts/capture.mjs', '--flow', '--devices', devices, '--serve', dest, '--base-path', '/html/12345'], { stdio: 'inherit' });
  if (r.status !== 0) { console.error('flow verification failed'); process.exit(1); }
}

console.log(`${zipPath}: ${files.length} files, ${(fs.statSync(zipPath).size / 1e6).toFixed(1)} MB, ${verify ? `verified on ${devices}` : 'NOT verified (--no-verify)'}`);
