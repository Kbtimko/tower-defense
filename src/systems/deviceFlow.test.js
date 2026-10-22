import { describe, it, expect, vi } from 'vitest';

vi.mock('phaser', () => ({ default: {} }));

import {
  FLOW_STEPS, stepsFor, shotName, pickPad, padWorldPoint,
  worldToPagePoint, flowExpectations, summarizeFlow,
} from './deviceFlow.js';
import { PathManager } from './PathManager.js';
import { MAPS } from '../data/maps.js';
import { TOWER_DEFS } from '../data/towers.js';
import { STORY_SEQUENCES, briefKey } from '../data/story.js';
import { WORLD_WIDTH, WORLD_HEIGHT } from '../data/layout.js';

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
    expect(s).toHaveLength(12);
    expect(s.some((x) => x.n === 10)).toBe(false);
  });
  it('keeps all 13 with touch', () => {
    expect(stepsFor({ hasTouch: true })).toHaveLength(13);
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
    expect(r.lines[0]).toMatch(/^PASS desktop/);
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
