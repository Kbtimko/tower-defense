#!/usr/bin/env node
// Performance gate (roadmap 6.1): plays the busiest wave of each map in the capture
// build on the real GPU and fails if the frame rate misses the PERF_BUDGET. Reads
// window.__fps (the same meter as ?fps=1) so the gate and the on-screen counter can't disagree.
//
//   npm run perf -- [--maps 0,9] [--runs phone] [--cpu-throttle N] [--rebuild] [--port N]
//
// Exit 0 pass, 1 a verdict failed, 2 the machine can't give meaningful numbers.
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import os from 'node:os';
import { build, preview } from 'vite';
import { chromium } from 'playwright';
import { DEVICES } from './captureDevices.mjs';
import { MAPS } from '../src/data/maps.js';
import { MAP_WAVES } from '../src/data/waves.js';
import { defaultCaptureBuild } from '../src/systems/debugCapture.js';
import { PERF_BUDGET } from '../src/data/perfBudget.js';
import { perfVerdict } from '../src/systems/perfVerdict.js';

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
const load = os.loadavg()[0];
if (load >= B.maxLoad) { console.error(`load average ${load.toFixed(2)} >= ${B.maxLoad}: the numbers would measure the host, not the game`); process.exit(2); }

if (args.includes('--rebuild') || !existsSync(DIST)) {
  await build({ mode: 'capture', logLevel: 'warn', build: { outDir: DIST, emptyOutDir: true } });
}
const server = await preview({ logLevel: 'warn', build: { outDir: DIST }, preview: { port: PORT, strictPort: true } });
const browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const results = [];
let code = 0;
try {
  for (const mapId of mapIds) for (const run of runs) {
    const { portrait, ...ctxOpts } = DEVICES[run.device];
    const ctx = await browser.newContext(ctxOpts);
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    const cdp = await ctx.newCDPSession(page);
    const wave = MAP_WAVES[mapId].length;
    const q = new URLSearchParams({ debug: '1', map: String(mapId), wave: String(wave), build: defaultCaptureBuild(MAPS[mapId].towerSlots.length), fps: '1' });
    await page.goto(`http://localhost:${PORT}/?${q}`);
    await page.waitForFunction(() => window.__capture && window.__fps && window.__capture.simMs >= 0, null, { timeout: 120_000 });
    await page.waitForFunction(ms => window.__capture.simMs >= ms, B.warmupSimMs, { timeout: 120_000 });
    const renderer = await page.evaluate(() => {
      const gl = document.createElement('canvas').getContext('webgl');
      const dbg = gl && gl.getExtension('WEBGL_debug_renderer_info');
      return dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : 'n/a';
    });
    if (/SwiftShader/i.test(renderer)) { console.error(`software GL (${renderer}): the numbers would be meaningless`); await browser.close(); server.httpServer.close(); process.exit(2); }
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
    if (failures.length) code = 1;
    const r = { map: mapId, wave, run: run.id, device: run.device, throttle, renderer, ...stats, peakEnemies, canvas, failures };
    results.push(r);
    console.log(`map ${mapId} ${run.id} x${throttle}  fps ${stats.fps}  p95 ${stats.p95}ms  p99 ${stats.p99}ms  enemies<=${peakEnemies}  canvas ${canvas}  ${failures.length ? 'FAIL: ' + failures.join('; ') : 'PASS'}`);
    await ctx.close();
  }
} finally { await browser.close(); server.httpServer.close(); }
mkdirSync(OUT, { recursive: true });
writeFileSync(`${OUT}/report.json`, JSON.stringify({ load, budget: B, results }, null, 2));
console.log(code ? 'perf gate FAILED' : 'perf gate passed');
process.exit(code);
