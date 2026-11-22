#!/usr/bin/env node
// Performance gate (roadmap 6.1): plays the busiest wave of each map in the capture
// build on the real GPU and fails if the frame rate misses the PERF_BUDGET. Reads
// window.__fps (the same meter as ?fps=1) so the gate and the on-screen counter can't disagree.
//
//   npm run perf -- [--maps 0,9] [--runs phone] [--cpu-throttle N] [--no-build] [--port N]
//
// Rebuilds the capture build from the working tree by default so the gate can never measure a
// stale dist; --no-build reuses .art-cache/capture-dist. HEAD's short sha goes in the header and report.
// Exit 0 pass, 1 a verdict failed, 2 the machine can't give meaningful numbers (load >= maxLoad at
// any run start, software/unknown renderer, a run that errored). report.json is always written.
import { mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import { build, preview } from 'vite';
import { chromium } from 'playwright';
import { DEVICES } from './captureDevices.mjs';
import { MAPS } from '../src/data/maps.js';
import { MAP_WAVES } from '../src/data/waves.js';
import { defaultCaptureBuild } from '../src/systems/debugCapture.js';
import { PERF_BUDGET } from '../src/data/perfBudget.js';
import { perfVerdict, perfExitCode, unmeasurableReason } from '../src/systems/perfVerdict.js';

const args = process.argv.slice(2);
const flag = (n, d) => { const i = args.indexOf(n); return i < 0 ? d : args[i + 1]; };
const DIST = '.art-cache/capture-dist', OUT = '.art-cache/perf';
const PORT = Number(flag('--port', 4190));
const B = PERF_BUDGET;
const mapIds = flag('--maps', null)?.split(',').map(Number) ?? Object.keys(MAPS).map(Number);
const runIds = flag('--runs', null)?.split(',');
const runs = B.runs.filter(r => !runIds || runIds.includes(r.id));
const throttleOverride = flag('--cpu-throttle', null);

if (!runs.length) { console.error(`no runs match --runs ${runIds}`); process.exit(2); }
const sha = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim();
console.log(`perf gate @ ${sha}${args.includes('--no-build') ? ' (--no-build: reusing the existing capture build)' : ''}`);

if (!args.includes('--no-build')) {
  await build({ mode: 'capture', logLevel: 'warn', build: { outDir: DIST, emptyOutDir: true } });
}
const server = await preview({ logLevel: 'warn', build: { outDir: DIST }, preview: { port: PORT, strictPort: true } });
const browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const results = [];
try {
  runLoop: for (const mapId of mapIds) for (const run of runs) {
    // Sampled per run, not once: a ~10 minute gate on a shared host can meet contention midway.
    const load = os.loadavg()[0];
    const r = { map: mapId, run: run.id, device: run.device, load: Number(load.toFixed(2)) };
    results.push(r);
    if (load >= B.maxLoad) {
      console.error(`map ${mapId} ${run.id}: load average ${load.toFixed(2)} >= ${B.maxLoad}: the numbers would measure the host, not the game`);
      break runLoop;
    }
    let ctx;
    try {
      const { portrait, ...ctxOpts } = DEVICES[run.device];
      ctx = await browser.newContext(ctxOpts);
      const page = await ctx.newPage();
      const errors = []; page.on('pageerror', e => errors.push(e.message));
      const cdp = await ctx.newCDPSession(page);
      const wave = MAP_WAVES[mapId].length;
      const q = new URLSearchParams({ debug: '1', map: String(mapId), wave: String(wave), build: defaultCaptureBuild(MAPS[mapId].towerSlots.length), fps: '1' });
      await page.goto(`http://localhost:${PORT}/?${q}`);
      await page.waitForFunction(() => window.__capture && window.__fps && window.__capture.simMs >= 0, null, { timeout: 120_000 });
      await page.waitForFunction(ms => window.__capture.simMs >= ms, B.warmupSimMs, { timeout: 120_000 });
      const { renderer, gameRendererType } = await page.evaluate(() => {
        const gl = document.createElement('canvas').getContext('webgl');
        const dbg = gl && gl.getExtension('WEBGL_debug_renderer_info');
        // __game is the GameScene (capture build); its game.renderer is the one actually drawing.
        return { renderer: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : 'n/a', gameRendererType: window.__game?.sys.game.renderer?.type };
      });
      Object.assign(r, { renderer, gameRendererType, wave });
      const why = unmeasurableReason(renderer, gameRendererType);
      if (why) { r.unmeasurable = why; console.error(`map ${mapId} ${run.id}: ${why}: the numbers would be meaningless`); break runLoop; }
      const throttle = throttleOverride ? Number(throttleOverride) : run.cpuThrottle;
      if (throttle > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle });
      const [stats, peakEnemies] = await Promise.all([
        page.evaluate(ms => new Promise(res => setTimeout(() => res(window.__fps.stats(ms)), ms)), B.sampleMs),
        page.evaluate(ms => new Promise(res => {
          let peak = 0; const end = performance.now() + ms;
          const t = setInterval(() => { peak = Math.max(peak, window.__capture.enemies); if (performance.now() >= end) { clearInterval(t); res(peak); } }, 250);
        }), B.sampleMs),
      ]);
      const canvas = await page.evaluate(() => { const c = document.querySelector('#game > canvas'); return `${c.width}x${c.height}`; });
      const failures = perfVerdict(stats, run);
      if (errors.length) failures.push(`${errors.length} page error(s): ${errors[0]}`);
      Object.assign(r, { throttle, ...stats, peakEnemies, canvas, failures });
      console.log(`map ${mapId} ${run.id} x${throttle}  fps ${stats.fps}  p95 ${stats.p95}ms  p99 ${stats.p99}ms  enemies<=${peakEnemies}  canvas ${canvas}  load ${r.load}  ${failures.length ? 'FAIL: ' + failures.join('; ') : 'PASS'}`);
    } catch (e) {
      r.error = String(e.message ?? e).split('\n')[0];
      console.error(`map ${mapId} ${run.id}: run errored: ${r.error}`);
    } finally { await ctx?.close().catch(() => {}); }
  }
} finally { await browser.close().catch(() => {}); server.httpServer.close(); }
const code = perfExitCode(results, B.maxLoad);
mkdirSync(OUT, { recursive: true });
writeFileSync(`${OUT}/report.json`, JSON.stringify({ sha, code, budget: B, results }, null, 2));
console.log(['perf gate passed', 'perf gate FAILED (a verdict failed)', 'perf gate UNMEASURABLE (host load, software GL, or a run errored)'][code] + `  @ ${sha}`);
process.exit(code);
