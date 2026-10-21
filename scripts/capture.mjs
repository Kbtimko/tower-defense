#!/usr/bin/env node
// Screenshot harness: builds the game in `capture` mode (debug query hooks
// compiled in — the production build strips them), serves it with
// `vite preview`, and drives it with Playwright.
//
//   npm run capture -- [--maps 0,3,5,9] [--wave N] [--seconds 6]
//                      [--build "archer@0:3,mage@4:4b"] [--hero rael]
//                      [--devices desktop,iphone,pixel,ipad] [--video [secs]]
//                      [--no-build]
//
// Output: .art-cache/captures/<device>/map<N>-w<W>.png (+ .mp4 with --video)
// and .art-cache/captures/report.json listing console errors per capture.
// --wave defaults to the middle wave of each map; --build defaults to one of
// every tower at mixed tiers (defaultCaptureBuild).
import { mkdirSync, writeFileSync, renameSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { build, preview } from 'vite';
import { chromium, devices } from 'playwright';
import { MAPS } from '../src/data/maps.js';
import { MAP_WAVES } from '../src/data/waves.js';
import { defaultCaptureBuild } from '../src/systems/debugCapture.js';

const OUT_DIR   = '.art-cache/captures';
const DIST_DIR  = '.art-cache/capture-dist';
const PORT      = 4188;
const MIN_ENEMIES = 3;

// Landscape presets: the game is landscape-only, so portrait shots would only
// show the letterboxing.
const DEVICES = {
  desktop: { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 },
  iphone:  devices['iPhone 14 landscape'],
  pixel:   devices['Pixel 7 landscape'],
  ipad:    devices['iPad Pro 11 landscape'],
};

function parseArgs(argv) {
  const opts = { maps: [0, 3, 5, 9], wave: null, seconds: 6, build: null, hero: null,
    devices: ['desktop'], video: 0, rebuild: true };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === '--maps')          opts.maps = next().split(',').map(Number);
    else if (a === '--wave')     opts.wave = Number(next());
    else if (a === '--seconds')  opts.seconds = Number(next());
    else if (a === '--build')    opts.build = next();
    else if (a === '--hero')     opts.hero = next();
    else if (a === '--devices')  opts.devices = next().split(',');
    else if (a === '--no-build') opts.rebuild = false;
    else if (a === '--video') {
      const secs = Number(argv[i + 1]);
      opts.video = Number.isFinite(secs) && secs > 0 ? (i++, secs) : 10;
    } else throw new Error(`unknown argument ${a}`);
  }
  for (const d of opts.devices) if (!DEVICES[d]) throw new Error(`unknown device ${d} (have ${Object.keys(DEVICES)})`);
  return opts;
}

function captureUrl(mapId, opts) {
  const wave = opts.wave ?? Math.ceil(MAP_WAVES[mapId].length / 2);
  const params = new URLSearchParams({ debug: '1', map: String(mapId), wave: String(wave) });
  params.set('build', opts.build ?? defaultCaptureBuild(MAPS[mapId].towerSlots.length));
  if (opts.hero) params.set('hero', opts.hero);
  return { wave, path: `/?${params}` };
}

async function captureOne(browser, base, deviceName, mapId, opts) {
  const { wave, path } = captureUrl(mapId, opts);
  const dir = join(OUT_DIR, deviceName);
  mkdirSync(dir, { recursive: true });
  const stem = join(dir, `map${mapId}-w${wave}`);
  const videoDir = join(dir, '.video-tmp');
  const device = DEVICES[deviceName];

  const context = await browser.newContext({
    ...device,
    ...(opts.video ? { recordVideo: { dir: videoDir, size: device.viewport } } : {}),
  });
  const page = await context.newPage();
  const problems = [];
  page.on('pageerror', e => problems.push(`pageerror: ${e.message}`));
  page.on('console', m => {
    // Headless GPU chatter (ReadPixels stalls from the screenshot itself).
    if (m.text().includes('GL Driver Message')) return;
    if (m.type() === 'error' || m.type() === 'warning') problems.push(`${m.type()}: ${m.text()}`);
  });

  await page.goto(base + path);
  await page.waitForFunction(() => window.__capture, null, { timeout: 30_000 });
  const waitMs = Math.max(opts.seconds, opts.video) * 1000;
  // Game time, not wall time: a headless browser may run well under 60 fps.
  await page.waitForFunction(ms => window.__capture.simMs >= ms, waitMs, { timeout: waitMs * 8 + 30_000, polling: 100 });
  // Then hold out for a crowd on the path, keeping the busiest frame seen: a
  // strong scripted build can kill fast enemies before three are ever alive.
  let best = -1;
  let shotSimMs = 0;
  for (;;) {
    const c = await page.evaluate(() => window.__capture);
    if (c.enemies > best) {
      best = c.enemies;
      shotSimMs = c.simMs;
      await page.screenshot({ path: `${stem}.png` });
    }
    if (best >= MIN_ENEMIES || c.simMs >= waitMs * 3) break;
    await page.waitForTimeout(150);
  }
  const capture = { ...(await page.evaluate(() => window.__capture)), enemies: best, simMs: shotSimMs };
  await context.close();

  if (opts.video) {
    const webm = await page.video().path();
    const mp4 = `${stem}.mp4`;
    const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', webm, '-movflags', '+faststart', '-pix_fmt', 'yuv420p', mp4]);
    if (r.status === 0) rmSync(webm); else renameSync(webm, `${stem}.webm`);
    rmSync(videoDir, { recursive: true, force: true });
  }
  return { device: deviceName, mapId, wave, file: `${stem}.png`, simMs: Math.round(capture.simMs), enemies: capture.enemies,
    ignoredBuild: capture.errors, problems };
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.rebuild || !existsSync(DIST_DIR)) {
    await build({ mode: 'capture', logLevel: 'warn', build: { outDir: DIST_DIR, emptyOutDir: true } });
  }
  const server = await preview({ logLevel: 'warn', build: { outDir: DIST_DIR }, preview: { port: PORT, strictPort: true } });
  const base = `http://localhost:${PORT}`;
  const browser = await chromium.launch();
  const results = [];
  try {
    for (const deviceName of opts.devices) {
      for (const mapId of opts.maps) {
        const r = await captureOne(browser, base, deviceName, mapId, opts);
        results.push(r);
        const flag = r.problems.length ? `  (${r.problems.length} console problems)` : '';
        console.log(`${r.file}  sim ${(r.simMs / 1000).toFixed(1)}s, ${r.enemies} enemies${flag}`);
      }
    }
  } finally {
    await browser.close();
    await new Promise(res => server.httpServer.close(res));
  }
  writeFileSync(join(OUT_DIR, 'report.json'), JSON.stringify(results, null, 2));
  const bad = results.filter(r => r.problems.length || r.ignoredBuild.length);
  if (bad.length) console.log(`\n${bad.length} capture(s) logged problems — see ${OUT_DIR}/report.json`);
}

main().catch(err => { console.error(err); process.exit(1); });
