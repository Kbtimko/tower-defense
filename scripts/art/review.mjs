// `npm run art:review -- <batch> [--cache dir]`: writes the candidate review page
// to <cache>/review/<batch>/index.html and prints its file:// URL.
// buildReview is importable (Task 11's end-to-end test) and never exits.
import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import sharp from 'sharp';
import { resolveJob } from '../../src/assets/artJob.js';
import { cacheRoot, candidateDir, readExisting, cliPath } from '../../src/assets/candidates.js';
import { requiredAssets } from '../../src/assets/assetManifest.js';
import { getSpriteConfig } from '../../src/data/sprites.js';
import { renderReviewPage } from '../../src/assets/reviewPage.js';
import { loadFacing, loadPromptSources, readMetas } from './runJob.mjs';

const PAD_SIZE = { width: 240, height: 160 };
const BACKDROP = 'public/assets/backgrounds/map_0_outpost_sigma.webp';
// Overworld/portrait art ships square (512 / 256); show it at a size that fits a row.
const FIXED_DISPLAY = { overworld: { width: 160, height: 160 }, portrait: { width: 128, height: 128 } };

const spriteState = (asset) => {
  const cfg = getSpriteConfig(asset.category, asset.type);
  const state = cfg?.states?.[asset.category === 'enemy' ? 'move' : 'idle'];
  return { cfg, state };
};

function currentArt(repoRoot, asset) {
  if (asset.kind === 'sprite') {
    const { state } = spriteState(asset);
    if (!state || !existsSync(join(repoRoot, 'public', state.path))) return null;
    return { path: join(repoRoot, 'public', state.path), frameWidth: state.frameWidth, frameHeight: state.frameHeight };
  }
  const req = requiredAssets().find((a) => a.kind === asset.kind && a.path.endsWith(`/${asset.id}.png`));
  if (!req || !existsSync(join(repoRoot, req.path))) return null;
  return { path: join(repoRoot, req.path), frameWidth: req.expected.width, frameHeight: req.expected.height };
}

// Sprites show at what the game draws: the manifest cell x scale (a variant uses
// its base entry).
export function displaySize(asset, fallback = { width: 64, height: 64 }) {
  if (asset.kind !== 'sprite') return FIXED_DISPLAY[asset.kind];
  const { cfg, state } = spriteState(asset);
  const cell = state?.frameWidth;
  if (!cell || !cfg) return fallback;
  const size = Math.round(cell * (cfg.scale ?? 1));
  return { width: size, height: size };
}

function rowMode(metas) {
  const modes = new Set(Object.values(metas).map((m) => m.mode));
  return modes.size === 0 ? '' : modes.size === 1 ? [...modes][0] : 'mixed';
}

// Relative URL for the page: percent-encode each segment so spaces, #, ? and %
// in the cache path cannot break src/url().
export function pageUrl(fromDir, abs) {
  return relative(fromDir, abs).split(sep).map(encodeURIComponent).join('/');
}

export async function buildReview({ repoRoot, batch, cache }) {
  const jobPath = join(repoRoot, 'scripts/art/jobs', `${batch}.json`);
  if (!existsSync(jobPath)) throw new Error(`No job file at ${jobPath}`);
  const { job, errors } = resolveJob(JSON.parse(readFileSync(jobPath, 'utf8')),
    loadPromptSources(repoRoot), { facing: loadFacing(repoRoot) });
  if (errors.length) throw new Error(`Job "${batch}" is invalid: ${errors.join('; ')}`);

  const cacheDir = cacheRoot(repoRoot, { cache, env: process.env });
  const outDir = join(cacheDir, 'review', job.batch);
  mkdirSync(outDir, { recursive: true });
  const url = (abs) => pageUrl(outDir, abs);

  await sharp(join(repoRoot, BACKDROP))
    .extract({ left: 0, top: 0, ...PAD_SIZE }).jpeg({ quality: 85 })
    .toFile(join(outDir, 'pad.jpg'));

  const rows = job.assets.map((asset) => {
    const dir = candidateDir(cacheDir, job.batch, asset.assetId);
    const { names, metas } = readMetas(dir, () => {});
    const candidates = readExisting(names, metas).map((e) => {
      const c = { index: e.index, rawUrl: url(join(dir, `${e.index}.png`)) };
      // Without its cut.json apply cannot tell which mirror the cutout was drawn
      // with, so such a tile is treated as uncut (raw, no Flip).
      if (e.hasCut && names.includes(`${e.index}.cut.json`)) c.cutUrl = url(join(dir, `${e.index}.cut.png`));
      if (e.hasPreview) c.previewUrl = url(join(dir, `${e.index}.preview.png`));
      return c;
    });
    const cur = currentArt(repoRoot, asset);
    return {
      assetId: asset.assetId, kind: asset.kind, label: asset.assetId, mode: rowMode(metas),
      current: cur && { url: url(cur.path), frameWidth: cur.frameWidth, frameHeight: cur.frameHeight },
      display: displaySize(asset), candidates,
      ...(asset.kind === 'sprite' && { mirror: asset.mirror }),
    };
  });

  const htmlPath = join(outDir, 'index.html');
  writeFileSync(htmlPath, renderReviewPage({ job, rows, padUrl: 'pad.jpg' }));
  return htmlPath;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const argv = process.argv.slice(2);
  const ci = argv.indexOf('--cache');
  const batch = argv.find((a, i) => !a.startsWith('--') && argv[i - 1] !== '--cache');
  if (!batch) { console.error('usage: npm run art:review -- <batch> [--cache dir]'); process.exit(1); }
  try {
    const p = await buildReview({ repoRoot: process.cwd(), batch, cache: ci !== -1 ? cliPath(argv[ci + 1]) : undefined });
    console.log(pathToFileURL(p).href);
  } catch (err) { console.error(err.message); process.exit(1); }
}
