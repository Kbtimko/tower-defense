#!/usr/bin/env node
// Batch art generation from the PROMPTS.md files via a local Draw Things
// API server.
//
//   npm run art -- --dry-run              print every resolved prompt, generate nothing
//   npm run art -- --kind sprite          generate the entity REFERENCE frames
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
  parseFencedSection, parseSpritePrompts,
} from '../src/assets/promptParser.js';
import { requiredAssets } from '../src/assets/assetManifest.js';
import { FLUX } from '../src/assets/drawThingsRequest.js';
import { candidatePorts, discoverPort, noServerHelp } from './art/drawThings.mjs';

const argv = process.argv.slice(2);
const flag = name => argv.includes(`--${name}`);
const value = (name, fallback = null) => {
  const i = argv.indexOf(`--${name}`);
  return i !== -1 && argv[i + 1] ? argv[i + 1] : fallback;
};

if (flag('job')) {
  const { runJob } = await import('./art/runJob.mjs');
  const code = await runJob({
    repoRoot: process.cwd(),
    batch: value('job'),
    candidates: value('candidates') ? Number(value('candidates')) : undefined,
    fake: flag('fake'),
    reroll: value('reroll'),
    cache: value('cache'),
    port: value('port'),
    dryRun: flag('dry-run'),
    noPrepare: flag('no-prepare'),
  });
  process.exit(code);
}

const dryRun   = flag('dry-run');
const force    = flag('force');
const kind     = value('kind');
const only     = value('only');
const endpoint = value('endpoint', '/sdapi/v1/txt2img');
// An explicit --port short-circuits the port scan.
const explicitPort = Number(value('port')) || null;
const CANDIDATE_PORTS = candidatePorts(explicitPort);

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

// Sprite REFERENCE frames. Unlike the other kinds these are not shippable
// assets: one reference per entity is the input to the frame compositor
// (scripts/build-sprite-sheets.py), which cuts alpha and derives the animation
// frames from it. They land in a gitignored cache, never under public/.
const SPRITE_REF_DIR = '.art-cache/sprites';
const spriteMd = readFileSync('public/assets/sprites/PROMPTS.md', 'utf8');
const spriteStyle = parseFencedSection(spriteMd, 'Shared style anchor');
// Variants share the base's category_type id; including them would write over
// the base reference.
for (const p of parseSpritePrompts(spriteMd).filter(p => !p.variant)) {
  jobs.push({
    kind: 'sprite', id: `${p.category}_${p.type}`,
    path: `${SPRITE_REF_DIR}/${p.category}_${p.type}.png`,
    prompt: buildPrompt(spriteStyle, p.subject),
    size: null,                 // references stay at generation resolution
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
    console.log(`   -> ${j.path}  ${j.size ? `(downscale to ${j.size.width}x${j.size.height})` : '(reference, full size)'}`);
    console.log(`   ${j.prompt}\n`);
  }
  console.log('Dry run — nothing generated.\n');
  process.exit(0);
}

// ── Find the server ────────────────────────────────────────────────────────
const port = await discoverPort(CANDIDATE_PORTS);
if (!port) {
  console.error(noServerHelp(CANDIDATE_PORTS));
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
    if (!j.size) {                 // reference frames keep full resolution
      console.log(`ok -> ${j.path}  (${FLUX.width}x${FLUX.height} reference)`);
      continue;
    }
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
