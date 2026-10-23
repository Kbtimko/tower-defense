import { describe, it, expect, vi } from 'vitest';

vi.mock('phaser', () => ({ default: {} }));

import {
  FLOW_STEPS, stepsFor, shotName, pickPad, pickPads, padClearOfRing, freePad, buildStates, padWorldPoint,
  worldToPagePoint, flowExpectations, summarizeFlow,
} from './deviceFlow.js';
import { PathManager } from './PathManager.js';
import { MAPS } from '../data/maps.js';
import { TOWER_DEFS } from '../data/towers.js';
import { STORY_SEQUENCES, briefKey } from '../data/story.js';
import { WORLD_WIDTH, WORLD_HEIGHT, TOUCH_HUD_CELL, FINE_HUD_CELL } from '../data/layout.js';
import { RING_ANGLES, RADIAL_MARGIN } from '../data/radial.js';
import { radialMetrics, layoutRadial } from './radialLayout.js';
import { sellRefund } from './TowerPlacementManager.js';
import { unlockMapNumber } from './radialItems.js';
import { defaultCaptureBuild } from './debugCapture.js';

describe('flowExpectations', () => {
  const map = MAPS[0];
  const e = flowExpectations({ map, towerType: 'archer' });
  it('derives gold from the data tables', () => {
    expect(e.startGold).toBe(map.startGold);
    expect(e.goldAfterBuild).toBe(map.startGold - TOWER_DEFS.archer.cost);
    expect(e.goldAfterUpgrade).toBe(e.goldAfterBuild - TOWER_DEFS.archer.tier2.cost);
  });
  it('derives briefing, wave text, lock and pad', () => {
    expect(e.expectBriefing).toBe(STORY_SEQUENCES[briefKey(map.storyKey)]?.panels?.length > 0);
    expect(e.waveBefore).toBe(`0/${map.waveCount}`);
    expect(e.waveAfter).toBe(`1/${map.waveCount}`);
    expect(e.lockedAfterUpgrade).toBe(map.maxTierAllowed < 3);
    expect(e.pad).toEqual(padWorldPoint(map, pickPad(map)));
  });
  it('throws when the tower is unaffordable', () => {
    expect(() => flowExpectations({ map: { ...map, startGold: 10 }, towerType: 'archer' })).toThrow(/afford/);
  });
  it('throws when the map forbids tier 2', () => {
    expect(() => flowExpectations({ map: { ...map, maxTierAllowed: 1 }, towerType: 'archer' })).toThrow(/tier/);
  });
  it('derives the radial expectations from the data tables', () => {
    expect(e.pad2).toEqual(padWorldPoint(map, padClearOfRing(map, pickPad(map))));
    expect(e.buildStatesStart).toEqual(buildStates(map.startGold));
    expect(e.allUnaffordableAfterUpgrade).toBe(true);
    expect(e.sellLabelAfterBuild).toBe(`+${sellRefund(TOWER_DEFS.archer.cost)}g`);
    expect(e.hubBefore).toBe('T1');
    expect(e.hubAfter).toBe('T2');
    expect(e.lockedLabel).toBe(`Map ${unlockMapNumber(3, MAPS)}`);
  });
  it('pins map 0 to the spec walk-through: 130 -> 70 -> 20, +36g, Map 3', () => {
    expect([e.startGold, e.goldAfterBuild, e.goldAfterUpgrade]).toEqual([130, 70, 20]);
    expect(e.sellLabelAfterBuild).toBe('+36g');
    expect(e.lockedLabel).toBe('Map 3');
    expect(e.lockedAfterUpgrade).toBe(true);
  });
  it('throws when something is still affordable after the upgrade', () => {
    expect(() => flowExpectations({ map: { ...map, startGold: 200 }, towerType: 'archer' })).toThrow(/unaffordable/);
  });
  it('throws when no pad clears the open ring', () => {
    expect(() => flowExpectations({ map: { ...map, towerSlots: [[0.5, 0.5]] }, towerType: 'archer' })).toThrow(/clear/);
    expect(() => flowExpectations({ map: { ...map, towerSlots: [[0.5, 0.5], [0.52, 0.5]] }, towerType: 'archer' })).toThrow(/clear/);
  });
});

describe('buildStates', () => {
  const costs = Object.values(TOWER_DEFS).map((d) => d.cost);
  it('keys every tower by its radial item id', () => {
    expect(Object.keys(buildStates(0))).toEqual(Object.keys(TOWER_DEFS).map((t) => `build:${t}`));
  });
  it('is all disabled below the cheapest cost and all ready at the dearest', () => {
    expect(Object.values(buildStates(Math.min(...costs) - 1)).every((s) => s === 'disabled')).toBe(true);
    expect(Object.values(buildStates(Math.max(...costs))).every((s) => s === 'ready')).toBe(true);
  });
  it('treats gold === cost as ready and one less as disabled', () => {
    const c = TOWER_DEFS.mage.cost;
    expect(buildStates(c)['build:mage']).toBe('ready');
    expect(buildStates(c - 1)['build:mage']).toBe('disabled');
  });
});

