// `npm run art -- --job <batch>`: N candidates per asset, resumable, written to
// the candidate cache. Importable (Task 11's end-to-end test) so it never calls
// process.exit; it returns the exit code instead.
import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import sharp from 'sharp';
import { promptSources, resolveJob } from '../../src/assets/artJob.js';
import { cacheRoot, candidateDir, readExisting, planCandidates } from '../../src/assets/candidates.js';
import { txt2imgBody, img2imgBody, initImageSource } from '../../src/assets/drawThingsRequest.js';
import { requiredAssets } from '../../src/assets/assetManifest.js';
import { getSpriteConfig } from '../../src/data/sprites.js';
import { candidatePorts, discoverPort, noServerHelp, post } from './drawThings.mjs';
import { makeFakeCandidate } from './fakeCandidate.mjs';

const read = (repoRoot, rel) => readFileSync(join(repoRoot, rel), 'utf8');

function loadFacing(repoRoot) {
  const p = join(repoRoot, 'scripts/art/facing.json');
  return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : {};
}

function readMetas(dir, log) {
  const names = existsSync(dir) ? readdirSync(dir) : [];
  const metas = {};
  for (const n of names) {
    const m = /^(\d+)\.json$/.exec(n);
    if (!m) continue;
    try {
      const meta = JSON.parse(readFileSync(join(dir, n), 'utf8'));
      if (typeof meta?.round !== 'number') throw new Error('no numeric round');
      metas[Number(m[1])] = meta;
    } catch (err) {
      log(`  skipping unreadable ${join(dir, n)} (${err.message}); it will be regenerated`);
    }
  }
  return { names, metas };
}

// Today's art for an asset, as a PNG buffer for the fake generator; null means a
// grey card. Sprites: first frame of the shipped idle (move for enemies) sheet.
async function fakeBase(repoRoot, asset) {
  if (asset.kind === 'sprite') {
    const cfg = getSpriteConfig(asset.category, asset.type);
    const state = cfg?.states?.[asset.category === 'enemy' ? 'move' : 'idle'];
    const p = state && join(repoRoot, 'public', state.path);
    if (!p || !existsSync(p)) return null;
    return sharp(p)
      .extract({ left: 0, top: 0, width: state.frameWidth ?? (await sharp(p).metadata()).width,
                 height: state.frameHeight ?? (await sharp(p).metadata()).height })
      .png().toBuffer();
  }
  const req = requiredAssets().find(a => a.kind === asset.kind && a.path.endsWith(`/${asset.id}.png`));
  const p = req && join(repoRoot, req.path);
  return p && existsSync(p) ? readFileSync(p) : null;
}

async function loadInit(repoRoot, cache, asset) {
  const { ref, fallback } = initImageSource(cache, asset);
  if (existsSync(ref)) return readFileSync(ref).toString('base64');
  const fb = join(repoRoot, fallback);
  if (!existsSync(fb)) return null;
  // The shipped sheet can be a strip; init from its first frame only, as the
  // reference would have been a single image.
  const cfg = getSpriteConfig(asset.category, asset.type);
  const st = cfg?.states?.[asset.category === 'enemy' ? 'move' : 'idle'];
  let img = sharp(fb);
  if (st?.frameWidth && st?.frameHeight) {
    img = img.extract({ left: 0, top: 0, width: st.frameWidth, height: st.frameHeight });
  }
  const buf = await img
    .resize(1024, 1024, { fit: 'contain', kernel: 'nearest', background: { r: 128, g: 128, b: 128, alpha: 1 } })
    .flatten({ background: { r: 128, g: 128, b: 128 } })
    .png().toBuffer();
  return buf.toString('base64');
}

// Cutouts + game-size previews for the review page. Python because rembg and the
// styling pass live there. Resolves to the child's exit code.
function spawnPrepare({ repoRoot, cache, batch, log }) {
  return new Promise((resolve) => {
    const child = spawn('python3', ['scripts/art/prepare_review.py', '--cache', cache, '--batch', batch],
      { cwd: repoRoot });
    const relay = (d) => { for (const line of String(d).split('\n')) if (line) log(`  ${line}`); };
    child.stdout.on('data', relay);
    child.stderr.on('data', relay);
    child.on('error', (err) => { log(`  could not start python3: ${err.message}`); resolve(1); });
    child.on('close', (code) => resolve(code ?? 1));
  });
}

