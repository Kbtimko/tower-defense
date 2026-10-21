import { describe, it, expect } from 'vitest';
import { parseDebugParams, applyDebugBuild, defaultCaptureBuild } from './debugCapture.js';
import { MAPS } from '../data/maps.js';
import { MAP_WAVES } from '../data/waves.js';
import { TOWER_DEFS } from '../data/towers.js';
import { HERO_ORDER } from '../data/heroes.js';

const CTX = { maps: MAPS, waves: MAP_WAVES, towerTypes: Object.keys(TOWER_DEFS), heroes: HERO_ORDER };
const parse = (qs) => parseDebugParams(qs, CTX);

describe('parseDebugParams', () => {
  it('returns null unless debug=1 is present', () => {
    expect(parse('')).toBeNull();
    expect(parse('?map=3')).toBeNull();
    expect(parse('?debug=0&map=3')).toBeNull();
  });

  it('defaults to map 0, no wave, empty build, the first hero', () => {
    const p = parse('?debug=1');
    expect(p).toMatchObject({ mapId: 0, wave: null, build: [], heroId: HERO_ORDER[0] });
    expect(p.errors).toEqual([]);
  });

  it('clamps map and wave to the real data ranges', () => {
    const last = MAPS.length - 1;
    expect(parse('?debug=1&map=99').mapId).toBe(last);
    expect(parse('?debug=1&map=-4').mapId).toBe(0);
    expect(parse('?debug=1&map=abc').mapId).toBe(0);
    const waveCount = MAP_WAVES[3].length;
    expect(parse('?debug=1&map=3&wave=999').wave).toBe(waveCount);
    expect(parse('?debug=1&map=3&wave=0').wave).toBe(1);
    expect(parse('?debug=1&map=3&wave=2').wave).toBe(2);
  });

  it('keeps a known hero and falls back on an unknown one', () => {
    const other = HERO_ORDER[HERO_ORDER.length - 1];
    expect(parse(`?debug=1&hero=${other}`).heroId).toBe(other);
    const bad = parse('?debug=1&hero=nobody');
    expect(bad.heroId).toBe(HERO_ORDER[0]);
    expect(bad.errors).toHaveLength(1);
  });

  it('parses build entries type@slot[:tier[branch]]', () => {
    const p = parse('?debug=1&map=0&build=archer@0,cannon@2:3,mage@4:4b,ice@1:4A');
    expect(p.build).toEqual([
      { type: 'archer', slot: 0, tier: 1, branch: null },
      { type: 'cannon', slot: 2, tier: 3, branch: null },
      { type: 'mage',   slot: 4, tier: 4, branch: 'B' },
      { type: 'ice',    slot: 1, tier: 4, branch: 'A' },
    ]);
    expect(p.errors).toEqual([]);
  });

  it('gives a bare tier 4 the A branch', () => {
    expect(parse('?debug=1&build=sniper@0:4').build[0]).toMatchObject({ tier: 4, branch: 'A' });
  });

  it('skips and reports malformed, unknown, out-of-range and duplicate-slot entries', () => {
    const slots = MAPS[0].towerSlots.length;
    const p = parse(`?debug=1&map=0&build=archer@0,laser@1,cannon@${slots},mage@x,ice@2:7,sniper@0,,barracks@3:2`);
    expect(p.build).toEqual([
      { type: 'archer',   slot: 0, tier: 1, branch: null },
      { type: 'barracks', slot: 3, tier: 2, branch: null },
    ]);
    // laser, slot out of range, bad slot, bad tier, duplicate slot 0
    expect(p.errors).toHaveLength(5);
  });
});

describe('applyDebugBuild', () => {
  function fakes(startGold = 50) {
    const economy = { gold: startGold, spend(n) { if (this.gold < n) return false; this.gold -= n; return true; }, earn(n) { this.gold += n; } };
    const calls = [];
    const placementManager = {
      placeTower(slot, type) { if (!economy.spend(10)) return null; const t = { type, slot, level: 1 }; calls.push(['place', type, slot]); return t; },
      upgradeTower(t, tier, branch) { if (!economy.spend(10)) return false; t.level = tier; calls.push(['up', t.type, tier, branch]); return true; },
    };
    return { economy, placementManager, calls };
  }

  it('places and upgrades tier by tier, passing the branch only at tier 4', () => {
    const { economy, placementManager, calls } = fakes();
    const placed = [];
    applyDebugBuild([{ type: 'mage', slot: 4, tier: 4, branch: 'B' }], { economy, placementManager, onPlaced: (t) => placed.push(t) });
    expect(calls).toEqual([['place', 'mage', 4], ['up', 'mage', 2, null], ['up', 'mage', 3, null], ['up', 'mage', 4, 'B']]);
    expect(placed).toHaveLength(1);
    expect(placed[0].level).toBe(4);
  });

  it('builds for free: the starting gold is unchanged afterwards', () => {
    const { economy, placementManager } = fakes(50);
    applyDebugBuild([{ type: 'archer', slot: 0, tier: 3, branch: null }, { type: 'ice', slot: 1, tier: 1, branch: null }], { economy, placementManager });
    expect(economy.gold).toBe(50);
  });

  it('does nothing with an empty build', () => {
    const { economy, placementManager, calls } = fakes(50);
    expect(applyDebugBuild([], { economy, placementManager })).toEqual([]);
    expect(calls).toEqual([]);
    expect(economy.gold).toBe(50);
  });

  it('skips an entry whose slot is already taken', () => {
    const { economy, placementManager } = fakes();
    placementManager.placeTower = () => null;
    expect(applyDebugBuild([{ type: 'archer', slot: 0, tier: 2, branch: null }], { economy, placementManager })).toEqual([]);
  });
});

describe('defaultCaptureBuild', () => {
  it('spreads one of every tower type across distinct, in-range slots', () => {
    for (const map of MAPS) {
      const n = map.towerSlots.length;
      const qs = `?debug=1&map=${MAPS.indexOf(map)}&build=${defaultCaptureBuild(n)}`;
      const p = parse(qs);
      expect(p.errors).toEqual([]);
      expect(new Set(p.build.map(b => b.type))).toEqual(new Set(Object.keys(TOWER_DEFS)));
    }
  });

  it('drops entries when a map has fewer slots than tower types', () => {
    expect(defaultCaptureBuild(3).split(',')).toHaveLength(3);
    expect(defaultCaptureBuild(0)).toBe('');
  });
});