describe('freePad', () => {
  const map = { towerSlots: [[0.1, 0.1], [0.5, 0.5], [0.6, 0.5], [0.9, 0.9]] };
  const at = (i) => padWorldPoint(map, i);
  it('returns the most central pad when nothing is built', () => {
    expect(freePad(map, [])).toBe(1);
  });
  it('skips pads under a tower', () => {
    expect(freePad(map, [{ type: 'archer', ...at(1) }])).toBe(2);
    expect(freePad(map, [at(1), at(2)])).toBe(0);
  });
  it('returns null when every pad is built on', () => {
    expect(freePad(map, map.towerSlots.map((_, i) => at(i)))).toBeNull();
  });
  it('finds a free pad under the default capture build on every map', () => {
    for (const m of MAPS) {
      const slots = [...defaultCaptureBuild(m.towerSlots.length).matchAll(/@(\d+)/g)].map((x) => Number(x[1]));
      const towers = slots.map((i) => padWorldPoint(m, i));
      expect(freePad(m, towers)).not.toBeNull();
    }
  });
});

describe('padWorldPoint', () => {
  it('matches PathManager build zones for every slot', () => {
    const map = MAPS[0];
    const zones = new PathManager(map.waypoints, map.towerSlots, WORLD_WIDTH, WORLD_HEIGHT).buildZones;
    map.towerSlots.forEach((_, i) => {
      expect(padWorldPoint(map, i)).toEqual({ x: zones[i].cx, y: zones[i].cy });
    });
  });
});

describe('pickPads', () => {
  it('orders pads by distance from the centre, ties to the lowest index', () => {
    expect(pickPads({ towerSlots: [[0.1, 0.1], [0.6, 0.5], [0.5, 0.5], [0.4, 0.5]] }, 3)).toEqual([2, 1, 3]);
  });
  it('agrees with pickPad on the first pad for every map', () => {
    for (const m of MAPS) expect(pickPads(m, 2)[0]).toBe(pickPad(m));
  });
  it('returns distinct in-range indices', () => {
    const [a, b] = pickPads(MAPS[0], 2);
    expect(a).not.toBe(b);
    expect(b).toBeLessThan(MAPS[0].towerSlots.length);
  });
});

describe('padClearOfRing', () => {
  const COARSE = radialMetrics(TOUCH_HUD_CELL);
  const ringCentre = (m, i) => layoutRadial({
    anchor: padWorldPoint(m, i), angles: [RING_ANGLES.upgrade, RING_ANGLES.sell], metrics: COARSE,
    bounds: { left: 0, top: 0, width: WORLD_WIDTH, height: WORLD_HEIGHT }, margin: RADIAL_MARGIN,
  }).centre;
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  it('skips central pads under the coarse ring footprint', () => {
    // 0 is the ring pad; 1 is next-most central but 64 px away (inside the 152-px footprint).
    const m = { towerSlots: [[0.5, 0.5], [0.55, 0.5], [0.9, 0.9], [0.7, 0.5]] };
    expect(padClearOfRing(m, 0)).toBe(3);
  });
  it('returns null when every other pad is under the ring', () => {
    expect(padClearOfRing({ towerSlots: [[0.5, 0.5], [0.52, 0.5]] }, 0)).toBeNull();
  });
  it('picks a pad outside the coarse footprint, measured from the clamped ring centre, on map 0', () => {
    const m = MAPS[0];
    const ring = pickPad(m);
    const i = padClearOfRing(m, ring);
    expect(i).not.toBe(ring);
    expect(dist(padWorldPoint(m, i), ringCentre(m, ring))).toBeGreaterThan(COARSE.footprint);
    // The coarse ring is the larger one, so it also clears the fine ring.
    expect(COARSE.footprint).toBeGreaterThan(radialMetrics(FINE_HUD_CELL).footprint);
  });
});

describe('pickPad', () => {
  it('returns an in-range index for real maps', () => {
    for (const m of MAPS) {
      const i = pickPad(m);
      expect(i).toBeGreaterThanOrEqual(0);
      expect(i).toBeLessThan(m.towerSlots.length);
    }
  });
  it('picks the slot nearest the board centre', () => {
    expect(pickPad({ towerSlots: [[0.1, 0.1], [0.5, 0.5], [0.9, 0.9]] })).toBe(1);
  });
  it('breaks ties toward the lowest index', () => {
    expect(pickPad({ towerSlots: [[0.4, 0.5], [0.6, 0.5]] })).toBe(0);
  });
});

describe('worldToPagePoint', () => {
  it('offsets by the fine rail', () => {
    expect(worldToPagePoint({ x: 0, y: 0 }, { x: 0, y: 0, width: 1488, height: 720 }, { pointerFine: true }))
      .toEqual({ x: 104, y: 0 });
  });
  it('offsets by the coarse rail', () => {
    expect(worldToPagePoint({ x: 0, y: 0 }, { x: 0, y: 0, width: 1632, height: 720 }, { pointerFine: false }))
      .toEqual({ x: 176, y: 0 });
  });
  it('scales and offsets both axes', () => {
    const p = worldToPagePoint({ x: 100, y: 100 }, { x: 10, y: 20, width: 744, height: 360 }, { pointerFine: true });
    expect(p).toEqual({ x: 10 + (100 + 104) * 0.5, y: 20 + 50 });
  });
});