export async function runJob({
  repoRoot, batch, candidates, fake = false, reroll = null, cache, port,
  dryRun = false, noPrepare = false, runPrepare = spawnPrepare, log = console.log,
}) {
  const jobPath = join(repoRoot, 'scripts/art/jobs', `${batch}.json`);
  if (!existsSync(jobPath)) { log(`No job file at ${jobPath}`); return 1; }
  const raw = JSON.parse(readFileSync(jobPath, 'utf8'));
  if (candidates !== undefined && candidates !== null) raw.candidates = candidates;

  const sources = promptSources({
    spriteMd: read(repoRoot, 'public/assets/sprites/PROMPTS.md'),
    overworldMd: read(repoRoot, 'public/assets/overworld/PROMPTS.md'),
    portraitMd: read(repoRoot, 'public/assets/portraits/PROMPTS.md'),
  });
  const { job, errors } = resolveJob(raw, sources, { facing: loadFacing(repoRoot) });
  if (errors.length) {
    log(`Job "${batch}" has ${errors.length} error(s):`);
    for (const e of errors) log(`  - ${e}`);
    return 1;
  }

  const cacheDir = cacheRoot(repoRoot, { cache, env: process.env });
  let rerollSet = null;
  if (reroll) rerollSet = new Set(JSON.parse(readFileSync(reroll, 'utf8')).reroll ?? []);

  const plans = [];
  for (const asset of job.assets) {
    if (rerollSet && !rerollSet.has(asset.assetId)) continue;
    const dir = candidateDir(cacheDir, job.batch, asset.assetId);
    const { names, metas } = readMetas(dir, log);
    const existing = readExisting(names, metas);
    const plan = planCandidates({
      existing, candidates: job.candidates, seed: job.seed, reroll: Boolean(rerollSet),
    });
    plans.push({ asset, dir, plan, mode: asset.init ? 'img2img' : 'txt2img' });
  }

  if (dryRun) {
    log(`\nJob "${job.batch}": ${job.candidates} candidate(s) per asset, seed ${job.seed}, cache ${cacheDir}\n`);
    for (const { asset, plan, mode } of plans) {
      if (plan.length === 0) { log(`── ${asset.assetId}: complete, nothing to generate`); continue; }
      log(`── ${asset.assetId}: round ${plan[0].round}, mode ${fake ? 'fake' : mode}`);
      for (const c of plan) log(`   #${c.index} seed ${c.seed}`);
    }
    log('\nDry run — nothing generated.\n');
    return 0;
  }

  // A prepare failure never deletes candidates; it only makes the run exit non-zero.
  // It also runs when nothing was generated, so a batch whose earlier prepare died
  // can be finished by re-running.
  const prepare = async () => {
    if (noPrepare) return 0;
    log('\nPreparing review images...');
    const code = await runPrepare({ repoRoot, cache: cacheDir, batch: job.batch, log });
    if (code !== 0) log(`Review-image prep failed (exit ${code}); the candidates are kept. Fix and re-run to retry.`);
    return code;
  };

  const todo = plans.filter(p => p.plan.length > 0);
  if (todo.length === 0) {
    log('\nNothing to generate — every asset already has its candidates.\n');
    return (await prepare()) === 0 ? 0 : 1;
  }

  let usePort = null;
  let generated = 0;
  let failed = 0;
  if (!fake) {
    const ports = candidatePorts(port ? Number(port) : null);
    usePort = await discoverPort(ports);
    if (!usePort) { console.error(noServerHelp(ports)); return 1; }
    log(`\nUsing server on port ${usePort}.`);
  }

  for (const { asset, dir, plan, mode } of todo) {
    log(`\n${asset.assetId}: ${plan.length} candidate(s), round ${plan[0].round}`);
    mkdirSync(dir, { recursive: true });
    let initB64 = null;
    let assetMode = fake ? 'fake' : mode;
    let base = null;
    if (fake) base = await fakeBase(repoRoot, asset);
    else if (mode === 'img2img') {
      initB64 = await loadInit(repoRoot, cacheDir, asset);
      if (!initB64) { log(`  ERROR: no init image for ${asset.assetId} (neither reference nor shipped sheet); skipping`); failed += plan.length; continue; }
    }

    for (const c of plan) {
      process.stdout.write(`  #${c.index} (seed ${c.seed}) ... `);
      const pngPath = join(dir, `${c.index}.png`);
      try {
        if (fake) {
          await makeFakeCandidate({ outPath: pngPath, index: c.index, label: `${asset.assetId} #${c.index}`, basePng: base });
        } else {
          let res;
          if (assetMode === 'img2img') {
            // strength defaults to 0.45: roadmap range is 0.4-0.5 when a job omits it.
            res = await post(usePort, '/sdapi/v1/img2img',
              img2imgBody({ prompt: asset.prompt, seed: c.seed, initB64, strength: asset.strength ?? 0.45 }));
            if (!res.ok) {
              console.log('');
              log(`  img2img unsupported (HTTP ${res.status}), falling back to txt2img`);
              assetMode = 'txt2img';
            }
          }
          if (assetMode === 'txt2img') {
            res = await post(usePort, '/sdapi/v1/txt2img', txt2imgBody({ prompt: asset.prompt, seed: c.seed }));
          }
          if (!res.ok) { console.log(`FAILED (HTTP ${res.status})`); failed++; continue; }
          const b64 = res.json?.images?.[0] ?? res.json?.image;
          if (!b64) { console.log('FAILED (no image in response)'); failed++; continue; }
          writeFileSync(pngPath, Buffer.from(b64.replace(/^data:image\/\w+;base64,/, ''), 'base64'));
        }
        // json last: a png without it is an interrupted write and gets redone.
        writeFileSync(join(dir, `${c.index}.json`), JSON.stringify({
          index: c.index, round: c.round, seed: c.seed, mode: assetMode,
          prompt: asset.prompt, createdAt: new Date().toISOString(),
        }, null, 2));
        console.log('ok');
        generated++;
      } catch (err) {
        console.log(`FAILED (${err.message})`);
        failed++;
      }
    }
  }
  log(`\n${generated} generated, ${failed} failed. Candidates are under ${join(cacheDir, 'candidates', job.batch)}\n`);
  const prepared = await prepare();
  return failed || prepared !== 0 ? 1 : 0;
}
