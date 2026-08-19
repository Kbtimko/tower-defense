#!/usr/bin/env node
// Batch art generation from the PROMPTS.md files via a local Draw Things
// API server.
//
//   npm run art -- --dry-run              print every resolved prompt, generate nothing
//   npm run art -- --kind overworld       generate the 10 campaign-map nodes
//   npm run art -- --kind portrait        generate the 3 speaker portraits
//   npm run art -- --only overworld_5     generate one asset
//   npm run art -- --port 7860            override port discovery
//   npm run art -- --force                overwrite assets that already exist
//
// Draw Things exposes an HTTP API server that follows the AUTOMATIC1111
// convention (POST /sdapi/v1/txt2img, base64 PNG back). That endpoint shape is
// assumed here and is overridable with --endpoint if your build differs. The
// script probes for a reachable server first and tells you exactly what to
// switch on if it finds none, so a --dry-run is useful before any setup.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  parseStyleAnchor, parseOverworldPrompts, parsePortraitPrompts, buildPrompt,
} from '../src/assets/promptParser.js';
import { requiredAssets } from '../src/assets/assetManifest.js';

const argv = process.argv.slice(2);
const flag = name => argv.includes(`--${name}`);
const value = (name, fallback = null) => {
  const i = argv.indexOf(`--${name}`);
  return i !== -1 && argv[i + 1] ? argv[i + 1] : fallback;
};

const dryRun   = flag('dry-run');
const force    = flag('force');
const kind     = value('kind');
const only     = value('only');
const endpoint = value('endpoint', '/sdapi/v1/txt2img');
const CANDIDATE_PORTS = [Number(value('port')) || null, 7860, 7859, 3080, 8080].filter(Boolean);

// FLUX.1 [schnell] is distilled: 4 steps, CFG 0. Matches the PROMPTS.md guidance.
const FLUX = { steps: 4, cfg_scale: 0, sampler_name: 'Euler a', width: 1024, height: 1024 };
const SEED = Number(value('seed', '77021'));   // one locked seed keeps the set cohesive

// ── Assemble the job list ──────────────────────────────────────────────────
const assets = requiredAssets();
const jobs = [];

const overworldMd = readFileSync('public/assets/overworld/PROMPTS.md', 'utf8');
const owStyle = parseStyleAnchor(overworldMd);
for (const p of parseOverworldPrompts(overworldMd)) {
  const asset = assets.find(a => a.kind === 'overworld' && a.path.endsWith('/' + p.file));
  if (!asset) continue;
  jobs.push({
    kind: 'overworld', id: p.file, path: asset.path,
    prompt: buildPrompt(owStyle, p.subject),
    size: asset.expected ?? { width: 512, height: 512 },
  });
}

const portraitMd = readFileSync('public/assets/portraits/PROMPTS.md', 'utf8');
const pStyle = parseStyleAnchor(portraitMd);
for (const p of parsePortraitPrompts(portraitMd)) {
  const asset = assets.find(a => a.kind === 'portrait' && a.path.endsWith(`/${p.key}.png`));
  if (!asset) continue;
  jobs.push({
    kind: 'portrait', id: p.key, path: asset.path,
    prompt: buildPrompt(pStyle, p.subject),
    size: asset.expected ?? { width: 256, height: 256 },
  });
}

let selected = jobs;
if (kind) selected = selected.filter(j => j.kind === kind);
if (only) selected = selected.filter(j => j.id.includes(only));
if (!force) selected = selected.filter(j => !existsSync(j.path));

if (selected.length === 0) {
  console.log('\nNothing to generate — every selected asset already exists (use --force to overwrite).\n');
  process.exit(0);
}

// ── Dry run ────────────────────────────────────────────────────────────────
if (dryRun) {
  console.log(`\n${selected.length} prompt(s), seed ${SEED}, ${FLUX.steps} steps, CFG ${FLUX.cfg_scale}\n`);
  for (const j of selected) {
    console.log(`── ${j.kind}: ${j.id}`);
    console.log(`   -> ${j.path}  (downscale to ${j.size.width}x${j.size.height})`);
    console.log(`   ${j.prompt}\n`);
  }
  console.log('Dry run — nothing generated.\n');
  process.exit(0);
}

// ── Find the server ────────────────────────────────────────────────────────
async function discoverPort() {
  for (const port of CANDIDATE_PORTS) {
    try {
      const ctl = AbortSignal.timeout(1500);
      const res = await fetch(`http://127.0.0.1:${port}${endpoint}`, {
        method: 'OPTIONS', signal: ctl,
      }).catch(() => null);
      if (res) return port;
      // Some servers reject OPTIONS but answer a GET on the root.
      const root = await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(1500) })
        .catch(() => null);
      if (root) return port;
    } catch { /* keep probing */ }
  }
  return null;
}

const port = await discoverPort();
if (!port) {
  console.error(`
No local image-generation server answered on ${CANDIDATE_PORTS.join(', ')}.

Draw Things is installed and already has FLUX.1 [schnell] downloaded, but its
API server is not listening. To switch it on:

  1. Open Draw Things
  2. Settings -> look for "API Server" / "gRPC Server" and enable it
  3. Note the port it reports, then re-run:
       npm run art -- --port <port>

If this build exposes no HTTP server, tell me and I will switch the script to
the gRPC transport or to mflux instead.

Meanwhile, this works right now and needs no server:
  npm run art -- --dry-run
`);
  process.exit(1);
}

console.log(`\nUsing server on port ${port}. Generating ${selected.length} asset(s)...\n`);

for (const j of selected) {
  process.stdout.write(`  ${j.id} ... `);
  const body = {
    prompt: j.prompt,
    negative_prompt: '',
    seed: SEED,
    steps: FLUX.steps,
    cfg_scale: FLUX.cfg_scale,
    sampler_name: FLUX.sampler_name,
    width: FLUX.width,
    height: FLUX.height,
    batch_size: 1,
  };
  try {
    const res = await fetch(`http://127.0.0.1:${port}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) { console.log(`FAILED (HTTP ${res.status})`); continue; }
    const json = await res.json();
    const b64 = json.images?.[0] ?? json.image;
    if (!b64) { console.log('FAILED (no image in response)'); continue; }
    mkdirSync(dirname(j.path), { recursive: true });
    writeFileSync(j.path, Buffer.from(b64.replace(/^data:image\/\w+;base64,/, ''), 'base64'));
    console.log(`ok -> ${j.path}`);
  } catch (err) {
    console.log(`FAILED (${err.message})`);
  }
}

console.log(`
Generated at ${FLUX.width}x${FLUX.height}. These still need downscaling to their
target sizes; run "npm run assets" to see which are flagged size?.
`);
