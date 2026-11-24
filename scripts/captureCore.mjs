// Capture primitives shared by scripts/capture.mjs and scripts/release-media.mjs.
import { MAPS } from '../src/data/maps.js';
import { MAP_WAVES } from '../src/data/waves.js';
import { defaultCaptureBuild } from '../src/systems/debugCapture.js';
import { POINTER_FINE_QUERY } from '../src/data/mobile.js';
import { WORLD_WIDTH, WORLD_HEIGHT } from '../src/data/layout.js';
import { worldToPagePoint } from '../src/systems/deviceFlow.js';
import { inMiddleBand, centroidOf } from '../src/systems/releaseMedia.js';

export const MIN_ENEMIES = 3;

// Playwright rejects unknown context options, so strip ours before newContext.
export function contextOptions(device) {
  const { portrait, ...options } = device;
  return options;
}

export function captureUrl(mapId, opts) {
  const wave = opts.wave ?? Math.ceil(MAP_WAVES[mapId].length / 2);
  const params = new URLSearchParams({ debug: '1', map: String(mapId), wave: String(wave) });
  params.set('build', opts.build ?? defaultCaptureBuild(MAPS[mapId].towerSlots.length));
  if (opts.hero) params.set('hero', opts.hero);
  if (opts.autosend === true) params.set('autosend', '1');
  return { wave, path: `/?${params}` };
}

// `blockedUrl`: a run that aborts those requests on purpose expects their load
// errors, and only theirs.
export function watchProblems(page, { blockedUrl = null } = {}) {
  const problems = [];
  page.on('pageerror', e => problems.push(`pageerror: ${e.message}`));
  page.on('console', m => {
    // Headless GPU chatter (ReadPixels stalls from the screenshot itself).
    if (m.text().includes('GL Driver Message')) return;
    if (blockedUrl && m.text().startsWith('Failed to load resource') && blockedUrl.test(m.location().url)) return;
    if (m.type() === 'error' || m.type() === 'warning') problems.push(`${m.type()}: ${m.text()}`);
  });
  return problems;
}

// Waits `waitMs` of game time, then holds out for a crowd on the path,
// keeping the busiest frame seen: a strong scripted build can kill fast
// enemies before three are ever alive. Gives up at 3x the wait.
export async function shootBusiestFrame(page, waitMs, file) {
  await page.waitForFunction(() => window.__capture, null, { timeout: 30_000 });
  // Game time, not wall time: a headless browser may run well under 60 fps.
  await page.waitForFunction(ms => window.__capture.simMs >= ms, waitMs, { timeout: waitMs * 8 + 30_000, polling: 100 });
  let best = -1;
  let shotSimMs = 0;
  for (;;) {
    const c = await page.evaluate(() => ({ enemies: window.__capture.enemies, simMs: window.__capture.simMs }));
    if (c.enemies > best) {
      best = c.enemies;
      shotSimMs = c.simMs;
      await page.screenshot({ path: file });
    }
    if (best >= MIN_ENEMIES || c.simMs >= waitMs * 3) break;
    await page.waitForTimeout(150);
  }
  const { errors, towers } = await page.evaluate(() => ({ errors: window.__capture.errors, towers: window.__capture.towers }));
  return { errors, towers, enemies: best, simMs: shotSimMs };
}


const GAME_CANVAS = '#game > canvas';

// The playfield (world 0..WORLD_WIDTH x 0..WORLD_HEIGHT) in page pixels, rails and letterbox excluded.
export async function boardRect(page) {
  const pointerFine = await page.evaluate(q => matchMedia(q).matches, POINTER_FINE_QUERY);
  const box = await page.locator(GAME_CANVAS).boundingBox();
  const a = worldToPagePoint({ x: 0, y: 0 }, box, { pointerFine });
  const b = worldToPagePoint({ x: WORLD_WIDTH, y: WORLD_HEIGHT }, box, { pointerFine });
  return { x0: a.x, y0: a.y, x1: b.x, y1: b.y, pointerFine, box };
}

// Enemies on the middle of the road, centroid in page pixels. Shared by the shot and the clip.
export function middleBand(crowd, band, board) {
  const mid = crowd.filter(e => inMiddleBand(e.progress, band));
  const pts = mid.map(e => worldToPagePoint(e, board.box, { pointerFine: board.pointerFine }));
  return { count: mid.length, centroid: centroidOf(pts) };
}

// Polls game time from `fromSimMs` to `toSimMs`, scoring each frame by the enemies in the
// middle band of the road (ties: total live enemies), and keeps a screenshot of the best.
// Game time, not wall time: a headless browser may run well under 60 fps.
export async function shootBestFrame(page, { fromSimMs, toSimMs, file, midBand, label = 'shot' }) {
  await page.waitForFunction(() => window.__capture, null, { timeout: 30_000 });
  await page.waitForFunction(ms => window.__capture.simMs >= ms, fromSimMs, { timeout: fromSimMs * 8 + 30_000, polling: 100 });
  const board = await boardRect(page);
  // Wall-clock bound: a level that ends or a stalled page must fail loudly, not hang.
  const deadline = Date.now() + toSimMs * 8 + 30_000;
  let best = -1, bestTotal = -1, simMs = 0, centroid = null, total = 0, lastSimMs = 0;
  for (;;) {
    if (Date.now() > deadline) throw new Error(`${label}: sim time never reached ${toSimMs} ms (stopped at ${lastSimMs} ms)`);
    const c = await page.evaluate(() => ({ crowd: window.__capture.crowd(), simMs: window.__capture.simMs }));
    lastSimMs = c.simMs;
    const mid = middleBand(c.crowd, midBand, board);
    if (mid.count > best || (mid.count === best && c.crowd.length > bestTotal)) {
      best = mid.count; bestTotal = c.crowd.length; simMs = c.simMs; centroid = mid.centroid; total = c.crowd.length;
      await page.screenshot({ path: file });
    }
    if (c.simMs >= toSimMs) break;
    await page.waitForTimeout(150);
  }
  const { errors, towers } = await page.evaluate(() => ({ errors: window.__capture.errors, towers: window.__capture.towers }));
  return { best, total, simMs, centroid, board, errors, towers };
}