describe('stepsFor / shotName', () => {
  it('drops the touch-only step without touch', () => {
    const s = stepsFor({ hasTouch: false });
    expect(s).toHaveLength(16);
    expect(s.some((x) => x.id === 'upgrade-arm')).toBe(false);
  });
  it('keeps all 17 with touch', () => {
    expect(stepsFor({ hasTouch: true })).toHaveLength(17);
  });
  it('follows the spec step table 7-17', () => {
    expect(FLOW_STEPS.filter((x) => x.n >= 7).map((x) => `${x.n} ${x.id}`)).toEqual([
      '7 arm-tower', '8 cancel-arm', '9 open-build-radial', '10 radial-build', '11 open-ring',
      '12 upgrade-arm', '13 upgrade', '14 radial-unaffordable', '15 close-radial', '16 send-wave', '17 pause',
    ]);
    expect(FLOW_STEPS.filter((x) => x.touchOnly).map((x) => x.id)).toEqual(['upgrade-arm']);
  });
  it('has increasing n and unique ids', () => {
    FLOW_STEPS.forEach((s, i) => { if (i) expect(s.n).toBeGreaterThan(FLOW_STEPS[i - 1].n); });
    expect(new Set(FLOW_STEPS.map((s) => s.id)).size).toBe(FLOW_STEPS.length);
  });
  it('names shots with two-digit n', () => {
    expect(shotName({ n: 8, id: 'build' })).toBe('08-build.png');
  });
});

describe('summarizeFlow', () => {
  const pass = (n, id) => ({ n, id, status: 'pass', detail: '' });
  it('passes a clean device', () => {
    const r = summarizeFlow([{ device: 'desktop', steps: [pass(1, 'boot')], problems: [] }]);
    expect(r.failedDevices).toBe(0);
    expect(r.lines[0]).toBe('PASS desktop 1/1');
  });
  it('prints passed/total for a full device', () => {
    const steps = stepsFor({ hasTouch: false }).map((x) => pass(x.n, x.id));
    expect(summarizeFlow([{ device: 'desktop', steps, problems: [] }]).lines[0]).toBe('PASS desktop 16/16');
  });
  it('fails a device with no steps', () => {
    const r = summarizeFlow([{ device: 'd', steps: [], problems: [] }]);
    expect(r.failedDevices).toBe(1);
    expect(r.lines[0]).toBe('FAIL d: no steps ran');
  });
  it('fails a skip-only device', () => {
    const r = summarizeFlow([{ device: 'd', steps: [{ n: 1, id: 'boot', status: 'skip', detail: '' }], problems: [] }]);
    expect(r.failedDevices).toBe(1);
    expect(r.lines[0]).toMatch(/^FAIL d/);
  });
  it('fails pass-then-skip with no fail step', () => {
    const r = summarizeFlow([{ device: 'd', steps: [pass(1, 'boot'), { n: 2, id: 'skip-story', status: 'skip', detail: '' }], problems: [] }]);
    expect(r.failedDevices).toBe(1);
    expect(r.lines[0]).toBe('FAIL d: 1 step(s) not passed');
  });
  it('lists problems as indented lines after the device line', () => {
    const r = summarizeFlow([{ device: 'd', steps: [pass(1, 'boot')], problems: ['a', 'b'] }]);
    expect(r.lines).toEqual(['FAIL d: a; b', '  a', '  b']);
  });
  it('reports the failing step', () => {
    const r = summarizeFlow([{
      device: 'iphone',
      steps: [pass(10, 'upgrade-arm'), { n: 11, id: 'upgrade', status: 'fail', detail: 'gold 5' }, { n: 12, id: 'send-wave', status: 'skip', detail: '' }],
      problems: [],
    }]);
    expect(r.failedDevices).toBe(1);
    expect(r.lines[0]).toBe('FAIL iphone at 11 upgrade: gold 5');
  });
  it('fails a device with problems even if every step passed', () => {
    const r = summarizeFlow([{ device: 'pixel', steps: [pass(1, 'boot')], problems: ['console error'] }]);
    expect(r.failedDevices).toBe(1);
    expect(r.lines[0]).toMatch(/^FAIL pixel/);
    expect(r.lines[0]).toMatch(/console error/);
  });
  it('does not let skipped steps mask a failure or count as passes', () => {
    const r = summarizeFlow([{ device: 'd', steps: [pass(1, 'boot'), { n: 2, id: 'skip-story', status: 'fail', detail: 'x' }, { n: 3, id: 'select-map', status: 'skip', detail: '' }], problems: [] }]);
    expect(r.failedDevices).toBe(1);
    expect(r.lines[0]).toBe('FAIL d at 2 skip-story: x');
    expect(r.lines[0]).not.toMatch(/select-map/);
  });
  it('treats no results as failure', () => {
    expect(summarizeFlow([]).failedDevices).toBeGreaterThanOrEqual(1);
  });
});
