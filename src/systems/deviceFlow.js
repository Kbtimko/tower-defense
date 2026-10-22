import { railMetricsFor, WORLD_WIDTH, WORLD_HEIGHT } from '../data/layout.js';
import { TOWER_DEFS } from '../data/towers.js';
import { STORY_SEQUENCES, briefKey } from '../data/story.js';

// Pure logic for the Playwright device-matrix harness (scripts/capture.mjs).
// Kept free of Playwright/Phaser so expectations derive from the data tables
// and can be unit-tested.

export const FLOW_STEPS = [
  { n: 1, id: 'boot', touchOnly: false },
  { n: 2, id: 'skip-story', touchOnly: false },
  { n: 3, id: 'select-map', touchOnly: false },
  { n: 4, id: 'play', touchOnly: false },
  { n: 5, id: 'briefing', touchOnly: false },
  { n: 6, id: 'level-ready', touchOnly: false },
  { n: 7, id: 'arm-tower', touchOnly: false },
  { n: 8, id: 'build', touchOnly: false },
  { n: 9, id: 'open-panel', touchOnly: false },
  // Touch needs a separate arm tap before the upgrade; a mouse click doesn't.
  { n: 10, id: 'upgrade-arm', touchOnly: true },
  { n: 11, id: 'upgrade', touchOnly: false },
  { n: 12, id: 'send-wave', touchOnly: false },
  { n: 13, id: 'pause', touchOnly: false },
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

// Most central pad: furthest from every canvas edge, so it is never under a
// rail or HUD overlay on any device. Strict < keeps the lowest index on ties.
export function pickPad(map) {
  let best = 0;
  let bestDist = Infinity;
  map.towerSlots.forEach(([nx, ny], i) => {
    const d = Math.hypot(nx - 0.5, ny - 0.5);
    if (d < bestDist) { best = i; bestDist = d; }
  });
  return best;
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
  return {
    startGold,
    goldAfterBuild,
    goldAfterUpgrade,
    // Matches GameScene's `${currentWave}/${waveCount}` stat-wave text.
    waveBefore: `0/${map.waveCount}`,
    waveAfter: `1/${map.waveCount}`,
    lockedAfterUpgrade: map.maxTierAllowed < 3,
    expectBriefing: STORY_SEQUENCES[briefKey(map.storyKey)]?.panels?.length > 0,
    pad: padWorldPoint(map, pickPad(map)),
  };
}

// Skipped steps follow a failure, so only 'fail' steps and recorded problems
// fail a device; the first failure is the one worth reporting.
export function summarizeFlow(deviceResults) {
  if (deviceResults.length === 0) return { lines: ['FAIL no devices ran'], failedDevices: 1 };
  const lines = [];
  let failedDevices = 0;
  for (const { device, steps, problems } of deviceResults) {
    const failed = steps.find((s) => s.status === 'fail');
    if (failed) {
      failedDevices++;
      lines.push(`FAIL ${device} at ${failed.n} ${failed.id}: ${failed.detail}`);
    } else if (problems.length > 0) {
      failedDevices++;
      lines.push(`FAIL ${device}: ${problems.join('; ')}`);
    } else {
      lines.push(`PASS ${device}`);
    }
  }
  return { lines, failedDevices };
}
