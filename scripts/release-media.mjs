#!/usr/bin/env node
// itch.io page media: screenshots, a 630x500 cover and a 15 s gameplay clip (MP4 + GIF).
//
//   npm run release:media
//
// Builds the debug-hook `capture` mode (the production build strips them), serves it with
// `vite preview`, and drives it with Playwright on the real GPU so the clip is full frame rate.
// Output: release/media/{shot-map<N>.png, cover.png, clip.mp4, clip.gif, media.json}.
// Exit 1 on a page error or a shot with fewer than MIN_ENEMIES enemies; 2 if ffmpeg is missing.
import { mkdirSync, writeFileSync, rmSync, statSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { build, preview } from 'vite';
import { chromium } from 'playwright';
import sharp from 'sharp';
import { DEVICES } from './captureDevices.mjs';
import { captureUrl, watchProblems, shootBusiestFrame, MIN_ENEMIES, contextOptions } from './captureCore.mjs';
import { MAP_WAVES } from '../src/data/waves.js';
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

async function shoot(browser, base, mapId, device) {
  const context = await browser.newContext(contextOptions(device));
  try {
    const page = await context.newPage();
    const problems = watchProblems(page);
    const { path } = captureUrl(mapId, { wave: MAP_WAVES[mapId].length });
    await page.goto(base + path);
    const file = join(OUT_DIR, `shot-map${mapId}.png`);
    const r = await shootBusiestFrame(page, RELEASE_MEDIA.warmupSimMs, file);
    return { map: mapId, file, enemies: r.enemies, simMs: r.simMs, towers: r.towers, problems: [...problems, ...r.errors] };
  } finally {
    await context.close();
  }
}

async function makeCover() {
  const { cover } = RELEASE_MEDIA;
  const src = join(OUT_DIR, `shot-map${cover.map}.png`);
  const { width, height } = await sharp(src).metadata();
  const left = Math.max(0, Math.floor((width - cover.cropWidth) / 2));
  const top = Math.max(0, Math.floor((height - cover.cropHeight) / 2));
  const file = join(OUT_DIR, 'cover.png');
  await sharp(src)
    .extract({ left, top, width: Math.min(cover.cropWidth, width), height: Math.min(cover.cropHeight, height) })
    .resize(cover.width, cover.height)
    .toFile(file);
  return file;
}

async function recordClip(browser, base, device) {
  const { clip, warmupSimMs } = RELEASE_MEDIA;
  rmSync(VIDEO_DIR, { recursive: true, force: true });
  const context = await browser.newContext({
    ...contextOptions(device),
    recordVideo: { dir: VIDEO_DIR, size: device.viewport },
  });
  const page = await context.newPage();
  // The recording starts when the page opens; offset is measured from here.
  const t0 = Date.now();
  const problems = watchProblems(page);
  const { path } = captureUrl(clip.map, { wave: MAP_WAVES[clip.map].length, autosend: true });
  await page.goto(base + path);
  await page.waitForFunction(() => window.__capture, null, { timeout: 30_000 });
  await page.waitForFunction(ms => window.__capture.simMs >= ms, warmupSimMs, { timeout: warmupSimMs * 8 + 30_000, polling: 50 });
  const offsetS = (Date.now() - t0) / 1000;
  await page.waitForTimeout(clip.seconds * 1000);
  await context.close();
  const webm = readdirSync(VIDEO_DIR).find(f => f.endsWith('.webm'));
  return { webm: join(VIDEO_DIR, webm), offsetS, problems };
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
  requireTool('ffprobe');
  const device = DEVICES[RELEASE_MEDIA.device];
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
      console.log(`${s.file}  sim ${(s.simMs / 1000).toFixed(1)}s, ${s.enemies} enemies${s.problems.length ? `  (${s.problems.length} problems)` : ''}`);
    }
    clipInfo = await recordClip(browser, base, device);
  } finally {
    await browser.close();
    await new Promise(res => server.httpServer.close(res));
  }
  const cover = await makeCover();
  const [mp4, gif] = encodeClip(clipInfo);

  const files = [...shots.map(s => s.file), cover, mp4, gif].map(f => ({ file: f, bytes: statSync(f).size }));
  const report = {
    device: RELEASE_MEDIA.device,
    files,
    shots: shots.map(s => ({ map: s.map, enemies: s.enemies, simMs: s.simMs, towers: s.towers })),
    clip: { offsetS: clipInfo.offsetS },
  };
  writeFileSync(join(OUT_DIR, 'media.json'), JSON.stringify(report, null, 2));
  files.forEach(f => console.log(`${f.file}  ${(f.bytes / 1024).toFixed(0)} KB`));

  const problems = [...shots.flatMap(s => s.problems.map(p => `map ${s.map}: ${p}`)), ...clipInfo.problems.map(p => `clip: ${p}`)];
  const thin = shots.filter(s => s.enemies < MIN_ENEMIES);
  if (problems.length) console.error(`\n${problems.length} page problem(s):\n${problems.join('\n')}`);
  if (thin.length) console.error(`\nshots with fewer than ${MIN_ENEMIES} enemies: maps ${thin.map(s => `${s.map} (${s.enemies})`).join(', ')}; raise RELEASE_MEDIA.warmupSimMs`);
  if (problems.length || thin.length) process.exitCode = 1;
}

main().catch(err => { console.error(err); process.exit(1); });
