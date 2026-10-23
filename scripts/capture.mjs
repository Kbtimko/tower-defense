#!/usr/bin/env node
// Screenshot harness: builds the game in `capture` mode (debug query hooks
// compiled in — the production build strips them), serves it with
// `vite preview`, and drives it with Playwright.
//
//   npm run capture -- [--maps 0,3,5,9] [--wave N] [--seconds 6]
//                      [--build "archer@0:3,mage@4:4b"] [--hero rael]
//                      [--devices desktop,desktop1440,desktop1080,iphone,pixel,ipad] [--video [secs]]
//                      [--no-build] [--screens | --flow]
//
//   npm run matrix -- [--devices iphone] [--no-build]     (= capture.mjs --flow)
//
// --screens shoots the non-gameplay screens instead (first-run story, map
// select, in-game, tower ring, build radial, defeat, victory) into <device>/screens/, using
// the first of --maps.
// Output: .art-cache/captures/<device>/map<N>-w<W>.png (+ .mp4 with --video)
// and .art-cache/captures/report.json listing console errors per capture.
// --wave defaults to the middle wave of each map; --build defaults to one of
// every tower at mixed tiers (defaultCaptureBuild).
//
// --flow plays the opening of a fresh first run with real input on each device
// (boot -> map 0 -> radial build archer -> ring upgrade -> send wave -> pause), asserting
// the game state after every step and shooting <device>/flow/NN-id.png. It
// always uses map 0 and ignores --maps/--wave/--build/--hero/--video; without
// --devices it runs desktop,iphone,pixel,ipad. Exits 1 if any device fails.
import { mkdirSync, writeFileSync, renameSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { build, preview } from 'vite';
import { chromium, devices } from 'playwright';
import { MAPS } from '../src/data/maps.js';
import { MAP_WAVES } from '../src/data/waves.js';
import { defaultCaptureBuild } from '../src/systems/debugCapture.js';
import { layoutProblems, railProblems, railGeometryProblems, overlayProblems, minTouchFor, radialProblems } from '../src/systems/layoutAudit.js';
import { POINTER_FINE_QUERY } from '../src/data/mobile.js';
import { CONFIRM_WINDOW_MS } from '../src/data/input.js';
import { WORLD_WIDTH, WORLD_HEIGHT } from '../src/data/layout.js';
import { stepsFor, shotName, worldToPagePoint, flowExpectations, summarizeFlow, freePad, padWorldPoint } from '../src/systems/deviceFlow.js';

const OUT_DIR   = '.art-cache/captures';
const DIST_DIR  = '.art-cache/capture-dist';
const PORT      = 4188;
const MIN_ENEMIES = 3;
// The roadmap's three touch devices plus a fine-pointer desktop (104-px rails).
const FLOW_DEVICES = ['desktop', 'iphone', 'pixel', 'ipad'];
const FLOW_TOWER = 'archer';
const STEP_TIMEOUT = 10_000;

// Landscape presets: the game is landscape-only, so portrait shots would only
// show the letterboxing. `portrait` names the same device upright, for the
// rotate-the-phone audit (a player always starts holding it upright).
// Playwright ships no 844x390 / 932x430 descriptors; these are the iPhone 14 landscape
// emulation resized to the common modern-phone viewports.
const phone = (width, height) => ({
  ...devices['iPhone 14 landscape'],
  viewport: { width, height },
  portrait: { ...devices['iPhone 14'], viewport: { width: height, height: width } },
});

const DEVICES = {
  desktop: { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 },
  desktop1440: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
  desktop1080: { viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 },
  phone844: phone(844, 390),
  phone932: phone(932, 430),
  iphone:  { ...devices['iPhone 14 landscape'], portrait: 'iPhone 14' },
  pixel:   { ...devices['Pixel 7 landscape'], portrait: 'Pixel 7' },
  ipad:    { ...devices['iPad Pro 11 landscape'], portrait: 'iPad Pro 11' },
};

// Controls a phone player must be able to reach on each screen.
const MAP_SELECT_TARGETS = ['#featured-play'];
const IN_GAME_TARGETS = ['#pause-btn', '#speed-btn', '#open-codex', '.tower-btn', '#exit-btn', '#wave-btn', '.ability-btn-wrap'];
// DOM overlays opened from map select. Their controls are in CSS px (not the scaled canvas), so
// touch devices hold them to the full 44 px. Labels, not checkboxes: the label row is the target.
// Only the first codex entries: the list scrolls, and every entry shares one rule.
const CODEX_TARGETS = ['#codex-close', '.codex-tab', '#codex-list .codex-entry:nth-child(-n+3)'];
const SETTINGS_TARGETS = ['#settings-close', '#settings-overlay input[type=range]', '.settings-mute label'];
const OVERLAY_AUDITS = new Set([CODEX_TARGETS, SETTINGS_TARGETS]);
// Real HUD control that is hidden by design until a tower is armed: held to the rail rules
// when visible, but never reported as `hidden` by layoutProblems.
const RAIL_ONLY_TARGETS = ['#cancel-btn'];

// Playwright rejects unknown context options, so strip ours before newContext.
function contextOptions(device) {
  const { portrait, ...options } = device;
  return options;
}

function parseArgs(argv) {
  const opts = { maps: [0, 3, 5, 9], wave: null, seconds: 6, build: null, hero: null,
    devices: null, video: 0, rebuild: true, screens: false, flow: false };
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
    else if (a === '--screens')  opts.screens = true;
    else if (a === '--flow')     opts.flow = true;
    else if (a === '--video') {
      const secs = Number(argv[i + 1]);
      opts.video = Number.isFinite(secs) && secs > 0 ? (i++, secs) : 10;
    } else throw new Error(`unknown argument ${a}`);
  }
  if (opts.flow && opts.screens) throw new Error('--flow and --screens are separate modes; pass one');
  opts.devices ??= opts.flow ? FLOW_DEVICES : ['desktop'];
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

function watchProblems(page) {
  const problems = [];
  page.on('pageerror', e => problems.push(`pageerror: ${e.message}`));
  page.on('console', m => {
    // Headless GPU chatter (ReadPixels stalls from the screenshot itself).
    if (m.text().includes('GL Driver Message')) return;
    if (m.type() === 'error' || m.type() === 'warning') problems.push(`${m.type()}: ${m.text()}`);
  });
  return problems;
}

// Waits `waitMs` of game time, then holds out for a crowd on the path,
// keeping the busiest frame seen: a strong scripted build can kill fast
// enemies before three are ever alive. Gives up at 3x the wait.
async function shootBusiestFrame(page, waitMs, file) {
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

// World point -> page point: the map sits one rail into the FIT-scaled canvas. Rail width depends
// on the page's pointer class, which this Node process can't see, so ask the page.
async function gamePagePoint(page, x, y) {
  const pointerFine = await page.evaluate(q => matchMedia(q).matches, POINTER_FINE_QUERY);
  const box = await page.locator('#game canvas').boundingBox();
  return worldToPagePoint({ x, y }, box, { pointerFine });
}

async function clickGamePoint(page, x, y) {
  const p = await gamePagePoint(page, x, y);
  await page.mouse.click(p.x, p.y);
}

// Canvas counterpart of tap(): a real touch on touch devices, the mouse otherwise.
async function tapGamePoint(page, deviceName, x, y) {
  const p = await gamePagePoint(page, x, y);
  if (DEVICES[deviceName].hasTouch) await page.touchscreen.tap(p.x, p.y);
  else await page.mouse.click(p.x, p.y);
}

// A real pointer event (Phaser/DOM handlers ignore synthetic ones): touch devices tap.
async function tap(page, deviceName, selector) {
  const locator = page.locator(selector);
  if (DEVICES[deviceName].hasTouch) await locator.tap();
  else await locator.click();
}

// Collects layout metrics inside the page and returns { device, label, problems }.
// getBoundingClientRect ignores ancestor clipping, so each target also gets
// visibleRect: its rect intersected with every overflow-clipping ancestor.
async function audit(page, deviceName, label, selectors, railOnly = []) {
  const metrics = await page.evaluate(({ sels, pointerFineQuery }) => {
    const clipRect = el => {
      const r = el.getBoundingClientRect();
      let { left, top, right, bottom } = r;
      for (let a = el.parentElement; a; a = a.parentElement) {
        const cs = getComputedStyle(a);
        const ar = a.getBoundingClientRect();
        if (cs.overflowX !== 'visible') { left = Math.max(left, ar.left); right = Math.min(right, ar.right); }
        if (cs.overflowY !== 'visible') { top = Math.max(top, ar.top); bottom = Math.min(bottom, ar.bottom); }
      }
      if (right <= left || bottom <= top) return null;
      return { left, top, right, bottom, width: right - left, height: bottom - top };
    };
    const plain = r => ({ left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height });
    const targets = [];
    for (const sel of sels) {
      const els = [...document.querySelectorAll(sel)];
      if (!els.length) targets.push({ name: sel, rect: null, visible: false });
      els.forEach((el, i) => {
        const visible = el.checkVisibility
          ? el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })
          : getComputedStyle(el).visibility !== 'hidden' && el.getClientRects().length > 0;
        targets.push({ name: /^#[\w-]+$/.test(sel) ? sel : `${sel}[${i}]`, rect: plain(el.getBoundingClientRect()), visibleRect: clipRect(el), visible });
      });
    }
    const rect = sel => { const el = document.querySelector(sel); return el ? plain(el.getBoundingClientRect()) : null; };
    return {
      innerWidth: window.innerWidth, innerHeight: window.innerHeight,
      scale: window.visualViewport.scale, scrollWidth: document.documentElement.scrollWidth, targets,
      rails: { left: rect('#rail-left'), right: rect('#rail-right') },
      canvas: rect('#game canvas'),
      pointerFine: matchMedia(pointerFineQuery).matches,
    };
  }, { sels: [...selectors, ...railOnly], pointerFineQuery: POINTER_FINE_QUERY });
  const viewport = page.viewportSize();
  const problems = layoutProblems({ ...metrics, device: viewport, targets: metrics.targets.filter(t => !railOnly.includes(t.name)) });
  // Rails only exist in-game; the map-select audits list no HUD controls.
  if (selectors === IN_GAME_TARGETS) {
    const device = DEVICES[deviceName];
    problems.push(...railProblems({
      device: { hasTouch: !!device.hasTouch }, rails: metrics.rails, targets: metrics.targets,
      minTouchPx: minTouchFor({ vw: viewport.width, vh: viewport.height }),
    }));
    problems.push(...railGeometryProblems({
      device: { name: deviceName, hasTouch: !!device.hasTouch },
      pointerFine: metrics.pointerFine,
      canvasRect: metrics.canvas,
      rails: [['#rail-left', metrics.rails.left], ['#rail-right', metrics.rails.right]]
        .filter(([, rect]) => rect).map(([id, rect]) => ({ id, width: rect.width })),
    }));
  }
  if (OVERLAY_AUDITS.has(selectors)) {
    problems.push(...overlayProblems({ device: { hasTouch: !!DEVICES[deviceName].hasTouch }, targets: metrics.targets }));
  }
  return { device: deviceName, label, problems };
}

// Opens a map-select overlay with a real tap, audits + shoots it, closes it with a real tap.
async function auditOverlay(page, deviceName, { open, root, close, targets, label, file }) {
  await tap(page, deviceName, open);
  await page.locator(root).waitFor({ state: 'visible', timeout: 5_000 });
  await page.waitForTimeout(400);
  const result = await audit(page, deviceName, label, targets);
  await shoot(page, file);
  await tap(page, deviceName, close);
  await page.locator(root).waitFor({ state: 'hidden', timeout: 5_000 });
  return { result, file };
}

// Measures the open radial in page px and judges it with radialProblems. The map
// rect is the canvas minus both rails, from the page's own pointer class.
async function radialAudit(page, deviceName, label) {
  const pointerFine = await page.evaluate(q => matchMedia(q).matches, POINTER_FINE_QUERY);
  const box = await page.locator('#game canvas').boundingBox();
  const a = worldToPagePoint({ x: 0, y: 0 }, box, { pointerFine });
  const b = worldToPagePoint({ x: WORLD_WIDTH, y: WORLD_HEIGHT }, box, { pointerFine });
  const m = await page.evaluate(() => {
    const plain = r => ({ left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height });
    const face = (el, name) => ({ name, rect: plain(el.getBoundingClientRect()), visible: el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) });
    const rect = sel => { const el = document.querySelector(sel); return el ? plain(el.getBoundingClientRect()) : null; };
    const hub = document.querySelector('#radial-hub');
    return {
      items: [...document.querySelectorAll('#radial .radial-item')].map((el, i) => face(el, el.dataset.id ?? `.radial-item[${i}]`)),
      hub: hub ? face(hub, '#radial-hub') : null,
      rails: { left: rect('#rail-left'), right: rect('#rail-right') },
    };
  });
  const viewport = page.viewportSize();
  // Same rule as railProblems: the touch floor only binds touch devices.
  const minTouchPx = DEVICES[deviceName].hasTouch ? minTouchFor({ vw: viewport.width, vh: viewport.height }) : 0;
  const mapRect = { left: a.x, top: a.y, right: b.x, bottom: b.y, width: b.x - a.x, height: b.y - a.y };
  return { device: deviceName, label, problems: radialProblems({ ...m, mapRect, minTouchPx }) };
}

async function shoot(page, file, options = {}) {
  await page.screenshot({ path: file, ...options });
  return file;
}

// The non-gameplay screens, in the order a new player meets them. Used for the
// before/after baseline (roadmap 0.3).
async function captureScreens(browser, base, deviceName, opts) {
  const dir = join(OUT_DIR, deviceName, 'screens');
  mkdirSync(dir, { recursive: true });
  const mapId = opts.maps[0];
  const { path } = captureUrl(mapId, opts);
  const context = await browser.newContext(contextOptions(DEVICES[deviceName]));
  const problems = [];
  const files = [];
  const layout = [];
  try {
    // A fresh context has empty localStorage, so this is a true first run.
    let page = await context.newPage();
    const p1 = watchProblems(page);
    await page.goto(base + '/');
    await page.locator('#story-dialog-skip').waitFor({ state: 'visible', timeout: 30_000 });
    await page.waitForTimeout(1500);
    files.push(await shoot(page, join(dir, '01-first-run-story.png')));
    await page.locator('#story-dialog-skip').click();
    await page.waitForTimeout(800);
    files.push(await shoot(page, join(dir, '02-map-select.png')));
    layout.push(await audit(page, deviceName, 'map-select', MAP_SELECT_TARGETS));
    for (const o of [
      { open: '#open-codex-ms', root: '#codex-overlay', close: '#codex-close', targets: CODEX_TARGETS, label: 'codex', file: join(dir, '08-codex.png') },
      { open: '#open-settings', root: '#settings-overlay', close: '#settings-close', targets: SETTINGS_TARGETS, label: 'settings', file: join(dir, '09-settings.png') },
    ]) {
      const { result, file } = await auditOverlay(page, deviceName, o);
      layout.push(result);
      files.push(file);
    }
    problems.push(...p1);
    await page.close();

    page = await context.newPage();
    const p2 = watchProblems(page);
    await page.goto(base + path);
    const cap = await shootBusiestFrame(page, opts.seconds * 1000, join(dir, '03-in-game.png'));
    files.push(join(dir, '03-in-game.png'));
    layout.push(await audit(page, deviceName, 'in-game', IN_GAME_TARGETS, RAIL_ONLY_TARGETS));
    // A real tap arms a tower, which is the only way #cancel-btn becomes visible.
    await tap(page, deviceName, '.tower-btn[data-type="archer"]');
    await page.locator('#cancel-btn').waitFor({ state: 'visible', timeout: 5_000 });
    layout.push(await audit(page, deviceName, 'in-game-armed', IN_GAME_TARGETS, RAIL_ONLY_TARGETS));
    await tap(page, deviceName, '#cancel-btn');
    await page.locator('#cancel-btn').waitFor({ state: 'hidden', timeout: 5_000 });
    const tower = cap.towers[0];
    if (tower) {
      await clickGamePoint(page, tower.x, tower.y);
      await page.locator('#radial[data-kind="tower"]').waitFor({ state: 'visible', timeout: 5_000 });
      await page.waitForTimeout(300);
      files.push(await shoot(page, join(dir, '04-tower-ring.png')));
      layout.push(await radialAudit(page, deviceName, 'tower-ring'));
      await tap(page, deviceName, '#cancel-btn');
      await page.locator('#radial').waitFor({ state: 'hidden', timeout: 5_000 });
    }
    const pad = freePad(MAPS[mapId], cap.towers);
    if (pad === null) {
      layout.push({ device: deviceName, label: 'build-radial', problems: ['no free pad for the build radial'] });
    } else {
      const p = padWorldPoint(MAPS[mapId], pad);
      await clickGamePoint(page, p.x, p.y);
      await page.locator('#radial[data-kind="build"]').waitFor({ state: 'visible', timeout: 5_000 });
      await page.waitForTimeout(300);
      files.push(await shoot(page, join(dir, '04b-build-radial.png')));
      layout.push(await radialAudit(page, deviceName, 'build-radial'));
    }
    await page.evaluate(() => window.__capture.end('defeat'));
    await page.locator('#game-msg').waitFor({ state: 'visible', timeout: 5_000 });
    await page.waitForTimeout(500);
    files.push(await shoot(page, join(dir, '05-defeat.png')));
    problems.push(...p2);
    await page.close();

    page = await context.newPage();
    const p3 = watchProblems(page);
    await page.goto(base + path);
    await page.waitForFunction(() => window.__capture, null, { timeout: 30_000 });
    await page.evaluate(() => window.__capture.end('victory'));
    await page.waitForTimeout(1500);
    if (await page.locator('#story-dialog-skip').isVisible()) {
      files.push(await shoot(page, join(dir, '06-victory-story.png')));
      await page.locator('#story-dialog-skip').click();
    }
    await page.locator('#game-msg').waitFor({ state: 'visible', timeout: 5_000 });
    await page.waitForTimeout(500);
    files.push(await shoot(page, join(dir, '07-victory.png')));
    problems.push(...p3);
  } finally {
    await context.close();
  }
  if (DEVICES[deviceName].portrait) {
    const rotated = await captureRotation(browser, base, deviceName, path, dir);
    files.push(...rotated.files);
    layout.push(...rotated.layout);
    problems.push(...rotated.problems);
  }
  return { device: deviceName, screens: files, problems, layout };
}

// A phone starts upright and is then turned: that rotation is where the page
// zoom and the clipped PLAY button appear, so it needs its own contexts. The
// portrait descriptor supplies the UA / touch / DPR; setViewportSize is the turn.
async function captureRotation(browser, base, deviceName, levelPath, dir) {
  const device = DEVICES[deviceName];
  const landscape = device.viewport;
  const files = [];
  const layout = [];
  const problems = [];
  const upright = () => browser.newContext(contextOptions(typeof device.portrait === 'string' ? devices[device.portrait] : device.portrait));
  const rotate = async page => {
    await page.setViewportSize(landscape);
    await page.waitForTimeout(800);
  };

  let context = await upright();
  try {
    const page = await context.newPage();
    const p4 = watchProblems(page);
    await page.goto(base + '/');
    await page.locator('#story-dialog-skip').waitFor({ state: 'visible', timeout: 30_000 });
    await page.waitForTimeout(1500);
    // el.click(), not a pointer click: the rotate prompt covers the page upright.
    await page.evaluate(() => document.querySelector('#story-dialog-skip')?.click());
    await page.waitForTimeout(800);
    files.push(await shoot(page, join(dir, '00-portrait.png')));
    // Page-level only (no targets): the rotate prompt covers the controls, but the
    // document must not be wider than the viewport or zoomed while upright.
    layout.push(await audit(page, deviceName, 'portrait-map-select', []));
    await rotate(page);
    files.push(await shoot(page, join(dir, '02b-map-select-rotated.png')));
    layout.push(await audit(page, deviceName, 'rotated-map-select', MAP_SELECT_TARGETS));
    // el.click(), not a pointer click: the point is to reach the level even when
    // the button is clipped, so the in-game half of the audit still runs.
    await page.evaluate(() => document.querySelector('#featured-play')?.click());
    const entered = await page.locator('#wave-btn').waitFor({ state: 'visible', timeout: 10_000 }).then(() => true, () => false);
    if (entered) {
      await page.waitForTimeout(1500);
      files.push(await shoot(page, join(dir, '03b-in-game-rotated.png')));
      layout.push(await audit(page, deviceName, 'rotated-in-game', IN_GAME_TARGETS, RAIL_ONLY_TARGETS));
    } else {
      layout.push({ device: deviceName, label: 'rotated-in-game', problems: ['level never started after PLAY'] });
    }
    problems.push(...p4);
  } finally {
    await context.close();
  }

  context = await upright();
  try {
    const page = await context.newPage();
    const p5 = watchProblems(page);
    await page.goto(base + levelPath);
    await page.waitForFunction(() => window.__capture, null, { timeout: 30_000 });
    await page.waitForTimeout(1500);
    layout.push(await audit(page, deviceName, 'portrait-mid-level', []));
    await rotate(page);
    files.push(await shoot(page, join(dir, '03c-mid-level-rotated.png')));
    layout.push(await audit(page, deviceName, 'rotated-mid-level', IN_GAME_TARGETS, RAIL_ONLY_TARGETS));
    problems.push(...p5);
  } finally {
    await context.close();
  }
  return { files, layout, problems };
}

// Polls `read` until `ok` holds; on timeout throws with the last value seen,
// so a failing step says what the page actually showed.
async function until(read, ok, describe, timeout = STEP_TIMEOUT) {
  const deadline = Date.now() + timeout;
  for (;;) {
    const value = await read();
    if (ok(value)) return value;
    if (Date.now() >= deadline) throw new Error(describe(value));
    await new Promise(res => setTimeout(res, 100));
  }
}

// Short per-read timeout: textContent() otherwise auto-waits 30 s for a missing
// element, overriding until()'s own deadline.
const text = (page, sel) => page.locator(sel).first().textContent({ timeout: 1_000 }).then(t => t?.trim() ?? null);
const visible = (page, sel) => page.locator(sel).first().isVisible();
const hasClass = (page, sel, cls) => page.locator(sel).first().evaluate((el, c) => el.classList.contains(c), cls);

// Samples the MAP rect only, not the whole canvas: the HUD rails overlay the canvas
// edges and their DOM text (#stat-wave, #wave-btn) changes on Send Wave, which would
// make any "canvas changed" check pass without Phaser drawing anything.
async function mapShot(page) {
  const pointerFine = await page.evaluate(q => matchMedia(q).matches, POINTER_FINE_QUERY);
  const box = await page.locator('#game canvas').boundingBox();
  const a = worldToPagePoint({ x: 0, y: 0 }, box, { pointerFine });
  const b = worldToPagePoint({ x: WORLD_WIDTH, y: WORLD_HEIGHT }, box, { pointerFine });
  return page.screenshot({ clip: { x: a.x, y: a.y, width: b.x - a.x, height: b.y - a.y } });
}

// The wave banner animates over the map; waiting for it keeps it out of map samples.
// Wait for every animation to finish, not for the list to empty: the banner uses
// `fill: forwards`, so a finished banner stays in getAnimations() holding opacity 0.
async function animationsSettled(page) {
  await until(
    () => page.evaluate(() => document.getAnimations().filter(an => an.playState !== 'finished')
      .map(an => `${an.animationName ?? an.constructor.name} on #${an.effect?.target?.id || '?'}`)),
    list => list.length === 0, list => `animation(s) still running: ${list.join(', ')}`);
}

async function expectText(page, sel, expected, timeout) {
  await until(() => text(page, sel), t => t === String(expected), t => `${sel} "${t}", expected "${expected}"`, timeout);
}

async function expectVisible(page, sel, want = true, timeout) {
  await until(() => visible(page, sel), v => v === want, () => `${sel} ${want ? 'not visible' : 'still visible'}`, timeout);
}

const UPGRADE_ITEM = '.radial-item[data-id="upgrade"]';

// The open radial as the player sees it: kind, every visible item's face and
// state, and the hub lines. Unused ring slots are hidden and left out.
const radialSnapshot = page => page.evaluate(() => {
  const root = document.querySelector('#radial');
  return {
    open: !!root && !root.hidden,
    kind: root?.dataset.kind ?? null,
    items: [...document.querySelectorAll('#radial .radial-item:not([hidden])')].map(el => ({
      id: el.dataset.id, state: el.dataset.state, ariaDisabled: el.getAttribute('aria-disabled') === 'true',
      classes: [...el.classList], icon: el.querySelector('.radial-icon')?.textContent ?? null,
      label: el.querySelector('.radial-label')?.textContent ?? null,
    })),
    hub: [...document.querySelectorAll('#radial-hub .radial-hub-line')].map(el => el.textContent),
  };
});

async function expectRadial(page, kind) {
  return until(() => radialSnapshot(page), r => r.open && r.kind === kind,
    r => (r.open ? `#radial data-kind=${r.kind}, expected ${kind}` : `#radial not open, expected ${kind}`));
}

function radialItem(snapshot, id) {
  const item = snapshot.items.find(i => i.id === id);
  if (!item) throw new Error(`no .radial-item[data-id=${id}] (have ${snapshot.items.map(i => i.id).join(', ')})`);
  return item;
}

// Each item's data-state and aria-disabled must both match: a ready-looking
// face that is aria-disabled (or the reverse) is a broken item.
function expectStates(snapshot, states) {
  for (const [id, want] of Object.entries(states)) {
    const item = radialItem(snapshot, id);
    if (item.state !== want || item.ariaDisabled !== (want !== 'ready')) {
      throw new Error(`${id} state=${item.state} aria-disabled=${item.ariaDisabled}, expected ${want}`);
    }
  }
}

// One function per spec step-table row (docs/superpowers/specs/2026-10-22-device-matrix-design.md;
// steps 7-17 per docs/superpowers/specs/2026-10-23-radial-menus-design.md).
// Each performs the row's action and asserts its condition; a throw fails the step.
const FLOW_ACTIONS = {
  async boot(ctx) {
    const { page, base, hasTouch } = ctx;
    await page.goto(base + '/');
    await expectVisible(page, '#story-dialog', true, 30_000);
    ctx.pointerFine = await page.evaluate(q => matchMedia(q).matches, POINTER_FINE_QUERY);
    if (ctx.pointerFine !== !hasTouch) throw new Error(`pointer fine=${ctx.pointerFine}, expected ${!hasTouch}`);
  },
  async 'skip-story'({ page, deviceName }) {
    await tap(page, deviceName, '#story-dialog-skip');
    await expectVisible(page, '#story-dialog', false);
    await expectVisible(page, '#map-select');
  },
  async 'select-map'({ page, deviceName }) {
    const node = '.ow-node[data-map-id="0"]';
    await tap(page, deviceName, node);
    await until(() => hasClass(page, node, 'active'), Boolean, () => `${node} not .active`);
    await expectText(page, '#featured-name', MAPS[0].name);
  },
  async play({ page, deviceName, exp }) {
    await tap(page, deviceName, '#featured-play');
    await expectVisible(page, '#hud-layer');
    await expectText(page, '#stat-gold', exp.startGold);
    await expectText(page, '#stat-wave', exp.waveBefore);
    await expectText(page, '#wave-btn', '▶ Send Wave 1');
  },
  async briefing({ page, deviceName, exp }, step, dir) {
    // The briefing is created in the same create() that shows #hud-layer, so its
    // state is already settled once step 04 passed: no wait-for-appearance race.
    const shown = await visible(page, '#story-dialog');
    if (shown !== exp.expectBriefing) throw new Error(`briefing ${shown ? 'shown' : 'missing'}, expected ${exp.expectBriefing ? 'shown' : 'none'}`);
    if (!shown) return { file: null };
    const file = await shoot(page, join(dir, shotName(step)));
    await tap(page, deviceName, '#story-dialog-skip');
    await expectVisible(page, '#story-dialog', false);
    return { file };
  },
  async 'level-ready'({ page, deviceName }) {
    const { problems } = await audit(page, deviceName, 'flow-in-game', IN_GAME_TARGETS, RAIL_ONLY_TARGETS);
    if (problems.length) throw new Error(problems.join('; '));
  },
  async 'arm-tower'({ page, deviceName, exp }) {
    const btn = `.tower-btn[data-type="${FLOW_TOWER}"]`;
    await tap(page, deviceName, btn);
    await until(() => hasClass(page, btn, 'selected'), Boolean, () => `${btn} not .selected`);
    await expectVisible(page, '#cancel-btn');
    await expectText(page, '#stat-gold', exp.startGold);
  },
  async 'cancel-arm'({ page, deviceName }) {
    await tap(page, deviceName, '#cancel-btn');
    await expectVisible(page, '#cancel-btn', false);
    const selected = await page.locator('.tower-btn.selected').count();
    if (selected) throw new Error(`${selected} .tower-btn still .selected`);
  },
  async 'open-build-radial'({ page, deviceName, exp }) {
    await tapGamePoint(page, deviceName, exp.pad.x, exp.pad.y);
    const r = await expectRadial(page, 'build');
    if (r.items.length !== Object.keys(exp.buildStatesStart).length) throw new Error(`${r.items.length} build items, expected ${Object.keys(exp.buildStatesStart).length}`);
    expectStates(r, exp.buildStatesStart);
    const { problems } = await radialAudit(page, deviceName, 'flow-build-radial');
    if (problems.length) throw new Error(problems.join('; '));
  },
  async 'radial-build'({ page, deviceName, exp }) {
    await tap(page, deviceName, `.radial-item[data-id="build:${FLOW_TOWER}"]`);
    await expectText(page, '#stat-gold', exp.goldAfterBuild);
    await expectVisible(page, '#radial', false);
  },
  async 'open-ring'({ page, deviceName, exp }) {
    await tapGamePoint(page, deviceName, exp.pad.x, exp.pad.y);
    const r = await expectRadial(page, 'tower');
    if (!r.hub.includes(exp.hubBefore)) throw new Error(`hub [${r.hub.join(' | ')}], expected it to contain "${exp.hubBefore}"`);
    const up = radialItem(r, 'upgrade');
    if (up.state !== 'ready' || up.ariaDisabled) throw new Error(`upgrade ${up.state}${up.ariaDisabled ? ' aria-disabled' : ''}, expected ready`);
    const sell = radialItem(r, 'sell');
    if (sell.label !== exp.sellLabelAfterBuild) throw new Error(`sell caption "${sell.label}", expected "${exp.sellLabelAfterBuild}"`);
  },
  async 'upgrade-arm'(ctx, step, dir) {
    const { page, deviceName, exp } = ctx;
    await tap(page, deviceName, UPGRADE_ITEM);
    // Clock starts at the first tap: step 13 must land its second tap inside the window.
    ctx.armedAt = Date.now();
    await until(() => hasClass(page, UPGRADE_ITEM, 'confirming'), Boolean, () => `${UPGRADE_ITEM} not .confirming`);
    await expectText(page, `${UPGRADE_ITEM} .radial-label`, 'Tap again');
    await expectText(page, '#stat-gold', exp.goldAfterBuild);
    // CSS-px shot: a DPR-3 full-resolution capture eats a large share of the confirm window.
    return { file: await shoot(page, join(dir, shotName(step)), { scale: 'css' }) };
  },
  async upgrade({ page, deviceName, exp, armedAt }) {
    const gapMs = armedAt === undefined ? null : Date.now() - armedAt;
    // Past the window the second tap would silently re-arm and read as "upgrade did nothing".
    if (gapMs !== null && gapMs > CONFIRM_WINDOW_MS - 500) {
      throw new Error(`harness exceeded confirm window (${gapMs} ms since first tap)`);
    }
    const gap = gapMs === null ? '' : `confirm gap ${gapMs} ms`;
    try {
      await tap(page, deviceName, UPGRADE_ITEM);
      await expectText(page, '#stat-gold', exp.goldAfterUpgrade);
      const r = await until(() => radialSnapshot(page), s => s.hub.includes(exp.hubAfter),
        s => `hub [${s.hub.join(' | ')}], expected it to contain "${exp.hubAfter}"`);
      const up = radialItem(r, 'upgrade');
      if (up.classes.includes('confirming')) throw new Error(`${UPGRADE_ITEM} still .confirming`);
      const locked = up.state === 'locked';
      if (locked !== exp.lockedAfterUpgrade) throw new Error(`upgrade state ${up.state}, expected ${exp.lockedAfterUpgrade ? 'locked' : 'not locked'}`);
      if (locked && (up.icon !== '🔒' || up.label !== exp.lockedLabel || !up.ariaDisabled)) {
        throw new Error(`locked upgrade face "${up.icon} ${up.label}" aria-disabled=${up.ariaDisabled}, expected "🔒 ${exp.lockedLabel}" aria-disabled`);
      }
    } catch (err) {
      // The gap tells a timing-related re-arm apart from a real upgrade failure.
      throw new Error(gap ? `${err.message.split('\n')[0]} (${gap})` : err.message);
    }
    return { detail: gap };
  },
  async 'radial-unaffordable'({ page, deviceName, exp }) {
    // An open ring eats this tap and retargets to the free pad's build radial.
    await tapGamePoint(page, deviceName, exp.pad2.x, exp.pad2.y);
    const r = await expectRadial(page, 'build');
    const ready = r.items.filter(i => !i.ariaDisabled).map(i => i.id);
    if (ready.length) throw new Error(`not aria-disabled at ${exp.goldAfterUpgrade}g: ${ready.join(', ')}`);
    await expectText(page, '#stat-gold', exp.goldAfterUpgrade);
  },
  async 'close-radial'({ page, deviceName }) {
    await tap(page, deviceName, '#radial-hub');
    await expectVisible(page, '#radial', false);
  },
  async 'send-wave'({ page, deviceName, exp }) {
    await tap(page, deviceName, '#wave-btn');
    await expectText(page, '#stat-wave', exp.waveAfter);
    // Mirror of step 13 under the same conditions: proves the map sample can differ,
    // so step 13's byte-identical check is meaningful.
    await animationsSettled(page);
    const a = await mapShot(page);
    await until(() => mapShot(page), b => !b.equals(a), () => 'map unchanged 5 s after Send Wave', 5_000);
  },
  async pause({ page, deviceName }) {
    await tap(page, deviceName, '#pause-btn');
    await until(() => hasClass(page, '#paused-overlay', 'shown'), Boolean, () => '#paused-overlay not .shown');
    await expectVisible(page, '#paused-overlay');
    await expectText(page, '#pause-btn', '▶ Resume');
    await animationsSettled(page);
    const a = await mapShot(page);
    await page.waitForTimeout(500);
    const b = await mapShot(page);
    if (!a.equals(b)) throw new Error('map changed while paused');
  },
};

// Plays one device through the step table in a fresh context (empty localStorage,
// so a true first run). Stops at the first failure and records the rest as skip,
// so the evidence ends where the game diverged.
async function captureFlow(browser, base, deviceName, exp) {
  const dir = join(OUT_DIR, deviceName, 'flow');
  // A leftover NN-id-FAILED.png from an earlier run would contradict this run's result.
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const device = DEVICES[deviceName];
  const context = await browser.newContext(contextOptions(device));
  const steps = [];
  let problems = [];
  const ctx = { base, deviceName, exp, hasTouch: !!device.hasTouch, pointerFine: null };
  try {
    ctx.page = await context.newPage();
    problems = watchProblems(ctx.page);
    let failed = false;
    for (const step of stepsFor({ hasTouch: ctx.hasTouch })) {
      const record = { n: step.n, id: step.id, status: 'skip', detail: '', file: null, ms: 0 };
      steps.push(record);
      if (failed) continue;
      const t0 = Date.now();
      try {
        // An action may return { file } when it shoots its own frame (or none), and { detail }.
        const result = (await FLOW_ACTIONS[step.id](ctx, step, dir)) ?? {};
        record.file = 'file' in result ? result.file : await shoot(ctx.page, join(dir, shotName(step)));
        record.detail = result.detail ?? '';
        record.status = 'pass';
      } catch (err) {
        failed = true;
        record.status = 'fail';
        record.detail = err.message.split('\n')[0];
        record.file = await shoot(ctx.page, join(dir, shotName(step).replace('.png', '-FAILED.png'))).catch(() => null);
      }
      record.ms = Date.now() - t0;
    }
  } finally {
    await context.close();
  }
  // Same rule as summarizeFlow: an empty step list proves nothing.
  const pass = steps.length > 0 && steps.every(s => s.status === 'pass') && problems.length === 0;
  return { device: deviceName, mode: 'flow', pointerFine: ctx.pointerFine, pass, steps, problems };
}

async function captureOne(browser, base, deviceName, mapId, opts) {
  const { wave, path } = captureUrl(mapId, opts);
  const dir = join(OUT_DIR, deviceName);
  mkdirSync(dir, { recursive: true });
  const stem = join(dir, `map${mapId}-w${wave}`);
  const videoDir = join(dir, '.video-tmp');
  const device = DEVICES[deviceName];

  const context = await browser.newContext({
    ...contextOptions(device),
    ...(opts.video ? { recordVideo: { dir: videoDir, size: device.viewport } } : {}),
  });
  const page = await context.newPage();
  const problems = watchProblems(page);
  await page.goto(base + path);
  const capture = await shootBusiestFrame(page, Math.max(opts.seconds, opts.video) * 1000, `${stem}.png`);
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
  // Throws before any build or browser if map 0 can no longer afford the flow.
  const exp = opts.flow ? flowExpectations({ map: MAPS[0], towerType: FLOW_TOWER }) : null;
  if (opts.rebuild || !existsSync(DIST_DIR)) {
    await build({ mode: 'capture', logLevel: 'warn', build: { outDir: DIST_DIR, emptyOutDir: true } });
  }
  const server = await preview({ logLevel: 'warn', build: { outDir: DIST_DIR }, preview: { port: PORT, strictPort: true } });
  const base = `http://localhost:${PORT}`;
  const browser = await chromium.launch();
  const results = [];
  try {
    for (const deviceName of opts.devices) {
      if (opts.flow) {
        results.push(await captureFlow(browser, base, deviceName, exp));
        continue;
      }
      if (opts.screens) {
        const r = await captureScreens(browser, base, deviceName, opts);
        results.push(r);
        r.screens.forEach(f => console.log(f));
        if (r.problems.length) console.log(`  (${r.problems.length} console problems)`);
        continue;
      }
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
  const bad = results.filter(r => r.problems.length || r.ignoredBuild?.length);
  if (bad.length) console.log(`\n${bad.length} capture(s) logged problems — see ${OUT_DIR}/report.json`);
  const layoutLines = results.flatMap(r => (r.layout ?? []).flatMap(l => l.problems.map(p => `LAYOUT ${l.device} ${l.label}: ${p}`)));
  if (layoutLines.length) {
    console.log(`\n${layoutLines.join('\n')}`);
    process.exitCode = 1;
  }
  if (opts.flow) {
    const { lines, failedDevices } = summarizeFlow(results);
    console.log(`\n${lines.join('\n')}`);
    if (failedDevices > 0) process.exitCode = 1;
  }
}

main().catch(err => { console.error(err); process.exit(1); });
