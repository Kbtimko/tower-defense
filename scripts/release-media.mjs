#!/usr/bin/env node
// itch.io page media: screenshots, a 630x500 cover and a 15 s gameplay clip (MP4 + GIF).
//
//   npm run release:media
//
// Builds the debug-hook `capture` mode (the production build strips them), serves it with
// `vite preview`, and drives it with Playwright on the real GPU so the clip is full frame rate.
// Output: release/media/{shot-map<N>.png, cover.png, clip.mp4, clip.gif, media.json}.
// Exit 1 on a page error or a shot with fewer than minMiddleEnemies mid-road enemies; 2 if ffmpeg is missing.
import { mkdirSync, writeFileSync, rmSync, statSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { build, preview } from 'vite';
import { chromium } from 'playwright';
import sharp from 'sharp';
import { DEVICES } from './captureDevices.mjs';
import { captureUrl, watchProblems, shootBestFrame, boardRect, middleBand, contextOptions } from './captureCore.mjs';
import { MAP_WAVES } from '../src/data/waves.js';
import { releaseBuild } from '../src/systems/debugCapture.js';
import { MAPS } from '../src/data/maps.js';
import { coverCrop } from '../src/systems/releaseMedia.js';
import { RELEASE_MEDIA } from '../src/data/release.js';

const OUT_DIR = 'release/media';
const DIST_DIR = '.art-cache/capture-dist';
const VIDEO_DIR = '.art-cache/release-video';
const PORT = 4192;
const GPU_ARGS = ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'];

function requireTool(name) {
  const r = spawnSync(name, ['-version'], { stdio: 'ignore' });
  if (r.error || r.status !== 0) {
    console.error(`${name} not found on PATH; install it (brew install ffmpeg) and rerun`);
    process.exit(2);
  }
}

function run(cmd, args) {
  const r = spawnSync(cmd, args, { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`${cmd} failed (${r.status}): ${r.stderr}`);
  return r.stdout;
}

// Every pad built, opened `wavesFromEnd` waves before the last (0 = the last wave itself)
// with auto-send on.
function mediaUrl(mapId) {
  const wave = Math.max(1, MAP_WAVES[mapId].length - RELEASE_MEDIA.wavesFromEnd);
  return captureUrl(mapId, { wave, autosend: true, build: releaseBuild(MAPS[mapId].towerSlots.length, MAPS[mapId].maxTierAllowed) }).path;
}

async function shoot(browser, base, mapId, device) {
  const context = await browser.newContext(contextOptions(device));
  try {
    const page = await context.newPage();
    const problems = watchProblems(page);
    await page.goto(base + mediaUrl(mapId));
    const file = join(OUT_DIR, `shot-map${mapId}.png`);
    const { shotFromSimMs, shotToSimMs, midBand } = RELEASE_MEDIA;
    const r = await shootBestFrame(page, { fromSimMs: shotFromSimMs, toSimMs: shotToSimMs, file, midBand, label: `map ${mapId} shot` });
    const hud = await page.evaluate(() => document.getElementById('stat-kills')?.textContent);
    return { map: mapId, file, middle: r.best, total: r.total, simMs: r.simMs, centroid: r.centroid, board: r.board,
      kills: Number(hud), towers: r.towers.length, problems: [...problems, ...r.errors] };
  } finally {
    await context.close();
  }
}

async function makeCover(shot) {
  const { cover } = RELEASE_MEDIA;
  const src = join(OUT_DIR, `shot-map${cover.map}.png`);
  const region = coverCrop(cover, shot);
  const file = join(OUT_DIR, 'cover.png');
  await sharp(src)
    .extract(region)
    .resize(cover.width, cover.height)
    .toFile(file);
  return { file, region };
}

async function recordClip(browser, base, device) {
  const { clip, midBand, minMiddleEnemies } = RELEASE_MEDIA;
  rmSync(VIDEO_DIR, { recursive: true, force: true });
  const context = await browser.newContext({
    ...contextOptions(device),
    recordVideo: { dir: VIDEO_DIR, size: device.viewport },
  });
  const page = await context.newPage();
  // The recording starts when the page opens; offset is measured from here.
  const t0 = Date.now();
  const problems = watchProblems(page);
  await page.goto(base + mediaUrl(clip.map));
  await page.waitForFunction(() => window.__capture, null, { timeout: 30_000 });
  const board = await boardRect(page);
  // Trim from the first moment the road's middle holds a crowd (or clip.maxLeadSimMs if that
  // comes first), so the clip shows towers engaging rather than the wave entering.
  // Wall-clock bound, as in shootBestFrame: a stalled page must fail, not hang.
  const deadline = Date.now() + clip.maxLeadSimMs * 8 + 30_000;
  let startSimMs, peak = 0, crowded = false;
  for (;;) {
    if (Date.now() > deadline) throw new Error(`map ${clip.map} clip: no crowd and sim time never reached ${clip.maxLeadSimMs} ms (peak ${peak} mid-road)`);
    const c = await page.evaluate(() => ({ crowd: window.__capture.crowd(), simMs: window.__capture.simMs }));
    const count = middleBand(c.crowd, midBand, board).count;
    peak = Math.max(peak, count);
    crowded = count >= minMiddleEnemies;
    if (crowded || c.simMs >= clip.maxLeadSimMs) { startSimMs = c.simMs; break; }
    await page.waitForTimeout(50);
  }
  const offsetS = (Date.now() - t0) / 1000;
  await page.waitForTimeout(clip.seconds * 1000);
  await context.close();
  const webm = readdirSync(VIDEO_DIR).find(f => f.endsWith('.webm'));
  return { webm: join(VIDEO_DIR, webm), offsetS, startSimMs, crowded, peak, problems };
}

function encodeClip({ webm, offsetS }) {
  const { clip } = RELEASE_MEDIA;
  const mp4 = join(OUT_DIR, 'clip.mp4');
  const gif = join(OUT_DIR, 'clip.gif');
  const palette = join(VIDEO_DIR, 'palette.png');
  const seek = ['-ss', offsetS.toFixed(2), '-t', String(clip.seconds), '-i', webm];
  run('ffmpeg', ['-y', ...seek, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', mp4]);
  const scale = `fps=${clip.gifFps},scale=${clip.gifWidth}:-1:flags=lanczos`;
  run('ffmpeg', ['-y', ...seek, '-vf', `${scale},palettegen`, palette]);
  run('ffmpeg', ['-y', ...seek, '-i', palette, '-lavfi', `${scale}[x];[x][1:v]paletteuse`, gif]);
  const gifBytes = statSync(gif).size;
  if (gifBytes > clip.gifWarnBytes) console.warn(`WARNING clip.gif is ${(gifBytes / 1e6).toFixed(1)} MB, over ${(clip.gifWarnBytes / 1e6).toFixed(0)} MB`);
  return [mp4, gif];
}

async function main() {
  requireTool('ffmpeg');
  const device = DEVICES[RELEASE_MEDIA.device];
  // A failed run must not leave a mixed set of old and new images.
  rmSync(OUT_DIR, { recursive: true, force: true });
  mkdirSync(OUT_DIR, { recursive: true });
  await build({ mode: 'capture', logLevel: 'warn', build: { outDir: DIST_DIR, emptyOutDir: true } });
  const server = await preview({ logLevel: 'warn', build: { outDir: DIST_DIR }, preview: { port: PORT, strictPort: true } });
  const base = `http://localhost:${PORT}`;
  const browser = await chromium.launch({ args: GPU_ARGS });
  const shots = [];
  let clipInfo;
  try {
    for (const mapId of RELEASE_MEDIA.shotMaps) {
      const s = await shoot(browser, base, mapId, device);
      shots.push(s);
      console.log(`${s.file}  sim ${(s.simMs / 1000).toFixed(1)}s, ${s.middle} mid-road of ${s.total} enemies, ${s.kills} kills, ${s.towers} towers${s.problems.length ? `  (${s.problems.length} problems)` : ''}`);
    }
    clipInfo = await recordClip(browser, base, device);
  } finally {
    await browser.close();
    await new Promise(res => server.httpServer.close(res));
  }
  const cover = await makeCover(shots.find(s => s.map === RELEASE_MEDIA.cover.map));
  const [mp4, gif] = encodeClip(clipInfo);

  const files = [...shots.map(s => s.file), cover.file, mp4, gif].map(f => ({ file: f, bytes: statSync(f).size }));
  const report = {
    device: RELEASE_MEDIA.device,
    files,
    shots: shots.map(s => ({ map: s.map, middleEnemies: s.middle, totalEnemies: s.total, kills: s.kills, simMs: s.simMs, towers: s.towers })),
    cover: cover.region,
    clip: { offsetS: clipInfo.offsetS, startSimMs: clipInfo.startSimMs },
  };
  writeFileSync(join(OUT_DIR, 'media.json'), JSON.stringify(report, null, 2));
  files.forEach(f => console.log(`${f.file}  ${(f.bytes / 1024).toFixed(0)} KB`));

  const problems = [...shots.flatMap(s => s.problems.map(p => `map ${s.map}: ${p}`)), ...clipInfo.problems.map(p => `clip: ${p}`)];
  const { minMiddleEnemies } = RELEASE_MEDIA;
  const clipThin = clipInfo.crowded ? [] : [`clip: no ${minMiddleEnemies}-enemy mid-road crowd before ${RELEASE_MEDIA.clip.maxLeadSimMs} ms (peak ${clipInfo.peak}); the clip would show an empty road`];
  const thin = shots.filter(s => s.middle < minMiddleEnemies);
  if (problems.length) console.error(`\n${problems.length} page problem(s):\n${problems.join('\n')}`);
  if (thin.length) console.error(`\nshots with fewer than ${minMiddleEnemies} mid-road enemies: maps ${thin.map(s => `${s.map} (${s.middle})`).join(', ')}; widen RELEASE_MEDIA.shotFromSimMs/shotToSimMs`);
  if (clipThin.length) console.error(`\n${clipThin[0]}`);
  if (problems.length || thin.length || clipThin.length) process.exitCode = 1;
}

main().catch(err => { console.error(err); process.exit(1); });
