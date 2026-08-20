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
import { execFileSync } from 'node:child_process';
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
// Draw Things shows the port when you enable the API Server, but the default is
// not documented anywhere we can read, so scan the plausible range rather than
// making the user hunt for it. An explicit --port short-circuits the scan.
const explicitPort = Number(value('port')) || null;
const CANDIDATE_PORTS = explicitPort
  ? [explicitPort]
  : [7860, 7859, 3080, 8080, ...Array.from({ length: 21 }, (_, i) => 7850 + i)]
      .filter((p, i, a) => a.indexOf(p) === i);

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
if (only) {
  // Comma-separated so a partial re-run (e.g. the nodes that came back with
  // text baked in) is one command rather than one invocation per asset.
  const wanted = only.split(',').map(t => t.trim()).filter(Boolean);
  selected = selected.filter(j => wanted.some(t => j.id.includes(t)));
}
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
async function probe(port) {
  // A live HTTP server answers *something* on the root; a closed port rejects
  // immediately. Short timeout keeps a 25-port scan near-instant on loopback.
  const res = await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(400) })
    .catch(() => null);
  return Boolean(res);
}

async function discoverPort() {
  const hits = await Promise.all(CANDIDATE_PORTS.map(async p => (await probe(p)) ? p : null));
  return hits.find(Boolean) ?? null;
}

const port = await discoverPort();
if (!port) {
  console.error(`
No local server answered on any of ${CANDIDATE_PORTS.length} scanned ports.

Draw Things already has FLUX.1 [schnell] downloaded; its API Server is just
switched off. To turn it on:

  1. Open Draw Things
  2. Open Settings and find "API Server"
  3. Set it to "HTTP"  (per the app's own description, HTTP "runs a compatible
     HTTP API server, allowing extensions that use the txt2img or img2img APIs
     to connect locally" — that is what this script speaks. "gRPC" will NOT
     work here.)
  4. Leave Draw Things running and re-run:  npm run art

The port is auto-discovered. If Draw Things shows a port outside the scanned
range, pass it explicitly:  npm run art -- --port <port>

Works right now with no server:  npm run art -- --dry-run
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
    // Generated at 1024x1024; the game wants 512 (nodes) / 256 (portraits).
    // sips ships with macOS, so this needs no dependency.
    try {
      execFileSync('sips', ['-z', String(j.size.height), String(j.size.width), j.path],
        { stdio: 'ignore' });
      console.log(`ok -> ${j.path}  (${j.size.width}x${j.size.height})`);
    } catch {
      console.log(`ok -> ${j.path}  (WARNING: downscale to ${j.size.width}x${j.size.height} failed; run npm run assets)`);
    }
  } catch (err) {
    console.log(`FAILED (${err.message})`);
  }
}

console.log(`
Done. Verify with:  npm run assets
Then check them in the running game:  npm run dev
`);
