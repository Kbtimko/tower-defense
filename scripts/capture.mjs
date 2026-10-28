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
// --screens shoots the non-gameplay screens instead (title, first-run story, world
// map, in-game, tower ring, build radial, defeat and victory results, post-win arrival) into
// <device>/screens/, using the first of --maps for the level shots. The victory and
// arrival always use map 0: only a fresh save's frontier mission flies the ship.
// It also runs the world map with fonts blocked and with one node's art blocked on
// every device, and with reduced motion on desktop1440 and iphone. Debug levels never
// send a wave on their own unless ?autosend=1; the auto-send run proves that one does.
// Output: .art-cache/captures/<device>/map<N>-w<W>.png (+ .mp4 with --video)
// and .art-cache/captures/report.json listing console errors per capture.
// --wave defaults to the middle wave of each map; --build defaults to one of
// every tower at mixed tiers (defaultCaptureBuild).
//
// --flow plays the opening of a fresh first run with real input on each device
// (boot -> title -> map 0 -> radial build archer -> ring upgrade -> send wave -> pause), asserting
// the game state after every step and shooting <device>/flow/NN-id.png. It
// always uses map 0 and ignores --maps/--wave/--build/--hero/--video; without
// --devices it runs desktop,iphone,pixel,ipad. Exits 1 if any device fails.
import { mkdirSync, writeFileSync, renameSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { build, preview } from 'vite';
import { chromium, devices } from 'playwright';
import { DEVICES } from './captureDevices.mjs';
import { MAPS } from '../src/data/maps.js';
import { MAP_WAVES } from '../src/data/waves.js';
import { TOWER_DEFS } from '../src/data/towers.js';
import { defaultCaptureBuild } from '../src/systems/debugCapture.js';
import { countdownMsFor, lastSpawnMs } from '../src/systems/waveCountdown.js';
import { WAVE_COUNTDOWN } from '../src/data/waveCountdown.js';
import { layoutProblems, railProblems, railGeometryProblems, overlayProblems, minTouchFor, radialProblems, targetSizeProblems } from '../src/systems/layoutAudit.js';
import { storyDialogProblems, longestPanel } from '../src/systems/storyDialogLayout.js';
import { STORY_SEQUENCES, STORY_SPEAKERS, STORY_LOG_LABELS, epilogueKey, briefKey } from '../src/data/story.js';
import { STORY_DIALOG } from '../src/data/storyDialog.js';
import { layoutClass, routeFrameFor, worldMapProblems } from '../src/systems/worldMapLayout.js';
import { POINTER_FINE_QUERY, COMPACT_QUERY } from '../src/data/mobile.js';
import { CONFIRM_WINDOW_MS } from '../src/data/input.js';
import { WORLD_WIDTH, WORLD_HEIGHT, MIN_TOUCH_PX } from '../src/data/layout.js';
import { TITLE } from '../src/data/title.js';
import { ARRIVAL } from '../src/data/worldMap.js';
import { RESULTS, RESULTS_COPY, STAR_RULE } from '../src/data/results.js';
import { CARD_COPY } from '../src/data/campaign.js';
import { resultsProblems } from '../src/systems/resultsLayout.js';
import { longestResultLine } from '../src/systems/resultsModel.js';
import { resultsTimeline } from '../src/systems/resultsTimeline.js';
import { mergeRecord } from '../src/systems/runRecord.js';
import { formatDuration } from '../src/utils/display.js';
import { stepsFor, shotName, worldToPagePoint, flowExpectations, summarizeFlow, freePad, padWorldPoint, buildStates } from '../src/systems/deviceFlow.js';

const OUT_DIR   = '.art-cache/captures';
const DIST_DIR  = '.art-cache/capture-dist';
const PORT      = 4188;
const MIN_ENEMIES = 3;
// The roadmap's three touch devices plus a fine-pointer desktop (104-px rails).
const FLOW_DEVICES = ['desktop', 'iphone', 'pixel', 'ipad'];
const FLOW_TOWER = 'archer';
const STEP_TIMEOUT = 10_000;

// Controls a phone player must be able to reach on each screen.
const MAP_SELECT_TARGETS = ['#featured-play', '#map-meta-bar button', '.ow-node:not(.locked)'];
const TITLE_TARGETS = ['#title-screen'];
// Phaser's canvas is #game's direct child; #map-select inside #game has canvases of its own.
const GAME_CANVAS = '#game > canvas';
// Set by MapSelectScene once its entry input guard ends; a tap before it is swallowed.
const MAP_READY = '#map-overworld[data-ready="1"]';
// The post-win shot lands mid-flight (spec 7.3: about 1.5 s). The ship sets off from
// its park point behind node 1 and is hidden under that node until about 1.6 s.
const ARRIVAL_MID_MS = ARRIVAL.flyStartMs + ARRIVAL.flyMs / 2;
// Longer than any tap, so a held skip's late pointerup / click is what gets tested.
const HOLD_MS = 1200;
const REDUCED_MOTION_DEVICES = new Set(['desktop1440', 'iphone']);
// Node 4's art: blocked in one run to exercise the numbered-circle fallback.
const BLOCKED_ART = 'overworld_3_orbital_station.png';
// The Veth portrait is blocked in the same run, for the story dialog's initial-letter fallback.
const BLOCKED_PORTRAIT = 'portrait-veth.png';
const escapeRe = s => s.replace(/\./g, '\\.');
const BLOCKED_ART_URL = new RegExp(`/(${escapeRe(BLOCKED_ART)}|${escapeRe(BLOCKED_PORTRAIT)})$`);
const WEBFONT_URL = /\.woff2?(\?.*)?$/;
const BLOCKED_ART_MAP = MAPS.findIndex(m => m.overworldArt === BLOCKED_ART);
// Node 4 is the frontier on this save, so its fallback carries next + active.
const BLOCKED_ART_SAVE = {
  version: 4, maps: MAPS.map((_, i) => Math.max(0, BLOCKED_ART_MAP - i)),
  seenStoryBeats: { campaign_intro: true, epilogue_asteroid_belt: true },
};
// A skip must end the arrival at once; the natural end (ARRIVAL.totalMs) and the
// cardAtMs re-select would otherwise satisfy the end-state checks on their own.
const SKIP_DONE_MS = 300;
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
// Story dialog (roadmap 3.5): the controls a player must reach (#41c), the caption a tap
// lands on (Primary: finish the line, then advance), and the panels the gallery shoots.
const STORY_TARGETS = ['#story-dialog-skip', '#story-dialog-next'];
const STORY_CAPTION = '#story-dialog .sd-caption';
// The overlay sets data-phase in its click handler, so a working tap shows within this.
const FINISH_BOUND_MS = 250;
const LONGEST = longestPanel(STORY_SEQUENCES);
const VETH_SEQUENCE = 'epilogue_asteroid_belt';
const VETH_INDEX = STORY_SEQUENCES[VETH_SEQUENCE].panels.findIndex(p => p.speaker === 'veth');
// Every Story Log beat seen, so the log lists them all; no stars, so no arrival plays.
const GALLERY_SAVE = {
  version: 4, maps: MAPS.map(() => 0),
  seenStoryBeats: Object.fromEntries(Object.keys(STORY_LOG_LABELS).map(id => [id, true])),
};
// Review Focus 1: a 1280x720 laptop at 200 % browser zoom (compact, fine pointer).
const ZOOMED_LAPTOP = { viewport: { width: 640, height: 360 }, deviceScaleFactor: 2 };

// Results screen (roadmap 3.6, spec 12.2).
const RESULTS_BUTTONS = ['#results-next', '#results-retry', '#results-map'];
// Spec 7.5: a tall screen with a fine pointer holds buttons to 40 px, not the 44-px touch floor.
const FINE_TALL_MIN_PX = 40;
const VICTORY_END_MS = resultsTimeline('victory').endMs;
// Mid-reveal shots: the defeat's chips mid-pop, the victory's stars stamping.
const DEFEAT_REVEAL_MS = 900;
const VICTORY_REVEAL_MS = 1100;
const FINAL_MAP = MAPS.length - 1;
// Review Focus 4: the longest kicker is MISSION n · <the longest map name>.
const LONGEST_NAME_MAP = MAPS.reduce((best, m, i) => (m.name.length > MAPS[best].name.length ? i : best), 0);
const MAP0_EPILOGUE = epilogueKey(MAPS[0].storyKey);
const ALL_BEATS_SEEN = Object.fromEntries(Object.keys(STORY_SEQUENCES).map(id => [id, true]));
const noStars = () => MAPS.map(() => 0);
// A first clear of map 0 that opens the results at once (no epilogue on the way in).
const FIRST_CLEAR_SAVE = { version: 4, maps: noStars(), seenStoryBeats: { [MAP0_EPILOGUE]: true } };
// The same, with the prologue seen too, so nothing covers the map on the way out.
const FIRST_CLEAR_QUIET_SAVE = { ...FIRST_CLEAR_SAVE, seenStoryBeats: { campaign_intro: true, [MAP0_EPILOGUE]: true } };
const RETRY_SAVE = { version: 4, maps: noStars(), seenStoryBeats: { [briefKey(MAPS[0].storyKey)]: true } };
// The worst-case run on every map beats this record, so both NEW BEST tags show.
const WORST_CASE_SAVE = {
  version: 5, maps: noStars(), seenStoryBeats: ALL_BEATS_SEEN,
  records: MAPS.map(() => ({ livesLost: 99, timeMs: 99_999_999 })),
};
const WORST_CASE_RUN = { kills: 9_999, goldEarned: 99_999, timeMs: ((9 * 60 + 59) * 60 + 59) * 1000, line: longestResultLine() };
const WORST_CASES = [
  { label: 'final-1star', mapId: FINAL_MAP, result: 'victory', stars: 1 },
  { label: 'longest-name-2star', mapId: LONGEST_NAME_MAP, result: 'victory', stars: 2 },
  { label: 'longest-name-defeat', mapId: LONGEST_NAME_MAP, result: 'defeat', stars: 0 },
];
// A replay of a 3-star map 0 that gains nothing (no arrival). Map 1 carries the
// worst-case best line its briefing card must fit on one line (Task 7 ruling).
const REPLAY_SAVE = {
  version: 5, maps: [3, 1, ...MAPS.slice(2).map(() => 0)],
  seenStoryBeats: { campaign_intro: true, [MAP0_EPILOGUE]: true, [epilogueKey(MAPS[1].storyKey)]: true },
  records: [{ livesLost: 3, timeMs: 400_000 }, { livesLost: 10, timeMs: 754_000 }, ...MAPS.slice(2).map(() => null)],
};
const REPLAY_RUN = { lives: MAPS[0].startLives, timeMs: 500_000 };

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

// `blockedUrl`: a run that aborts those requests on purpose expects their load
// errors, and only theirs.
function watchProblems(page, { blockedUrl = null } = {}) {
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
  const box = await page.locator(GAME_CANVAS).boundingBox();
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

// tap() at a page point, with no actionability wait (a node mid-arrival is still scaling).
async function tapPoint(page, deviceName, { x, y }) {
  if (DEVICES[deviceName].hasTouch) await page.touchscreen.tap(x, y);
  else await page.mouse.click(x, y);
}

async function tapCentre(page, deviceName) {
  const { width, height } = page.viewportSize();
  await tapPoint(page, deviceName, { x: width / 2, y: height / 2 });
}

// A real press; resolves to its release. Playwright's touchscreen only taps, so
// touch goes through CDP, which is what touchscreen.tap itself sends.
async function pressPoint(page, deviceName, { x, y }) {
  if (!DEVICES[deviceName].hasTouch) {
    await page.mouse.move(x, y);
    await page.mouse.down();
    return () => page.mouse.up();
  }
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  return async () => {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await cdp.detach();
  };
}

// Centre of a node's round face (art, or the fallback circle): the finger's target.
async function nodeFace(page, mapId) {
  return page.evaluate(id => {
    const btn = document.querySelector(`.ow-node[data-map-id="${id}"]`);
    const face = btn.classList.contains('ow-node-fallback') ? btn.querySelector('.ow-node-num') : btn.querySelector('.ow-node-art');
    const r = face.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, mapId);
}

// Collects layout metrics inside the page and returns { device, label, problems }.
// getBoundingClientRect ignores ancestor clipping, so each target also gets
// visibleRect: its rect intersected with every overflow-clipping ancestor.
async function audit(page, deviceName, label, selectors, railOnly = []) {
  const metrics = await page.evaluate(({ sels, pointerFineQuery, gameCanvas }) => {
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
      canvas: rect(gameCanvas),
      pointerFine: matchMedia(pointerFineQuery).matches,
    };
  }, { sels: [...selectors, ...railOnly], pointerFineQuery: POINTER_FINE_QUERY, gameCanvas: GAME_CANVAS });
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
  if (OVERLAY_AUDITS.has(selectors) || selectors === MAP_SELECT_TARGETS) {
    problems.push(...overlayProblems({ device: { hasTouch: !!DEVICES[deviceName].hasTouch }, targets: metrics.targets }));
  }
  if (selectors === MAP_SELECT_TARGETS) problems.push(...await worldMapAudit(page, metrics.pointerFine));
  // Spec 7: Skip and Next are >= 44x44 on touch, and in compact for any pointer (a
  // zoomed laptop is compact with a mouse).
  if (selectors === STORY_TARGETS) {
    const compact = await page.evaluate(q => matchMedia(q).matches, COMPACT_QUERY);
    if (DEVICES[deviceName]?.hasTouch || compact) problems.push(...targetSizeProblems(metrics.targets, MIN_TOUCH_PX));
  }
  return { device: deviceName, label, problems };
}

// The open story dialog's painted rects, judged by storyDialogProblems. The portrait
// is the skewed frame's transformed box; the scroll metrics are the fixed-height panel
// row's, where a caption that outgrows its room shows up.
async function storyDialogAudit(page, deviceName, label) {
  const m = await page.evaluate(() => {
    const rect = sel => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
    };
    // Spec 7: the gap must hold the skew bleed AND the hard shadow, so the frame's
    // transformed box grows by its outline on every side and its drop down-right.
    const paintedPortrait = () => {
      const r = rect('#story-dialog-portrait');
      if (!r) return null;
      const cs = getComputedStyle(document.querySelector('#story-dialog-portrait'));
      const outline = parseFloat(cs.outlineWidth) || 0;
      const [dx = 0, dy = 0] = (cs.boxShadow.match(/-?[\d.]+px/g) ?? []).map(parseFloat);
      const left = r.left - outline;
      const top = r.top - outline;
      const right = r.right + outline + Math.max(0, dx);
      const bottom = r.bottom + outline + Math.max(0, dy);
      return { left, top, right, bottom, width: right - left, height: bottom - top };
    };
    const row = document.querySelector('#story-dialog .sd-panel-row');
    const font = sel => parseFloat(getComputedStyle(document.querySelector(sel)).fontSize);
    return {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      portrait: paintedPortrait(),
      tab: rect('#story-dialog-name'),
      caption: rect('#story-dialog .sd-caption'),
      actions: rect('#story-dialog .sd-actions'),
      captionScroll: { scrollHeight: row.scrollHeight, clientHeight: row.clientHeight },
      fontPx: Math.min(font('#story-dialog-text'), font('#story-dialog-name')),
    };
  });
  return { device: deviceName, label, problems: storyDialogProblems(m).map(p => `story dialog: ${p}`) };
}

// The fit rule (spec 5) on what actually painted: each node rect is its button's
// box (face + label + stars), the face is the touch target, and the frame is
// routeFrameFor over #map-select's content box, as MapSelectScene measures it.
async function worldMapAudit(page, pointerFine) {
  const m = await page.evaluate(() => {
    const root = document.querySelector('#map-select');
    const r = root.getBoundingClientRect();
    const cs = getComputedStyle(root);
    const pad = side => parseFloat(cs[`padding${side}`]) || 0;
    const nodes = [...document.querySelectorAll('.ow-node')].map(btn => {
      const b = btn.getBoundingClientRect();
      const face = btn.classList.contains('ow-node-fallback') ? btn.querySelector('.ow-node-num') : btn.querySelector('.ow-node-art');
      const f = face.getBoundingClientRect();
      return {
        id: Number(btn.dataset.mapId), cx: b.left + b.width / 2, cy: b.top + b.height / 2, w: b.width, h: b.height,
        d: Math.min(f.width, f.height), locked: btn.classList.contains('locked'),
      };
    });
    return {
      origin: { x: r.left + pad('Left'), y: r.top + pad('Top') },
      content: { width: r.width - pad('Left') - pad('Right'), height: r.height - pad('Top') - pad('Bottom') },
      viewport: { width: window.innerWidth, height: window.innerHeight },
      nodes,
    };
  });
  if (m.nodes.length !== MAPS.length) return [`world map: ${m.nodes.length} .ow-node, expected ${MAPS.length}`];
  const f = routeFrameFor(m.content, layoutClass(m.content));
  const frame = { ...f, x: f.x + m.origin.x, y: f.y + m.origin.y };
  return worldMapProblems({ nodes: m.nodes, frame, viewport: m.viewport, coarse: !pointerFine, minTouchPx: MIN_TOUCH_PX })
    .map(p => `world map: ${p}`);
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
  const box = await page.locator(GAME_CANVAS).boundingBox();
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
  // The touch floor binds the coarse pointer class only (as in railProblems), read
  // from the page like the map rect so the two cannot disagree.
  const minTouchPx = pointerFine ? 0 : minTouchFor({ vw: viewport.width, vh: viewport.height });
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
  // A leftover <run>-FAILED.png from an earlier run would contradict this run's result.
  rmSync(dir, { recursive: true, force: true });
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
    await page.locator('#title-screen').waitFor({ state: 'visible', timeout: 30_000 });
    await titlePhase(page, 'sweep');
    // Mid-sweep: the beam starts sweepDelayMs into the phase, so this is it halfway across.
    await page.waitForTimeout(TITLE.sweepDelayMs + TITLE.sweepMs / 2);
    files.push(await shoot(page, join(dir, '00-title.png')));
    await titlePhase(page, 'lit');
    files.push(await shoot(page, join(dir, '00b-title-lit.png')));
    layout.push(await audit(page, deviceName, 'title', TITLE_TARGETS));
    await tapCentre(page, deviceName);
    await page.locator('#story-dialog-skip').waitFor({ state: 'visible', timeout: 10_000 });
    // Mid-type: the slam has landed and the line is part-way out.
    await page.waitForTimeout(STORY_DIALOG.slamMs + 500);
    files.push(await shoot(page, join(dir, '01a-story-typing.png')));
    const typing = await dialogAttr(page, 'phase');
    if (typing !== 'typing') layout.push({ device: deviceName, label: 'story-typing', problems: [`01a shot at data-phase="${typing}", expected "typing"`] });
    // The screen-reader line: the whole first panel, once, named (spec 9).
    const first = STORY_SEQUENCES.campaign_intro.panels[0];
    await expectText(page, '#story-dialog-live', `${STORY_SPEAKERS[first.speaker].name}: ${first.text}`, 1_000);
    await expectAttr(page, '#story-dialog', 'phase', 'complete');
    await storySettled(page);
    files.push(await shoot(page, join(dir, '01-first-run-story.png')));
    layout.push(await audit(page, deviceName, 'story', STORY_TARGETS));
    layout.push(await storyDialogAudit(page, deviceName, 'story-layout'));
    await page.locator(MAP_READY).waitFor({ timeout: 5_000 });
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
    await watchResults(page);
    await page.evaluate(() => window.__capture.end('defeat'));
    const reveal = await revealShot(page, DEFEAT_REVEAL_MS, join(dir, '05a-defeat-reveal.png'));
    files.push(reveal.file);
    if (reveal.phase !== 'revealing') layout.push({ device: deviceName, label: 'defeat-reveal', problems: [`05a shot at data-phase="${reveal.phase}", expected "revealing"`] });
    await expectAttr(page, '#results', 'phase', 'ready');
    await resultsSettled(page);
    files.push(await shoot(page, join(dir, '05-defeat.png')));
    layout.push(await resultsAudit(page, deviceName, 'defeat'));
    problems.push(...p2);
  } finally {
    await context.close();
  }
  const runs = [
    () => capturePostWin(browser, base, deviceName, dir, opts),
    () => captureHeldSkip(browser, base, deviceName, opts),
    () => captureResultsGuard(browser, base, deviceName),
    () => captureRetry(browser, base, deviceName),
    () => captureNextMissionReplay(browser, base, deviceName, dir),
    () => captureResultsAudits(browser, base, deviceName, dir),
    () => captureNoFonts(browser, base, deviceName, dir),
    () => captureMissingArt(browser, base, deviceName, dir),
    () => captureStoryGallery(browser, base, deviceName, dir),
    () => captureDoubleTapClose(browser, base, deviceName),
    () => captureAutoSend(browser, base, deviceName, dir),
  ];
  if (deviceName === 'desktop') runs.push(() => captureZoomedStory(browser, base, deviceName, dir));
  if (!DEVICES[deviceName].hasTouch) runs.push(() => captureHeldEnter(browser, base, deviceName));
  if (REDUCED_MOTION_DEVICES.has(deviceName)) runs.push(() => captureReducedMotion(browser, base, deviceName, dir));
  // One at a time: each run times a live animation, so they must not share the CPU.
  for (const run of runs) {
    const r = await run();
    files.push(...r.files);
    layout.push(...r.layout);
    problems.push(...r.problems);
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
    // el.click(), not a pointer click: the rotate prompt covers the page upright.
    await page.locator('#title-screen').waitFor({ state: 'visible', timeout: 30_000 });
    await page.evaluate(() => document.querySelector('#title-screen')?.click());
    await page.locator('#story-dialog-skip').waitFor({ state: 'visible', timeout: 10_000 });
    await page.waitForTimeout(1500);
    // The map's entry guard swallows clicks until it ends, synthetic ones included.
    await page.locator(MAP_READY).waitFor({ timeout: 5_000 });
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

// One fresh context for one extra --screens run. A thrown step becomes a layout
// problem under `label` (so it fails the run) instead of ending every device.
// `blockedUrl` runs abort those requests (and expect only their load errors).
async function screensRun(browser, deviceName, label, { contextOptions: extra = {}, blockedUrl = null }, body) {
  const context = await browser.newContext({ ...contextOptions(DEVICES[deviceName]), ...extra });
  const out = { files: [], layout: [], problems: [] };
  try {
    if (blockedUrl) await context.route(blockedUrl, r => r.abort());
    const page = await context.newPage();
    const seen = watchProblems(page, { blockedUrl });
    try {
      await body(page, out);
    } catch (err) {
      out.layout.push({ device: deviceName, label, problems: [err.message.split('\n')[0]] });
      await shoot(page, join(OUT_DIR, deviceName, 'screens', `${label}-FAILED.png`)).catch(() => null);
    }
    out.problems.push(...seen);
  } finally {
    await context.close();
  }
  return out;
}

async function titlePhase(page, phase, timeout = 10_000) {
  await page.waitForFunction(p => document.querySelector('#title-screen')?.dataset.phase === p, phase, { timeout, polling: 'raf' });
}

const attr = (page, sel, name) => page.locator(sel).first().getAttribute(`data-${name}`, { timeout: 1_000 });

async function expectAttr(page, sel, name, want, timeout) {
  await until(() => attr(page, sel, name), v => v === want, v => `${sel} data-${name}="${v}", expected "${want}"`, timeout);
}

const dialogAttr = (page, name) => attr(page, '#story-dialog', name);

// One-shot: a later navigation in the same tab keeps whatever the game saved since.
const seedSave = (page, save) => page.addInitScript(s => {
  if (sessionStorage.getItem('capture-seeded')) return;
  sessionStorage.setItem('capture-seeded', '1');
  localStorage.setItem('lastlight_save', JSON.stringify(s));
}, save);

// A capture-build level on a seeded save. The init script only fires on the URL
// carrying its own token, so the game's later writes (and seedSave's one-shot) stand.
// `extraParams` set (or override) query params, e.g. { autosend: '1' }.
let seedCount = 0;
async function gotoLevel(page, base, mapId, save, wave = 1, extraParams = {}) {
  const token = `s${++seedCount}`;
  await page.addInitScript(([t, s]) => {
    if (new URLSearchParams(location.search).get('capture-seed') === t) localStorage.setItem('lastlight_save', JSON.stringify(s));
  }, [token, save]);
  const url = new URL(base + captureUrl(mapId, { wave }).path);
  for (const [k, v] of Object.entries(extraParams)) url.searchParams.set(k, v);
  url.searchParams.set('capture-seed', token);
  await page.goto(url.href);
  await page.waitForFunction(() => window.__capture, null, { timeout: 30_000 });
}

const untypedChars = page => page.evaluate(() => Array.from(document.querySelector('#story-dialog .sd-rest').textContent).length);

// Tap-to-finish proven: with well over FINISH_BOUND_MS of the line still to type,
// one real tap on the caption completes it at once and the panel stays put. A tap
// that did nothing can't pass by the line finishing on its own inside the bound.
// tapPoint, not tap(): no actionability wait (the slam/pop) between the read and the tap.
async function finishLine(page, deviceName) {
  const [phase, index] = [await dialogAttr(page, 'phase'), await dialogAttr(page, 'index')];
  const box = await page.locator(STORY_CAPTION).boundingBox();
  const rest = await untypedChars(page);
  if (phase !== 'typing' || rest * STORY_DIALOG.msPerChar < 3 * FINISH_BOUND_MS) {
    throw new Error(`story panel ${index} data-phase="${phase}" with ${rest} chars left before the finishing tap; the harness was too slow to test tap-to-finish`);
  }
  await tapPoint(page, deviceName, { x: box.x + box.width / 2, y: box.y + box.height / 2 });
  await expectAttr(page, '#story-dialog', 'phase', 'complete', FINISH_BOUND_MS);
  await expectAttr(page, '#story-dialog', 'index', index, 0);
  const left = await untypedChars(page);
  if (left !== 0) throw new Error(`story panel ${index} still has ${left} untyped chars after the finishing tap`);
}

// For shots, where only the end state matters: a line too short to prove a tap on
// (the Veth's 25 chars) is left to finish on its own.
async function completeLine(page, deviceName) {
  if (await dialogAttr(page, 'phase') !== 'typing') return;
  if (await untypedChars(page) * STORY_DIALOG.msPerChar >= 3 * FINISH_BOUND_MS) await finishLine(page, deviceName);
  else await expectAttr(page, '#story-dialog', 'phase', 'complete');
}

// Past the advance guard (measured from the line's completion), the next tap advances.
async function nextPanel(page, deviceName) {
  const from = Number(await dialogAttr(page, 'index'));
  await page.waitForTimeout(STORY_DIALOG.advanceGuardMs + 100);
  await tap(page, deviceName, STORY_CAPTION);
  await expectAttr(page, '#story-dialog', 'index', String(from + 1));
}

// Waits out the one-shot slam/pop/punch (the glitch and the ▸ blink loop forever)
// and the portrait's decode: with motion off nothing else gives the art time to land.
async function storySettled(page) {
  await until(() => page.evaluate(() => document.querySelector('#story-dialog').getAnimations({ subtree: true })
    .filter(a => a.effect.getComputedTiming().iterations !== Infinity && a.playState !== 'finished').length),
  n => n === 0, n => `${n} story dialog animation(s) still running`);
  await until(() => page.evaluate(() => {
    const img = document.querySelector('#story-dialog-portrait img');
    return img ? img.complete && img.naturalWidth > 0 : !!document.querySelector('#story-dialog-portrait .sd-initial');
  }), Boolean, () => 'story portrait never painted (no loaded img, no fallback initial)');
}

async function expectSpeaker(page, sequenceId, index) {
  const { speaker } = STORY_SEQUENCES[sequenceId].panels[index];
  await expectAttr(page, '#story-dialog', 'speaker', speaker, 1_000);
  await expectAttr(page, '#story-dialog', 'side', STORY_SPEAKERS[speaker].side, 0);
}

// Story Log -> one entry, by its label, with real taps; the dialog opens on panel 0.
async function openStoryLogEntry(page, deviceName, sequenceId) {
  const label = STORY_LOG_LABELS[sequenceId];
  if (!label) throw new Error(`${sequenceId} has no Story Log entry to replay`);
  await tap(page, deviceName, '#open-story-log');
  await page.locator('#story-log-overlay').waitFor({ state: 'visible', timeout: 5_000 });
  const entry = page.locator('#story-log-list').getByRole('button', { name: label, exact: true });
  if (DEVICES[deviceName]?.hasTouch) await entry.tap();
  else await entry.click();
  await expectVisible(page, '#story-dialog');
  await expectAttr(page, '#story-dialog', 'index', '0');
  await expectSpeaker(page, sequenceId, 0);
}

// Real taps up to `index`, then that panel completed and settled for its shot.
async function playToPanel(page, deviceName, sequenceId, index) {
  for (let i = 0; i < index; i++) {
    await completeLine(page, deviceName);
    await nextPanel(page, deviceName);
    await expectSpeaker(page, sequenceId, i + 1);
  }
  await completeLine(page, deviceName);
  await storySettled(page);
}

// A tap inside the advance guard after a tap closed the dialog is swallowed as a
// double tap's second (final review I5), so the next deliberate tap waits it out.
const pastCloseGuard = page => page.waitForTimeout(STORY_DIALOG.advanceGuardMs);

async function skipStory(page, deviceName) {
  await tap(page, deviceName, '#story-dialog-skip');
  await expectVisible(page, '#story-dialog', false);
  await pastCloseGuard(page);
}

// The derived longest line, shot and judged, then skipped.
async function longestLine(page, deviceName, label, file) {
  const out = { files: [], layout: [] };
  await openStoryLogEntry(page, deviceName, LONGEST.sequenceId);
  await playToPanel(page, deviceName, LONGEST.sequenceId, LONGEST.index);
  out.files.push(await shoot(page, file));
  out.layout.push(await storyDialogAudit(page, deviceName, label));
  out.layout.push(await audit(page, deviceName, `${label}-controls`, STORY_TARGETS));
  await skipStory(page, deviceName);
  return out;
}

// Map 0 to its results screen in the capture build, skipping any story dialog on
// the way (the first one is shot to `storyFile` when given).
async function winMapZero(page, base, opts, storyFile) {
  const files = [];
  await page.goto(base + captureUrl(0, opts).path);
  await page.waitForFunction(() => window.__capture, null, { timeout: 30_000 });
  await watchResults(page);
  await page.evaluate(() => window.__capture.end('victory'));
  const deadline = Date.now() + 15_000;
  while (!(await visible(page, '#results[data-result="victory"]'))) {
    if (Date.now() > deadline) throw new Error('#results[data-result="victory"] never showed after the victory');
    if (await visible(page, '#story-dialog-skip')) {
      if (storyFile && !files.length) {
        await expectAttr(page, '#story-dialog', 'phase', 'complete');
        await storySettled(page);
        files.push(await shoot(page, storyFile));
      }
      await page.locator('#story-dialog-skip').click();
      // The dialog swallows a tap for this long after it closes; the results' first
      // tap must not be eaten by it.
      await pastCloseGuard(page);
    }
    await page.waitForTimeout(200);
  }
  if (await visible(page, '#game-msg')) throw new Error('#game-msg showed alongside the results');
  await expectText(page, '#results-next', RESULTS_COPY.actions.next, 1_000);
  return files;
}

// From here on data-arrival changes are logged, with the page time each state was
// first seen, so a run can prove which states it passed through and when.
const watchArrivals = page => page.evaluate(() => {
  const el = document.querySelector('#map-overworld');
  window.__arrivals = [];
  window.__arrivalAt = {};
  new MutationObserver(() => {
    window.__arrivals.push(el.dataset.arrival);
    window.__arrivalAt[el.dataset.arrival] ??= performance.now();
  }).observe(el, { attributes: true, attributeFilter: ['data-arrival'] });
});

// Results to the world map (spec 12.2): one tap on the stage finishes the reveal (or
// does nothing once it's done), then, past the act guard, a real tap on `via`. Then
// through campaign_intro (a fresh context has not seen it), which the arrival waits under.
async function returnToMap(page, deviceName, onStory = async () => {}, via = '#results-map') {
  const stage = await page.locator('#results .rs-stage').boundingBox();
  const centre = { x: stage.x + stage.width / 2, y: stage.y + stage.height / 2 };
  if (await page.evaluate(({ x, y }) => !!document.elementFromPoint(x, y)?.closest('.rs-btn'), centre)) {
    throw new Error(`the stage tap point (${Math.round(centre.x)}, ${Math.round(centre.y)}) is on a results button`);
  }
  await tapPoint(page, deviceName, centre);
  await expectAttr(page, '#results', 'phase', 'ready', FINISH_BOUND_MS);
  await page.waitForTimeout(RESULTS.actGuardMs + 100);
  await tap(page, deviceName, via);
  await page.locator('#map-select').waitFor({ state: 'visible', timeout: 10_000 });
  await expectVisible(page, '#story-dialog');
  await onStory();
  await expectAttr(page, '#map-overworld', 'arrival', 'waiting');
  await watchArrivals(page);
  await page.locator(MAP_READY).waitFor({ timeout: 5_000 });
  await tap(page, deviceName, '#story-dialog-skip');
  await expectVisible(page, '#story-dialog', false);
  await pastCloseGuard(page);
}

const arrivals = page => page.evaluate(() => window.__arrivals);

// The post-win end state of a fresh map-0 win (spec 7.3): frontier 1, Lunar Gate's
// card open on the newly lit node, and nothing else selected.
async function expectArrivalDone(page) {
  await expectAttr(page, '#map-overworld', 'arrival', 'done');
  await expectAttr(page, '#map-overworld', 'frontier', '1');
  await expectText(page, '#featured-name', MAPS[1].name);
  const next = '.ow-node[data-map-id="1"]';
  for (const cls of ['next', 'active']) {
    if (!(await hasClass(page, next, cls))) throw new Error(`${next} not .${cls}`);
  }
  if (await hasClass(page, '.ow-node[data-map-id="0"]', 'active')) throw new Error('.ow-node[data-map-id="0"] still .active');
}

// NEXT MISSION lands with LAUNCH focused (spec 9.3). The focus is programmatic after a
// pointer gesture, so a mouse user sees no :focus-visible ring (spec 7.3); on touch
// the ring is only reported, as Chrome's heuristic there isn't the spec's call.
async function expectLaunchFocused(page, deviceName, label) {
  const f = await page.evaluate(() => {
    const el = document.activeElement;
    return { id: el?.id || el?.tagName || null, ring: !!el?.matches(':focus-visible'), outline: el ? getComputedStyle(el).outlineStyle : null };
  });
  if (f.id !== 'featured-play') throw new Error(`focus on ${f.id} after NEXT MISSION, expected #featured-play`);
  console.log(`  focus ${deviceName} ${label}: #featured-play :focus-visible=${f.ring} outline-style=${f.outline}`);
  if (!DEVICES[deviceName].hasTouch && f.ring) throw new Error(`#featured-play shows a :focus-visible ring (outline ${f.outline}) after a mouse click`);
}

// Win map 0, return by NEXT MISSION, shoot the flight, then skip it with a real tap ON
// node 0: a leaked tap would select node 0 and fail the end-state check.
function capturePostWin(browser, base, deviceName, dir, opts) {
  return screensRun(browser, deviceName, 'post-win', {}, async (page, out) => {
    out.files.push(...await winMapZero(page, base, opts, join(dir, '06-victory-story.png')));
    const reveal = await revealShot(page, VICTORY_REVEAL_MS, join(dir, '07a-victory-reveal.png'));
    out.files.push(reveal.file);
    if (reveal.phase !== 'revealing') throw new Error(`07a shot at data-phase="${reveal.phase}", expected "revealing"`);
    await expectAttr(page, '#results', 'phase', 'ready');
    await resultsSettled(page);
    out.files.push(await shoot(page, join(dir, '07-victory.png')));
    out.layout.push(await resultsAudit(page, deviceName, 'victory'));
    if (TALL_RESULTS_DEVICES.has(deviceName)) out.layout.push(await tallCompositionAudit(page, deviceName, 'victory'));
    await returnToMap(page, deviceName, undefined, '#results-next');
    await expectAttr(page, '#map-overworld', 'arrival', 'playing');
    const playingAt = Date.now();
    await page.waitForTimeout(ARRIVAL_MID_MS);
    // CSS-px shot: a DPR-3 full-resolution capture eats a large share of the flight.
    out.files.push(await shoot(page, join(dir, '07b-arrival-mid.png'), { scale: 'css' }));
    // Margin for the late 'playing' read: the natural end must stay out of the skip window.
    const leftMs = ARRIVAL.totalMs - (Date.now() - playingAt);
    if (leftMs < 2 * SKIP_DONE_MS) throw new Error(`only ${leftMs} ms of arrival left before the skip tap; the harness was too slow to test the skip`);
    await tapPoint(page, deviceName, await nodeFace(page, 0));
    await expectAttr(page, '#map-overworld', 'arrival', 'done', SKIP_DONE_MS);
    await expectArrivalDone(page);
    await expectLaunchFocused(page, deviceName, 'post-win');
    await page.waitForTimeout(500);
    out.files.push(await shoot(page, join(dir, '07c-arrival-done.png')));
    out.layout.push(await audit(page, deviceName, 'post-win-map', MAP_SELECT_TARGETS));
  });
}

// The skip as a long press on a selectable node: the press skips, and its late
// release must not select. The next ordinary tap then does.
function captureHeldSkip(browser, base, deviceName, opts) {
  return screensRun(browser, deviceName, 'held-skip', {}, async page => {
    await winMapZero(page, base, opts, null);
    await returnToMap(page, deviceName);
    await expectAttr(page, '#map-overworld', 'arrival', 'playing');
    const release = await pressPoint(page, deviceName, await nodeFace(page, 0));
    // Read while still held: the press itself must skip, long before the natural end.
    await page.waitForTimeout(SKIP_DONE_MS);
    const held = await attr(page, '#map-overworld', 'arrival');
    await page.waitForTimeout(HOLD_MS - SKIP_DONE_MS);
    await release();
    if (held !== 'done') throw new Error(`arrival "${held}" ${SKIP_DONE_MS} ms into a held press, expected "done"`);
    await expectArrivalDone(page);
    await tapPoint(page, deviceName, await nodeFace(page, 0));
    await expectText(page, '#featured-name', MAPS[0].name);
  });
}

// Reduced motion (spec 6): the title is lit on show, and the arrival jumps
// straight to its end state without ever playing.
function captureReducedMotion(browser, base, deviceName, dir) {
  return screensRun(browser, deviceName, 'reduced-motion', { contextOptions: { reducedMotion: 'reduce' } }, async (page, out) => {
    await page.goto(base + '/');
    await page.locator('#title-screen').waitFor({ state: 'visible', timeout: 30_000 });
    const phase = await attr(page, '#title-screen', 'phase');
    if (phase !== 'lit') throw new Error(`title data-phase="${phase}" on show, expected "lit"`);
    out.files.push(await shoot(page, join(dir, '00c-title-reduced-motion.png')));
    // The title is not tapped, so campaign_intro is still unseen for the return.
    await reducedMotionResults(page, base, deviceName);
    // Read the moment it shows: the first frame is already the whole line, still.
    await returnToMap(page, deviceName, () => expectStoryStill(page, 'campaign_intro'));
    await expectArrivalDone(page);
    const seen = await arrivals(page);
    if (seen.includes('playing')) throw new Error(`arrival went through ${seen.join(' -> ')}, expected straight to done`);
    out.files.push(await shoot(page, join(dir, '07d-arrival-reduced-motion.png')));
    out.layout.push(await audit(page, deviceName, 'reduced-motion-map', MAP_SELECT_TARGETS));
    // The glitching Veth panel, which loops forever with motion on, is still too.
    await seedSave(page, GALLERY_SAVE);
    await page.goto(base + '/');
    await page.locator('#title-screen').waitFor({ state: 'visible', timeout: 30_000 });
    await tapCentre(page, deviceName);
    await page.locator(MAP_READY).waitFor({ timeout: 10_000 });
    await openStoryLogEntry(page, deviceName, VETH_SEQUENCE);
    for (let i = 0; i < VETH_INDEX; i++) {
      await expectStoryStill(page, `${VETH_SEQUENCE}[${i}]`);
      await nextPanel(page, deviceName);
    }
    await expectStoryStill(page, `${VETH_SEQUENCE}[${VETH_INDEX}]`);
    await expectAttr(page, '#story-dialog', 'glitch', '1', 0);
    await storySettled(page);
    out.files.push(await shoot(page, join(dir, '10g-story-veth-reduced-motion.png')));
    await skipStory(page, deviceName);
  });
}

// Spec 12.2 / 7.2 case 4: with motion off the results open ready, fading only, and a
// tap already in flight (here: WORLD MAP, inside the act guard) does nothing. No
// epilogue on the way in, or its own close swallow would eat the tap instead.
async function reducedMotionResults(page, base, deviceName) {
  await gotoLevel(page, base, 0, FIRST_CLEAR_SAVE);
  await watchResults(page);
  const point = await page.evaluate(() => {
    window.__capture.end('victory');
    const r = document.querySelector('#results-map').getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  await tapPoint(page, deviceName, point);
  const { log, clicks } = await resultsLog(page);
  const open = log.find(e => !e.hidden);
  if (!open) throw new Error('#results never opened');
  if (open.phase !== 'ready') throw new Error(`results opened at data-phase="${open.phase}" with motion off, expected "ready"`);
  if (open.anims.join() !== 'rs-fade') throw new Error(`results opened running [${open.anims.join(', ')}] with motion off, expected only the root rs-fade`);
  const gapMs = clicks[0] - open.t;
  if (!(gapMs < RESULTS.actGuardMs)) throw new Error(`the tap landed ${Math.round(gapMs)} ms after open; the harness was too slow to land it inside the act guard`);
  await page.waitForTimeout(RESULTS.fadeMs + 100);
  const left = await page.evaluate(() => document.querySelector('#results').getAnimations({ subtree: true }).map(a => a.animationName ?? a.constructor.name));
  if (left.length) throw new Error(`results still running [${left.join(', ')}] ${RESULTS.fadeMs + 100} ms after open with motion off`);
  if (!(await visible(page, '#results')) || await visible(page, '#map-select')) throw new Error('a tap inside the act guard left the results with motion off');
}

// Logs #results' open/close and phase changes, and every click, on the page clock, so
// a run can tell a tap-finish from the natural end without racing the reveal. The
// open entry also lists what is animating on that first frame.
const watchResults = page => page.evaluate(() => {
  const root = document.querySelector('#results');
  window.__results = [];
  window.__clicks = [];
  new MutationObserver(() => window.__results.push({
    t: performance.now(), hidden: root.hidden, phase: root.dataset.phase ?? null,
    anims: root.hidden ? [] : root.getAnimations({ subtree: true }).map(a => a.animationName ?? a.constructor.name),
  })).observe(root, { attributes: true, attributeFilter: ['hidden', 'data-phase'] });
  document.addEventListener('click', () => window.__clicks.push(performance.now()), true);
});

const resultsLog = page => page.evaluate(() => ({ log: window.__results, clicks: window.__clicks, now: performance.now() }));

// A mid-reveal frame `atMs` after the results opened (page clock). CSS px, so the
// screenshot doesn't eat the moment; the phase is read after it, so a shot that
// landed on the finished screen can't pass for a reveal.
async function revealShot(page, atMs, file) {
  await page.waitForFunction(ms => {
    const open = window.__results.find(e => !e.hidden);
    return open && performance.now() >= open.t + ms;
  }, atMs, { polling: 'raf', timeout: 10_000 });
  await shoot(page, file, { scale: 'css' });
  return { file, phase: await attr(page, '#results', 'phase') };
}

// Waits out the one-shot reveal (the Veth's glitch loops forever) and the portrait.
async function resultsSettled(page) {
  await until(() => page.evaluate(() => document.querySelector('#results').getAnimations({ subtree: true })
    .filter(a => a.effect.getComputedTiming().iterations !== Infinity && a.playState !== 'finished').length),
  n => n === 0, n => `${n} results animation(s) still running`);
  await until(() => page.evaluate(() => {
    const img = document.querySelector('#results-portrait img');
    return img ? img.complete && img.naturalWidth > 0 : !!document.querySelector('#results-portrait .rs-initial');
  }), Boolean, () => 'results portrait never painted (no loaded img, no fallback initial)');
}

// Spec 6.2: the approved mockup-B composition on the reference desktop. The size tiers
// key on the stage's content box (its padding excluded), so a threshold that reads
// right against the map height can still drop this device into the short tier.
const TALL_RESULTS_DEVICES = new Set(['desktop1440']);

async function tallCompositionAudit(page, deviceName, label) {
  const m = await page.evaluate(() => {
    const centre = r => r.left + r.width / 2;
    const stage = document.querySelector('#results .rs-stage').getBoundingClientRect();
    return {
      actionsColumn: getComputedStyle(document.querySelector('#results-actions')).gridColumnStart,
      starsOffset: Math.round(centre(document.querySelector('#results-stars').getBoundingClientRect()) - centre(stage)),
    };
  });
  const problems = [];
  if (m.actionsColumn === '2') problems.push('results: the actions sit in their own column (short tier), expected the tall stack');
  if (Math.abs(m.starsOffset) > 2) problems.push(`results: the stars row is ${m.starsOffset} px off the stage centre, expected centred under the banner`);
  return { device: deviceName, label: `${label}-composition`, problems };
}

// The finished results screen as painted, judged by resultsProblems (spec 8.4). The
// map rect comes from the canvas and the page's own pointer class, not from the
// stage under test. bannerLowerEdge wants the banner's box BEFORE its skewY (about
// its centre), so it is the offset box (offset* ignore transforms), not the skewed
// bounding box.
async function resultsAudit(page, deviceName, label) {
  const pointerFine = await page.evaluate(q => matchMedia(q).matches, POINTER_FINE_QUERY);
  const box = await page.locator(GAME_CANVAS).boundingBox();
  const a = worldToPagePoint({ x: 0, y: 0 }, box, { pointerFine });
  const b = worldToPagePoint({ x: WORLD_WIDTH, y: WORLD_HEIGHT }, box, { pointerFine });
  const mapRect = { left: a.x, top: a.y, right: b.x, bottom: b.y, width: b.x - a.x, height: b.y - a.y };
  const m = await page.evaluate(({ buttons, compactQuery }) => {
    const plain = r => ({ left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height });
    const q = sel => document.querySelector(sel);
    const isShown = el => el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true });
    const shown = el => (el && isShown(el) ? plain(el.getBoundingClientRect()) : null);
    const root = q('#results');
    const stage = q('#results .rs-stage');
    const banner = q('#results .rs-banner');
    const text = q('#results-banner-text');
    const s = stage.getBoundingClientRect();
    const bannerBox = banner && banner.offsetParent === stage ? plain({
      left: s.left + banner.offsetLeft, top: s.top + banner.offsetTop,
      right: s.left + banner.offsetLeft + banner.offsetWidth, bottom: s.top + banner.offsetTop + banner.offsetHeight,
      width: banner.offsetWidth, height: banner.offsetHeight,
    }) : null;
    const fontSels = ['#results-kicker', '#results-banner-text', '.rs-chip-val', '.rs-chip-lbl', '.rs-new-best', '#results-speaker', '#results-line', '.rs-btn'];
    return {
      result: root.dataset.result,
      // Read where it is painted: the stage's size tiers set the skew on the banner.
      skewDeg: parseFloat(getComputedStyle(banner).getPropertyValue('--rs-skew')),
      bannerBox,
      kicker: shown(q('#results-kicker')),
      bannerText: shown(text),
      bannerTextScroll: { scrollWidth: text.scrollWidth, clientWidth: text.clientWidth },
      stars: root.dataset.result === 'defeat' ? null : shown(q('#results-stars')),
      chips: [...document.querySelectorAll('#results-chips .rs-chip')].map(shown),
      newBest: [...document.querySelectorAll('#results-chips .rs-new-best')].filter(el => !el.hidden).map(shown),
      caption: shown(q('#results-caption')),
      // The stage is the fixed-size, overflow-clipped map rect: content taller than it
      // (a caption that wrapped one line too many) shows up as its scroll height, less
      // the bottom padding that scroll height also counts.
      captionScroll: {
        scrollHeight: stage.scrollHeight - parseFloat(getComputedStyle(stage).paddingBottom), clientHeight: stage.clientHeight,
      },
      actions: shown(q('#results-actions')),
      // A selector that matches nothing is reported missing, not skipped as hidden.
      buttons: buttons.map(sel => {
        const el = q(sel);
        return { name: sel, rect: el ? plain(el.getBoundingClientRect()) : null, visible: el ? isShown(el) : true };
      }),
      fonts: fontSels.flatMap(sel => [...document.querySelectorAll(`#results ${sel}`)].filter(isShown)
        .map(el => ({ name: sel, px: parseFloat(getComputedStyle(el).fontSize) }))),
      compact: matchMedia(compactQuery).matches,
    };
  }, { buttons: RESULTS_BUTTONS, compactQuery: COMPACT_QUERY });
  const minTouchPx = !pointerFine || m.compact ? MIN_TOUCH_PX : FINE_TALL_MIN_PX;
  const problems = Number.isFinite(m.skewDeg) ? resultsProblems({ ...m, mapRect, minTouchPx }) : ['--rs-skew unreadable'];
  return { device: deviceName, label, problems: problems.map(p => `results: ${p}`) };
}

// Lives that earn exactly `stars` on the map by the star rule; 1 is the floor's.
function livesFor(mapId, stars) {
  const t = STAR_RULE.thresholds.find(x => x.stars === stars);
  return t ? Math.ceil(t.minRatio * MAPS[mapId].startLives) : 1;
}

const kickerFor = (mapId, result) => (result === 'victory' && mapId === FINAL_MAP
  ? RESULTS_COPY.campaignComplete : RESULTS_COPY.kicker(mapId + 1, MAPS[mapId].name));

// What the open results show, read only after sentinels were planted before the end.
const resultsShown = page => page.evaluate(() => ({
  kicker: document.querySelector('#results-kicker').textContent,
  line: document.querySelector('#results-line').textContent,
  stars: document.querySelector('#results').dataset.stars,
  newBest: [...document.querySelectorAll('#results-chips .rs-new-best')].filter(el => !el.hidden).length,
  chips: document.querySelectorAll('#results-chips .rs-chip').length,
}));

const plantResultsSentinels = page => page.evaluate(() => {
  for (const id of ['results-kicker', 'results-line']) document.getElementById(id).textContent = 'SENTINEL';
});

// Spec 12.2 worst case on one map: forced content, then the audit of what painted.
async function worstCaseAudit(page, base, deviceName, prefix, c) {
  await gotoLevel(page, base, c.mapId, WORST_CASE_SAVE, MAP_WAVES[c.mapId].length);
  await plantResultsSentinels(page);
  const run = { ...WORST_CASE_RUN, ...(c.result === 'victory' ? { lives: livesFor(c.mapId, c.stars) } : {}) };
  await page.evaluate(([r, o]) => window.__capture.end(r, o), [c.result, run]);
  await expectAttr(page, '#results', 'phase', 'ready');
  await resultsSettled(page);
  const got = await resultsShown(page);
  const want = { kicker: kickerFor(c.mapId, c.result), line: run.line, stars: String(c.stars),
    newBest: c.result === 'victory' ? 2 : 0, chips: 4 };
  if (JSON.stringify(got) !== JSON.stringify(want)) throw new Error(`${prefix}-${c.label} showed ${JSON.stringify(got)}, expected ${JSON.stringify(want)}`);
  return resultsAudit(page, deviceName, `${prefix}-${c.label}`);
}

async function worstCaseAudits(page, base, deviceName, prefix) {
  const layout = [];
  for (const c of WORST_CASES) layout.push(await worstCaseAudit(page, base, deviceName, prefix, c));
  return layout;
}

// The worst cases, and the natural final-map victory (07e: CAMPAIGN COMPLETE, WORLD
// MAP primary, no NEXT MISSION).
function captureResultsAudits(browser, base, deviceName, dir) {
  return screensRun(browser, deviceName, 'results-audit', {}, async (page, out) => {
    out.layout.push(...await worstCaseAudits(page, base, deviceName, 'worst'));
    await gotoLevel(page, base, FINAL_MAP, { version: 4, maps: noStars(), seenStoryBeats: ALL_BEATS_SEEN });
    await plantResultsSentinels(page);
    await page.evaluate(() => window.__capture.end('victory'));
    await expectAttr(page, '#results', 'phase', 'ready');
    await resultsSettled(page);
    const got = await resultsShown(page);
    if (got.kicker !== RESULTS_COPY.campaignComplete) throw new Error(`final victory kicker "${got.kicker}", expected "${RESULTS_COPY.campaignComplete}"`);
    if (await visible(page, '#results-next')) throw new Error('NEXT MISSION offered on the final map');
    if (!(await hasClass(page, '#results-map', 'rs-btn--primary'))) throw new Error('WORLD MAP is not the primary on the final map');
    out.files.push(await shoot(page, join(dir, '07e-victory-final.png')));
    out.layout.push(await resultsAudit(page, deviceName, 'victory-final'));
  });
}

// Spec 12.2: a double tap on NEXT MISSION mid-reveal finishes the reveal and stops
// there; the act guard drops the second tap. One tap after the guard then leaves.
function captureResultsGuard(browser, base, deviceName) {
  return screensRun(browser, deviceName, 'results-guard', {}, async page => {
    await gotoLevel(page, base, 0, FIRST_CLEAR_SAVE);
    await watchResults(page);
    const point = await page.evaluate(() => {
      window.__capture.end('victory');
      const r = document.querySelector('#results-next').getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    const before = await resultsLog(page);
    const opened = before.log.find(e => !e.hidden)?.t;
    if (opened === undefined) throw new Error('#results never opened');
    const leftMs = VICTORY_END_MS - (before.now - opened);
    if (leftMs < 2 * FINISH_BOUND_MS) throw new Error(`only ${Math.round(leftMs)} ms of reveal left before the double tap; the harness was too slow to test the guard`);
    await tapPoint(page, deviceName, point);
    await tapPoint(page, deviceName, point);
    await expectAttr(page, '#results', 'phase', 'ready', FINISH_BOUND_MS);
    const { log, clicks } = await resultsLog(page);
    if (clicks.length < 2) throw new Error(`${clicks.length} click(s) reached the page from the double tap`);
    const gapMs = clicks[1] - clicks[0];
    if (gapMs >= RESULTS.actGuardMs) throw new Error(`the two taps were ${Math.round(gapMs)} ms apart; the harness was too slow to land the second inside the act guard`);
    const ready = log.find(e => e.phase === 'ready');
    // The natural end would log at opened + endMs; a tap-finish logs right after the tap.
    if (!ready || ready.t - clicks[0] > FINISH_BOUND_MS || ready.t >= opened + VICTORY_END_MS - FINISH_BOUND_MS) {
      throw new Error(`data-phase went ready ${ready ? Math.round(ready.t - clicks[0]) : '(never)'} ms after the first tap, expected within ${FINISH_BOUND_MS} ms (tap-to-finish)`);
    }
    // Long enough for a leaked second tap to have left for the world map.
    await page.waitForTimeout(1_000);
    if (!(await visible(page, '#results')) || await visible(page, '#map-select')) {
      throw new Error('the double tap\'s second tap left the results (inside the act guard)');
    }
    await expectAttr(page, '#results', 'phase', 'ready', 0);
    await tap(page, deviceName, '#results-next');
    await expectVisible(page, '#map-select', true, 5_000);
  });
}

// No story dialog in the way; neither level below has a between-wave banner on the
// waves it waits through (map 0: waves 3, 7; map 9: waves 6, 12), so nothing holds a countdown.
const AUTO_SEND_SAVE = { version: 4, maps: noStars(), seenStoryBeats: ALL_BEATS_SEEN };
// Tier 4 on every pad: the default build loses map 9 during wave 17's countdown, and a
// lost level freezes the countdown before the warn colour.
const FINAL_MAP_HOLD_BUILD = MAPS[FINAL_MAP].towerSlots.map((_, i) => {
  const types = Object.keys(TOWER_DEFS);
  return `${types[i % types.length]}@${i}:4${'ab'[i % 2]}`;
}).join(',');

// The wave button, wave counter and countdown read in one page task, so they agree:
// separate reads could straddle the frame that sends the wave.
const waveSnapshot = page => page.evaluate(() => {
  const btn = document.querySelector('#wave-btn');
  return {
    countdownMs: window.__capture.countdownMs,
    wave: document.querySelector('#stat-wave').textContent.trim(),
    label: btn.textContent.trim(),
    cdOn: btn.classList.contains('cd-on'),
    // The digits are ::after content, so textContent is the label alone.
    box: { scrollHeight: btn.scrollHeight, clientHeight: btn.clientHeight, scrollWidth: btn.scrollWidth, clientWidth: btn.clientWidth },
    // Distinct line boxes of the label text, for the report.
    lines: (() => {
      const range = document.createRange();
      range.selectNodeContents(btn);
      return new Set([...range.getClientRects()].map(r => Math.round(r.top))).size;
    })(),
  };
});

// Resolves with the button and counter on the first frame where countdownMs is
// non-null and within (above, atMost], or exactly `equals`. Sampled inside the
// predicate, not after it: with a second left, a separate read could land after
// the wave sent.
async function countdownSnapshot(page, { above = -Infinity, atMost = Infinity, equals = null }, timeout) {
  const handle = await page.waitForFunction(([lo, hi, eq]) => {
    const c = window.__capture.countdownMs;
    if (c === null || (eq !== null ? c !== eq : !(c > lo && c <= hi))) return false;
    const btn = document.querySelector('#wave-btn');
    return { countdownMs: c, wave: document.querySelector('#stat-wave').textContent.trim(), label: btn.textContent.trim(), cdOn: btn.classList.contains('cd-on') };
  }, [above, atMost, equals], { timeout, polling: 'raf' });
  return handle.jsonValue();
}

// Spec "Harness": a debug level sends a wave on its own only with ?autosend=1, so
// every other capture is deterministic. (a) proves the countdown sends the next wave;
// (b), the same level with auto-send off, proves (a)'s 2/10 came from the countdown;
// (c) audits the longest real label beside the ring (map 9, wave 18, near-full bonus).
// Waits key on game-time countdownMs, not simMs, which grows during hit-stop.
function captureAutoSend(browser, base, deviceName, dir) {
  return screensRun(browser, deviceName, 'auto-send', {}, async (page, out) => {
    const waves = MAP_WAVES[0].length;
    const sendBy = (lastSpawnMs(MAP_WAVES[0][0]) + countdownMsFor(MAPS[0])) * 2 + STEP_TIMEOUT;

    // (a) Wave 2 is still unsent with a second left, then sends itself.
    await gotoLevel(page, base, 0, AUTO_SEND_SAVE, 1, { autosend: '1' });
    const a = await countdownSnapshot(page, { atMost: 1000 }, sendBy);
    if (a.wave !== `1/${waves}`) throw new Error(`(a) #stat-wave "${a.wave}" with ${a.countdownMs} ms left, expected "1/${waves}"`);
    if (!a.cdOn) throw new Error(`(a) #wave-btn lacks .cd-on with ${a.countdownMs} ms left`);
    if (!/^▶ Send Wave 2/.test(a.label)) throw new Error(`(a) #wave-btn "${a.label}", expected /^▶ Send Wave 2/`);
    await expectText(page, '#stat-wave', `2/${waves}`);

    // (b) Control: auto-send off, the countdown expires and nothing sends.
    await gotoLevel(page, base, 0, AUTO_SEND_SAVE, 1, { autosend: '0' });
    await countdownSnapshot(page, { equals: 0 }, sendBy);
    await page.waitForTimeout(2000);
    const b = await waveSnapshot(page);
    if (b.wave !== `1/${waves}`) throw new Error(`(b) #stat-wave "${b.wave}" 2 s after the countdown expired with auto-send off, expected "1/${waves}"`);
    if (b.label !== '▶ Send Wave 2') throw new Error(`(b) #wave-btn "${b.label}", expected "▶ Send Wave 2"`);
    if (b.cdOn) throw new Error('(b) #wave-btn still .cd-on at zero with auto-send off');

    // (c) Review Focus 3: the longest label, at its biggest bonus and again in the warn colour.
    await gotoLevel(page, base, FINAL_MAP, AUTO_SEND_SAVE, 17, { autosend: '0', build: FINAL_MAP_HOLD_BUILD });
    const shootAndAudit = async label => {
      out.files.push(await shoot(page, join(dir, `${label}.png`)));
      const audited = await audit(page, deviceName, label, IN_GAME_TARGETS, RAIL_ONLY_TARGETS);
      const s = await waveSnapshot(page);
      const b = s.box;
      console.log(`  ${label} ${deviceName}: "${s.label}" ${Math.round(s.countdownMs)} ms left, ${s.lines} line(s), scroll ${b.scrollWidth}x${b.scrollHeight} / client ${b.clientWidth}x${b.clientHeight}`);
      // overflow is visible, so an overflowing label paints over the bevel rather than clipping.
      if (b.scrollHeight > b.clientHeight + 1 || b.scrollWidth > b.clientWidth + 1) {
        audited.problems.push(`#wave-btn label "${s.label}" overflows its box (scroll ${b.scrollWidth}x${b.scrollHeight} > client ${b.clientWidth}x${b.clientHeight})`);
      }
      out.layout.push(audited);
    };
    await countdownSnapshot(page, { above: WAVE_COUNTDOWN.warnSec * 1000 }, lastSpawnMs(MAP_WAVES[FINAL_MAP][16]) * 2 + STEP_TIMEOUT);
    await shootAndAudit('auto-send-longest');
    await until(() => hasClass(page, '#wave-btn', 'cd-warn'), Boolean, () => '#wave-btn never .cd-warn', countdownMsFor(MAPS[FINAL_MAP]) + STEP_TIMEOUT);
    await shootAndAudit('auto-send-warn');
  });
}

// Spec 12.2: RETRY restarts the same map as a normal level: wave 1, full lives, no
// briefing (seen), not paused, and Send Wave sends wave 1. The retried level is not
// a debug one, so window.__capture is stale from here and never read.
function captureRetry(browser, base, deviceName) {
  return screensRun(browser, deviceName, 'results-retry', {}, async page => {
    const map = MAPS[0];
    await gotoLevel(page, base, 0, RETRY_SAVE);
    await page.evaluate(() => window.__capture.end('defeat'));
    await expectAttr(page, '#results', 'phase', 'ready');
    // Sentinels: the retried level must rewrite every one of these.
    await page.evaluate(() => {
      for (const id of ['stat-lives', 'stat-wave', 'wave-btn']) document.getElementById(id).textContent = 'SENTINEL';
    });
    await page.waitForTimeout(RESULTS.actGuardMs + 100);
    await tap(page, deviceName, '#results-retry');
    await expectVisible(page, '#results', false);
    await expectText(page, '#wave-btn', '▶ Send Wave 1');
    await expectText(page, '#stat-lives', map.startLives, 1_000);
    await expectText(page, '#stat-wave', `0/${map.waveCount}`, 1_000);
    if (await hasClass(page, '#paused-overlay', 'shown')) throw new Error('the retried level opened paused');
    // create() plays an unseen briefing synchronously, so it would be up by now.
    if (await visible(page, '#story-dialog')) throw new Error('the briefing played on the retried level (seeded as seen)');
    const focus = await page.evaluate(() => ({ id: document.activeElement?.id || document.activeElement?.tagName, ring: !!document.activeElement?.matches(':focus-visible') }));
    console.log(`  focus ${deviceName} retry: ${focus.id} :focus-visible=${focus.ring}`);
    await tap(page, deviceName, '#wave-btn');
    await expectText(page, '#stat-wave', `1/${map.waveCount}`);
  });
}

// Ruling (Task 7): the best run rides the stars line and must not wrap it; the quote
// above may scroll (it fades when it does) but must keep room for two lines.
async function briefingCardFit(page) {
  const f = await page.evaluate(() => {
    const stars = document.querySelector('#featured-stars');
    const range = document.createRange();
    range.selectNodeContents(stars);
    const rects = [...range.getClientRects()].filter(r => r.width > 0);
    const quote = document.querySelector('#featured-quote');
    return {
      oneLine: rects.length > 0 && Math.max(...rects.map(r => r.top)) < Math.min(...rects.map(r => r.bottom)),
      starsScroll: [stars.scrollWidth, stars.clientWidth],
      quote: { client: quote.clientHeight, scroll: quote.scrollHeight, line: parseFloat(getComputedStyle(quote).lineHeight),
        more: quote.classList.contains('fq-more'), atEnd: quote.scrollTop + quote.clientHeight >= quote.scrollHeight - 1 },
    };
  });
  const problems = [];
  if (!f.oneLine) problems.push('#featured-stars wraps onto a second line');
  if (f.starsScroll[0] > f.starsScroll[1] + 1) problems.push(`#featured-stars clipped: scrollWidth ${f.starsScroll[0]} > clientWidth ${f.starsScroll[1]}`);
  if (f.quote.scroll > f.quote.client + 1 && f.quote.client < 2 * f.quote.line - 1) problems.push(`#featured-quote squeezed to ${f.quote.client}px (< 2 lines of ${f.quote.line}px)`);
  if (f.quote.scroll > f.quote.client + 1 && !f.quote.atEnd && !f.quote.more) problems.push('#featured-quote cut off with no .fq-more fade');
  return problems;
}

const bestLine = r => `${CARD_COPY.bestSep}${CARD_COPY.best}${r.livesLost} ${CARD_COPY.lostWord}${CARD_COPY.bestSep}${formatDuration(r.timeMs)}`.trim();

// Spec 12.2: a replay of a 3-star map that gains nothing. NEXT MISSION -> no arrival,
// the next map's card, LAUNCH focused; WORLD MAP -> the played map's card with the
// record just merged.
function captureNextMissionReplay(browser, base, deviceName, dir) {
  return screensRun(browser, deviceName, 'next-mission-replay', {}, async (page, out) => {
    const merged = mergeRecord(REPLAY_SAVE.records[0], { livesLost: 0, timeMs: REPLAY_RUN.timeMs }).record;
    for (const [via, mapId, record] of [['#results-next', 1, REPLAY_SAVE.records[1]], ['#results-map', 0, merged]]) {
      await gotoLevel(page, base, 0, REPLAY_SAVE);
      // A real run always clicks Send Wave first. Without any pointer-focused element
      // Chrome treats the results' programmatic focus as keyboard focus (a ring), which
      // no player can reach; the debug level jumps straight to the end.
      await tap(page, deviceName, '#wave-btn');
      await page.evaluate(run => window.__capture.end('victory', run), REPLAY_RUN);
      await expectAttr(page, '#results', 'phase', 'ready');
      const stars = await attr(page, '#results', 'stars');
      if (stars !== '3') throw new Error(`replay run earned ${stars} stars, expected 3 (no gain on a 3-star map)`);
      await watchArrivals(page);
      await page.evaluate(() => { document.querySelector('#featured-name').textContent = 'SENTINEL'; });
      await page.waitForTimeout(RESULTS.actGuardMs + 100);
      await tap(page, deviceName, via);
      await page.locator('#map-select').waitFor({ state: 'visible', timeout: 10_000 });
      await page.locator(MAP_READY).waitFor({ timeout: 5_000 });
      await expectText(page, '#featured-name', MAPS[mapId].name);
      await expectText(page, '#featured-stars .fs-best', bestLine(record), 1_000);
      const seen = await arrivals(page);
      if (seen.includes('playing')) throw new Error(`${via}: arrival went through ${seen.join(' -> ')} on a replay with no star gain`);
      if (via === '#results-next') {
        await expectLaunchFocused(page, deviceName, 'next-mission-replay');
        out.files.push(await shoot(page, join(dir, '07f-next-mission-card.png')));
        const card = await briefingCardFit(page);
        out.layout.push({ device: deviceName, label: 'next-mission-card', problems: card });
        out.layout.push(await audit(page, deviceName, 'next-mission-map', MAP_SELECT_TARGETS));
      }
    }
  });
}

// Desktop (keyboard) only, spec 12.2 / 7.4: Enter held through NEXT MISSION on a first
// clear. Its auto-repeats on the world map must neither skip the flight nor press the
// LAUNCH it lands on.
function captureHeldEnter(browser, base, deviceName) {
  return screensRun(browser, deviceName, 'held-enter', {}, async page => {
    await gotoLevel(page, base, 0, FIRST_CLEAR_QUIET_SAVE);
    await page.evaluate(() => window.__capture.end('victory'));
    await expectAttr(page, '#results', 'phase', 'ready');
    const focused = await page.evaluate(() => document.activeElement?.id);
    if (focused !== 'results-next') throw new Error(`focus on ${focused} at ready, expected #results-next`);
    await watchArrivals(page);
    await page.waitForTimeout(RESULTS.actGuardMs + 100);
    await page.keyboard.down('Enter');
    await page.locator(MAP_READY).waitFor({ timeout: 10_000 });
    await expectAttr(page, '#map-overworld', 'arrival', 'playing', 1_000);
    const t0 = Date.now();
    // Playwright sends repeat: true for a key that is already down.
    for (let i = 0; i < 3; i++) await page.keyboard.down('Enter');
    const read = await page.evaluate(() => ({ arrival: document.querySelector('#map-overworld').dataset.arrival,
      leftFrom: performance.now() - window.__arrivalAt.playing }));
    const readMs = Date.now() - t0;
    await page.keyboard.up('Enter');
    if (readMs > SKIP_DONE_MS) throw new Error(`the repeats and the read took ${readMs} ms; the harness was too slow to test the held key`);
    const leftMs = ARRIVAL.totalMs - read.leftFrom;
    if (leftMs < 2 * SKIP_DONE_MS) throw new Error(`only ${Math.round(leftMs)} ms of flight left at the repeats; the harness was too slow to test the held key`);
    if (read.arrival !== 'playing') throw new Error(`arrival "${read.arrival}" after three held-Enter repeats, expected "playing"`);
    await expectAttr(page, '#map-overworld', 'arrival', 'done');
    // A repeat that pressed LAUNCH would have started the level.
    if (await visible(page, '#hud-layer')) throw new Error('#hud-layer visible: a held-Enter repeat launched the mission');
    await expectVisible(page, '#map-select', true, 0);
  });
}

// Motion off (spec 6): the panel is complete on its first frame and nothing in the
// dialog animates, not even the infinite glitch and blink.
async function expectStoryStill(page, what) {
  const phase = await dialogAttr(page, 'phase');
  if (phase !== 'complete') throw new Error(`${what} data-phase="${phase}" on its first frame with motion off, expected "complete"`);
  const running = await page.evaluate(() => document.querySelector('#story-dialog').getAnimations({ subtree: true }).map(a => a.animationName ?? a.constructor.name));
  if (running.length) throw new Error(`${what} has ${running.length} animation(s) with motion off: ${running.join(', ')}`);
}

// Both webfont formats blocked (a .woff fallback would otherwise load): the title
// still reaches lit on the fallback face, and the title and map audits stay clean.
function captureNoFonts(browser, base, deviceName, dir) {
  return screensRun(browser, deviceName, 'no-fonts', { blockedUrl: WEBFONT_URL }, async (page, out) => {
    await page.goto(base + '/');
    await page.locator('#title-screen').waitFor({ state: 'visible', timeout: 30_000 });
    // It still sweeps (on the fallback face), not just lands lit.
    await titlePhase(page, 'sweep');
    await titlePhase(page, 'lit');
    // Sentinel: prove the block held, or this run tests the real fonts.
    const faces = await page.evaluate(() => [...document.fonts].map(f => `${f.family} ${f.status}`));
    const loaded = faces.filter(f => f.endsWith(' loaded'));
    if (loaded.length) throw new Error(`webfonts loaded despite the block: ${loaded.join(', ')}`);
    out.files.push(await shoot(page, join(dir, '00d-title-no-fonts.png')));
    out.layout.push(await audit(page, deviceName, 'no-fonts-title', TITLE_TARGETS));
    await tapCentre(page, deviceName);
    await page.locator('#story-dialog-skip').waitFor({ state: 'visible', timeout: 10_000 });
    await expectAttr(page, '#story-dialog', 'phase', 'complete');
    await storySettled(page);
    out.layout.push(await storyDialogAudit(page, deviceName, 'no-fonts-story'));
    await page.locator(MAP_READY).waitFor({ timeout: 5_000 });
    await tap(page, deviceName, '#story-dialog-skip');
    await expectVisible(page, '#story-dialog', false);
    await page.waitForTimeout(800);
    out.files.push(await shoot(page, join(dir, '02c-map-no-fonts.png')));
    out.layout.push(await audit(page, deviceName, 'no-fonts-map', MAP_SELECT_TARGETS));
    // The fallback face must not lengthen the longest line past its room either (spec 11).
    await seedSave(page, GALLERY_SAVE);
    await page.goto(base + '/');
    await page.locator('#title-screen').waitFor({ state: 'visible', timeout: 30_000 });
    await tapCentre(page, deviceName);
    await page.locator(MAP_READY).waitFor({ timeout: 10_000 });
    const longest = await longestLine(page, deviceName, 'no-fonts-longest', join(dir, '10h-story-longest-no-fonts.png'));
    out.files.push(...longest.files);
    out.layout.push(...longest.layout);
    // The fallback face is wider than Orbitron: the worst-case results must still fit.
    out.layout.push(...await worstCaseAudits(page, base, deviceName, 'no-fonts'));
  });
}

// One node's art 404s: that node shows the numbered circle with its state
// classes (the seeded save makes it the frontier: next + active).
function captureMissingArt(browser, base, deviceName, dir) {
  return screensRun(browser, deviceName, 'missing-art', { blockedUrl: BLOCKED_ART_URL }, async (page, out) => {
    await page.addInitScript(save => localStorage.setItem('lastlight_save', JSON.stringify(save)), BLOCKED_ART_SAVE);
    await page.goto(base + '/');
    await page.locator('#title-screen').waitFor({ state: 'visible', timeout: 30_000 });
    await tapCentre(page, deviceName);
    await page.locator(MAP_READY).waitFor({ timeout: 10_000 });
    if (await visible(page, '#story-dialog')) throw new Error('campaign_intro played on a save that has seen it');
    const sel = `.ow-node[data-map-id="${BLOCKED_ART_MAP}"]`;
    await until(() => hasClass(page, sel, 'ow-node-fallback'), Boolean, () => `${sel} never fell back to the numbered circle`);
    const node = await page.locator(sel).evaluate(el => {
      const num = el.querySelector('.ow-node-num');
      return { classes: [...el.classList], art: !!el.querySelector('.ow-node-art'), num: num.textContent, numVisible: num.checkVisibility() };
    });
    const missing = ['next', 'active'].filter(c => !node.classes.includes(c));
    if (missing.length) throw new Error(`${sel} [${node.classes.join(' ')}] lacks .${missing.join(', .')}`);
    if (node.art || !node.numVisible || node.num !== String(BLOCKED_ART_MAP + 1)) {
      throw new Error(`${sel} fallback art=${node.art} num="${node.num}" visible=${node.numVisible}, expected the circle "${BLOCKED_ART_MAP + 1}"`);
    }
    await page.waitForTimeout(500);
    out.files.push(await shoot(page, join(dir, '02d-missing-art.png')));
    out.layout.push(await audit(page, deviceName, 'missing-art-map', MAP_SELECT_TARGETS));
    // The Veth panel with its portrait 404ing: the initial inside the same frame.
    await openStoryLogEntry(page, deviceName, VETH_SEQUENCE);
    await playToPanel(page, deviceName, VETH_SEQUENCE, VETH_INDEX);
    const face = await page.locator('#story-dialog-portrait').evaluate(el => ({
      img: !!el.querySelector('img'), initial: el.querySelector('.sd-initial')?.textContent ?? null,
    }));
    const want = STORY_SPEAKERS.veth.name.trim()[0];
    if (face.img || face.initial !== want) throw new Error(`Veth portrait img=${face.img} initial="${face.initial}", expected the "${want}" fallback`);
    out.files.push(await shoot(page, join(dir, '10e-story-fallback.png')));
    out.layout.push(await storyDialogAudit(page, deviceName, 'story-fallback'));
    await skipStory(page, deviceName);
  });
}

// Story Log replays on a save with every beat seen (spec 8.3): the Finale's
// multi-speaker run with real taps (rael right, command left), the derived longest
// line, and the Veth's jagged, glitching panel.
// The map under the dialog as a leaked tap would change it: the level started,
// another card featured, another node selected.
const mapState = page => page.evaluate(() => ({
  map: !!document.querySelector('#map-select')?.checkVisibility(),
  hud: !!document.querySelector('#hud-layer')?.checkVisibility(),
  featured: document.querySelector('#featured-name')?.textContent ?? null,
  active: [...document.querySelectorAll('.ow-node.active')].map(n => n.dataset.mapId).join(','),
}));

// Continue's rect against LAUNCH's and the featured card's, and the point to tap:
// inside Continue and over LAUNCH (else the card) where they overlap.
const continueOverlap = page => page.evaluate(() => {
  const r = sel => document.querySelector(sel).getBoundingClientRect();
  const meet = (a, b) => {
    const x0 = Math.max(a.left, b.left), x1 = Math.min(a.right, b.right);
    const y0 = Math.max(a.top, b.top), y1 = Math.min(a.bottom, b.bottom);
    return x1 - x0 >= 4 && y1 - y0 >= 4 ? { x: (x0 + x1) / 2, y: (y0 + y1) / 2 } : null;
  };
  const next = r('#story-dialog-next');
  const over = [['#featured-play', meet(next, r('#featured-play'))], ['#map-featured', meet(next, r('#map-featured'))]]
    .find(([, pt]) => pt);
  const point = over ? over[1] : { x: next.left + next.width / 2, y: next.top + next.height / 2 };
  const hit = document.elementFromPoint(point.x, point.y);
  return { under: over ? over[0] : null, point, onContinue: !!hit?.closest('#story-dialog-next') };
});

// Final review I5: a fast double tap on the closing Continue. The first tap hides
// the overlay, so the second lands beneath it. On iPhone landscape Continue sits
// over the featured card just above LAUNCH; a leaked tap there starts Mission 1.
const OVERLAP_DEVICES = new Set(['iphone']);
function captureDoubleTapClose(browser, base, deviceName) {
  return screensRun(browser, deviceName, 'double-tap-close', {}, async page => {
    await page.goto(base + '/');
    await page.locator('#title-screen').waitFor({ state: 'visible', timeout: 30_000 });
    await tapCentre(page, deviceName);
    await page.locator(MAP_READY).waitFor({ timeout: 10_000 });
    await expectVisible(page, '#story-dialog');
    const last = STORY_SEQUENCES.campaign_intro.panels.length - 1;
    await playToPanel(page, deviceName, 'campaign_intro', last);
    await expectText(page, '#story-dialog-next', 'Continue ▸', 1_000);
    await page.waitForTimeout(STORY_DIALOG.advanceGuardMs + 100);
    const before = await mapState(page);
    const geo = await continueOverlap(page);
    if (!geo.onContinue) throw new Error(`the tap point (${geo.point.x}, ${geo.point.y}) is not on Continue`);
    if (OVERLAP_DEVICES.has(deviceName) && !geo.under) throw new Error('Continue overlaps neither LAUNCH nor the featured card; the double tap proves nothing here');
    const startedAt = Date.now();
    await tapPoint(page, deviceName, geo.point);
    await tapPoint(page, deviceName, geo.point);
    // Measured from before the first tap, so the real gap between them is shorter.
    const gapMs = Date.now() - startedAt;
    if (gapMs >= STORY_DIALOG.advanceGuardMs) throw new Error(`the two taps took ${gapMs} ms; the harness was too slow to land the second inside the guard`);
    await expectVisible(page, '#story-dialog', false);
    // Long enough for a leaked LAUNCH to have started the level.
    await page.waitForTimeout(1_000);
    const after = await mapState(page);
    if (JSON.stringify(after) !== JSON.stringify(before)) {
      throw new Error(`the double tap's second tap (over ${geo.under ?? 'Continue only'}) leaked: ${JSON.stringify(before)} -> ${JSON.stringify(after)}`);
    }
  });
}

function captureStoryGallery(browser, base, deviceName, dir) {
  return screensRun(browser, deviceName, 'story-gallery', {}, async (page, out) => {
    await seedSave(page, GALLERY_SAVE);
    await page.goto(base + '/');
    await page.locator('#title-screen').waitFor({ state: 'visible', timeout: 30_000 });
    await tapCentre(page, deviceName);
    await page.locator(MAP_READY).waitFor({ timeout: 10_000 });
    if (await visible(page, '#story-dialog')) throw new Error('campaign_intro played on a save that has seen it');

    const finale = 'campaign_ending';
    const panels = STORY_SEQUENCES[finale].panels;
    const shots = { 0: ['10-story-rael.png', 'story-rael'], 1: ['10b-story-command.png', 'story-command'] };
    await openStoryLogEntry(page, deviceName, finale);
    for (let i = 0; i < panels.length; i++) {
      if (i > 0) {
        await nextPanel(page, deviceName);
        await expectSpeaker(page, finale, i);
      }
      await completeLine(page, deviceName);
      if (shots[i]) {
        await storySettled(page);
        out.files.push(await shoot(page, join(dir, shots[i][0])));
        out.layout.push(await storyDialogAudit(page, deviceName, shots[i][1]));
      }
    }
    await expectText(page, '#story-dialog-next', 'Continue ▸', 1_000);
    await page.waitForTimeout(STORY_DIALOG.advanceGuardMs + 100);
    await tap(page, deviceName, STORY_CAPTION);
    await expectVisible(page, '#story-dialog', false);
    await pastCloseGuard(page);

    const longest = await longestLine(page, deviceName, 'story-longest', join(dir, '10c-story-longest.png'));
    out.files.push(...longest.files);
    out.layout.push(...longest.layout);

    await openStoryLogEntry(page, deviceName, VETH_SEQUENCE);
    await playToPanel(page, deviceName, VETH_SEQUENCE, VETH_INDEX);
    await expectAttr(page, '#story-dialog', 'shape', 'jagged', 0);
    await expectAttr(page, '#story-dialog', 'glitch', '1', 0);
    out.files.push(await shoot(page, join(dir, '10d-story-veth.png')));
    out.layout.push(await storyDialogAudit(page, deviceName, 'story-veth'));
    await skipStory(page, deviceName);
  });
}

// Review Focus 1: the longest line on a 200 %-zoomed 1280x720 laptop (640x360 CSS px,
// compact, mouse), with Skip and Next visible and >= 44 px.
function captureZoomedStory(browser, base, deviceName, dir) {
  return screensRun(browser, deviceName, 'story-zoomed', { contextOptions: ZOOMED_LAPTOP }, async (page, out) => {
    await seedSave(page, GALLERY_SAVE);
    await page.goto(base + '/');
    await page.locator('#title-screen').waitFor({ state: 'visible', timeout: 30_000 });
    await tapCentre(page, deviceName);
    await page.locator(MAP_READY).waitFor({ timeout: 10_000 });
    const longest = await longestLine(page, deviceName, 'story-longest-640', join(dir, '10f-story-longest-640.png'));
    out.files.push(...longest.files);
    out.layout.push(...longest.layout);
  });
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
  const box = await page.locator(GAME_CANVAS).boundingBox();
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
// steps 8-18 per docs/superpowers/specs/2026-10-23-radial-menus-design.md; step 2 per
// docs/superpowers/specs/2026-10-23-title-world-map-design.md, which renumbered 2-17 to 3-18).
// Each performs the row's action and asserts its condition; a throw fails the step.
const FLOW_ACTIONS = {
  async boot(ctx) {
    const { page, base, hasTouch } = ctx;
    await page.goto(base + '/');
    // Every launch shows the title first; the intro dialog waits for the map.
    await expectVisible(page, '#title-screen', true, 30_000);
    await expectVisible(page, '#story-dialog', false);
    ctx.pointerFine = await page.evaluate(q => matchMedia(q).matches, POINTER_FINE_QUERY);
    if (ctx.pointerFine !== !hasTouch) throw new Error(`pointer fine=${ctx.pointerFine}, expected ${!hasTouch}`);
  },
  async title({ page, deviceName }) {
    await tapCentre(page, deviceName);
    await expectVisible(page, '#title-screen', false);
    await expectVisible(page, '#map-select');
    // A fresh run: campaign_intro plays over the map.
    await expectVisible(page, '#story-dialog');
  },
  async 'skip-story'({ page, deviceName }) {
    // The map's entry guard eats taps until it ends, so this wait must come first.
    await page.locator(MAP_READY).waitFor({ timeout: STEP_TIMEOUT });
    // Spec 8.2: a tap finishes the line, a tap past the guard advances, then Skip.
    // The finishing tap is the first action: the line is typing while anything runs.
    await finishLine(page, deviceName);
    await expectAttr(page, '#story-dialog', 'index', '0', 0);
    // Measured at rest: the tap now lands during the slam, which moves the caption.
    await storySettled(page);
    const layout = [await audit(page, deviceName, 'flow-story', STORY_TARGETS), await storyDialogAudit(page, deviceName, 'flow-story-layout')];
    const problems = layout.flatMap(l => l.problems);
    if (problems.length) throw new Error(problems.join('; '));
    await nextPanel(page, deviceName);
    await tap(page, deviceName, '#story-dialog-skip');
    await expectVisible(page, '#story-dialog', false);
    await expectVisible(page, '#map-select');
    await pastCloseGuard(page);
  },
  async 'select-map'({ page, deviceName }) {
    const node = '.ow-node[data-map-id="0"]';
    await tap(page, deviceName, node);
    await until(() => hasClass(page, node, 'active'), Boolean, () => `${node} not .active`);
    await expectText(page, '#featured-name', MAPS[0].name);
    const { problems } = await audit(page, deviceName, 'flow-world-map', MAP_SELECT_TARGETS);
    if (problems.length) throw new Error(problems.join('; '));
  },
  async play({ page, deviceName, exp }) {
    // LAUNCH must come after the entry input guard, or the guard eats the tap.
    await page.locator(MAP_READY).waitFor({ timeout: STEP_TIMEOUT });
    await tap(page, deviceName, '#featured-play');
    await expectVisible(page, '#hud-layer');
    // The briefing types from the same create() that shows #hud-layer: its
    // finishing tap goes first, before the stat reads and this step's shot use up
    // the line. Step 06 then checks the briefing was expected and shoots it.
    if (await visible(page, '#story-dialog')) await finishLine(page, deviceName);
    await expectText(page, '#stat-gold', exp.startGold);
    await expectText(page, '#stat-wave', exp.waveBefore);
    await expectText(page, '#wave-btn', '▶ Send Wave 1');
  },
  async briefing({ page, deviceName, exp }, step, dir) {
    // The briefing is created in the same create() that shows #hud-layer, so its
    // state is already settled once step 05 passed: no wait-for-appearance race.
    const shown = await visible(page, '#story-dialog');
    if (shown !== exp.expectBriefing) throw new Error(`briefing ${shown ? 'shown' : 'missing'}, expected ${exp.expectBriefing ? 'shown' : 'none'}`);
    if (!shown) return { file: null };
    // Tap-to-finish already ran in step 05, as its first action after LAUNCH.
    await expectAttr(page, '#story-dialog', 'phase', 'complete', 0);
    await storySettled(page);
    const file = await shoot(page, join(dir, shotName(step)));
    await tap(page, deviceName, '#story-dialog-skip');
    await expectVisible(page, '#story-dialog', false);
    // Phaser reads DOM input on its next step: give a leaked tap two frames to act.
    await page.evaluate(() => new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res))));
    // The closing tap leaked nothing into the level: no wave sent, no pause.
    await expectText(page, '#wave-btn', '▶ Send Wave 1');
    if (await hasClass(page, '#paused-overlay', 'shown') || await visible(page, '#paused-overlay')) throw new Error('#paused-overlay shown after the briefing closed');
    await pastCloseGuard(page);
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
    const { problems } = await radialAudit(page, deviceName, 'flow-tower-ring');
    if (problems.length) throw new Error(problems.join('; '));
  },
  async 'upgrade-arm'(ctx, step, dir) {
    const { page, deviceName, exp } = ctx;
    await tap(page, deviceName, UPGRADE_ITEM);
    // Clock starts at the first tap: step 14 must land its second tap inside the window.
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
    const want = buildStates(exp.goldAfterUpgrade);
    // A short or empty radial would make the per-item checks below pass vacuously.
    if (r.items.length !== Object.keys(want).length) throw new Error(`${r.items.length} build items, expected ${Object.keys(want).length}`);
    const ready = r.items.filter(i => !i.ariaDisabled).map(i => i.id);
    if (ready.length) throw new Error(`not aria-disabled at ${exp.goldAfterUpgrade}g: ${ready.join(', ')}`);
    expectStates(r, want);
    await expectText(page, '#stat-gold', exp.goldAfterUpgrade);
  },
  async 'close-radial'({ page, deviceName }) {
    await tap(page, deviceName, '#radial-hub');
    await expectVisible(page, '#radial', false);
  },
  async 'send-wave'({ page, deviceName, exp }) {
    // A wave that started on its own (auto-send is ON in a first run) would pass the
    // checks below without the tap; step 05's check is ten steps back.
    await expectText(page, '#stat-wave', exp.waveBefore);
    await tap(page, deviceName, '#wave-btn');
    await expectText(page, '#stat-wave', exp.waveAfter);
    // Mirror of step 18 under the same conditions: proves the map sample can differ,
    // so step 18's byte-identical check is meaningful.
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
