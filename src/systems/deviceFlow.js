import { railMetricsFor, WORLD_WIDTH, WORLD_HEIGHT, TOUCH_HUD_CELL } from '../data/layout.js';
import { RING_ANGLES, RADIAL_MARGIN } from '../data/radial.js';
import { TOWER_DEFS } from '../data/towers.js';
import { STORY_SEQUENCES, briefKey } from '../data/story.js';
import { MAPS } from '../data/maps.js';
import { sellRefund } from '../data/towers.js';
import { unlockMapNumber } from './radialItems.js';
import { radialMetrics, layoutRadial } from './radialLayout.js';

// Pure logic for the Playwright device-matrix harness (scripts/capture.mjs).
// Kept free of Playwright/Phaser so expectations derive from the data tables
// and can be unit-tested.

export const FLOW_STEPS = [
  { n: 1, id: 'boot', touchOnly: false },
  // Its own step, not folded into boot, so a failure says which half broke.
  { n: 2, id: 'title', touchOnly: false },
  { n: 3, id: 'skip-story', touchOnly: false },
  { n: 4, id: 'select-map', touchOnly: false },
  { n: 5, id: 'play', touchOnly: false },
  { n: 6, id: 'briefing', touchOnly: false },
  { n: 7, id: 'level-ready', touchOnly: false },
  { n: 8, id: 'arm-tower', touchOnly: false },
  { n: 9, id: 'cancel-arm', touchOnly: false },
  { n: 10, id: 'open-build-radial', touchOnly: false },
  { n: 11, id: 'radial-build', touchOnly: false },
  { n: 12, id: 'open-ring', touchOnly: false },
  // Touch needs a separate arm tap before the upgrade; a mouse click doesn't.
  { n: 13, id: 'upgrade-arm', touchOnly: true },
  { n: 14, id: 'upgrade', touchOnly: false },
  { n: 15, id: 'radial-unaffordable', touchOnly: false },
  { n: 16, id: 'close-radial', touchOnly: false },
  { n: 17, id: 'send-wave', touchOnly: false },
  { n: 18, id: 'pause', touchOnly: false },
];

export function stepsFor({ hasTouch }) {
  return FLOW_STEPS.filter((s) => hasTouch || !s.touchOnly);
}

export function shotName(step) {
  return `${String(step.n).padStart(2, '0')}-${step.id}.png`;
}

// Same math as PathManager.buildZones (slot * world size), without constructing
// a PathManager; the test pins the two together.
export function padWorldPoint(map, i) {
  const [nx, ny] = map.towerSlots[i];
  return { x: nx * WORLD_WIDTH, y: ny * WORLD_HEIGHT };
}

// Pads ordered by distance from the board centre, furthest from every canvas
// edge first, so they are never under a rail or HUD overlay on any device.
// The sort is stable, so ties keep the lowest index first.
function padsByCentrality(map) {
  return map.towerSlots
    .map(([nx, ny], i) => ({ i, d: Math.hypot(nx - 0.5, ny - 0.5) }))
    .sort((a, b) => a.d - b.d)
    .map(({ i }) => i);
}

export function pickPads(map, n) {
  return padsByCentrality(map).slice(0, n);
}

export function pickPad(map) {
  return pickPads(map, 1)[0];
}

// The coarse cell gives the larger ring, so a pad clear of it is clear on every device.
const COARSE_RING = radialMetrics(TOUCH_HUD_CELL);
const MAP_BOUNDS = { left: 0, top: 0, width: WORLD_WIDTH, height: WORLD_HEIGHT };

// Most central pad entirely outside the tower ring open on `ringPad` (its
// clamped centre + footprint radius), so a tap there reaches the canvas instead
// of a ring face, whatever the face shape's hit area. Null when none clears.
export function padClearOfRing(map, ringPad) {
  const { centre } = layoutRadial({
    anchor: padWorldPoint(map, ringPad), angles: [RING_ANGLES.upgrade, RING_ANGLES.sell],
    metrics: COARSE_RING, bounds: MAP_BOUNDS, margin: RADIAL_MARGIN,
  });
  const clear = (i) => {
    const p = padWorldPoint(map, i);
    return Math.hypot(p.x - centre.x, p.y - centre.y) > COARSE_RING.footprint;
  };
  return padsByCentrality(map).find((i) => i !== ringPad && clear(i)) ?? null;
}

// Towers are placed on the pad's exact world point (window.__capture.towers),
// so a sub-pixel match means occupied.
const PAD_MATCH_PX = 1;

// Most central pad with no tower on it, or null when every pad is built on.
export function freePad(map, towers) {
  const taken = (p) => towers.some((t) => Math.hypot(t.x - p.x, t.y - p.y) < PAD_MATCH_PX);
  return padsByCentrality(map).find((i) => !taken(padWorldPoint(map, i))) ?? null;
}

// What the build radial's items should show at `gold`, keyed by item data-id.
// A fresh first run has no meta discount, so the list price is the charge;
// gold === cost is affordable.
export function buildStates(gold) {
  return Object.fromEntries(Object.entries(TOWER_DEFS)
    .map(([type, def]) => [`build:${type}`, gold >= def.cost ? 'ready' : 'disabled']));
}

export function worldToPagePoint({ x, y }, box, { pointerFine }) {
  const { railWidth, canvasWidth } = railMetricsFor({ pointerFine });
  return {
    x: box.x + ((x + railWidth) * box.width) / canvasWidth,
    y: box.y + (y * box.height) / WORLD_HEIGHT,
  };
}

export function flowExpectations({ map, towerType }) {
  const def = TOWER_DEFS[towerType];
  const startGold = map.startGold;
  const goldAfterBuild = startGold - def.cost;
  if (goldAfterBuild < 0) throw new Error(`${map.name}: cannot afford ${towerType} (${def.cost} > ${startGold})`);
  if (map.maxTierAllowed < 2) throw new Error(`${map.name}: maxTierAllowed ${map.maxTierAllowed} forbids a tier-2 upgrade`);
  const goldAfterUpgrade = goldAfterBuild - def.tier2.cost;
  if (goldAfterUpgrade < 0) throw new Error(`${map.name}: cannot afford ${towerType} tier-2 upgrade (${def.tier2.cost} > ${goldAfterBuild})`);
  // Step 15 asserts every build item is disabled after the upgrade.
  const minCost = Math.min(...Object.values(TOWER_DEFS).map((d) => d.cost));
  const allUnaffordableAfterUpgrade = goldAfterUpgrade < minCost;
  if (!allUnaffordableAfterUpgrade) throw new Error(`${map.name}: ${goldAfterUpgrade}g after the upgrade leaves a tower affordable; step 15 needs every build item unaffordable`);
  // Step 15 retargets the open ring onto a second pad that no ring face covers.
  const pad = pickPad(map);
  const pad2 = padClearOfRing(map, pad);
  if (pad2 === null) throw new Error(`${map.name}: no pad clear of the ring on pad ${pad}`);
  return {
    startGold,
    goldAfterBuild,
    goldAfterUpgrade,
    // Matches GameScene's `${currentWave}/${waveCount}` stat-wave text.
    waveBefore: `0/${map.waveCount}`,
    waveAfter: `1/${map.waveCount}`,
    lockedAfterUpgrade: map.maxTierAllowed < 3,
    expectBriefing: STORY_SEQUENCES[briefKey(map.storyKey)]?.panels?.length > 0,
    pad: padWorldPoint(map, pad),
    pad2: padWorldPoint(map, pad2),
    buildStatesStart: buildStates(startGold),
    allUnaffordableAfterUpgrade,
    // Ring faces as rendered by radialItems: hub tier line, sell caption, lock caption.
    hubBefore: 'T1',
    hubAfter: 'T2',
    sellLabelAfterBuild: `+${sellRefund(def.cost)}g`,
    lockedLabel: `Map ${unlockMapNumber(3, MAPS)}`,
  };
}

// A device passes only if every step passed and no problems were recorded.
// Steps become 'skip' only after a failure, so skips alone never mean success;
// an empty or partly-skipped run must not read as PASS.
export function summarizeFlow(deviceResults) {
  if (deviceResults.length === 0) return { lines: ['FAIL no devices ran'], failedDevices: 1 };
  const lines = [];
  let failedDevices = 0;
  for (const { device, steps, problems = [] } of deviceResults) {
    const passed = steps.filter((s) => s.status === 'pass').length;
    const failed = steps.find((s) => s.status === 'fail');
    if (steps.length > 0 && passed === steps.length && problems.length === 0) {
      lines.push(`PASS ${device} ${passed}/${steps.length}`);
    } else {
      failedDevices++;
      if (failed) lines.push(`FAIL ${device} at ${failed.n} ${failed.id}: ${failed.detail}`);
      else if (steps.length === 0) lines.push(`FAIL ${device}: no steps ran`);
      else if (passed < steps.length) lines.push(`FAIL ${device}: ${steps.length - passed} step(s) not passed`);
      else lines.push(`FAIL ${device}: ${problems.join('; ')}`);
    }
    for (const p of problems) lines.push(`  ${p}`);
  }
  return { lines, failedDevices };
}
