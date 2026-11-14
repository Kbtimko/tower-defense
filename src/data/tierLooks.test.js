import { describe, it, expect } from 'vitest';
import { TOWER_DEFS } from './towers.js';
import { SPRITE_MANIFEST } from './sprites.js';
import {
  TIER_SCALE, TIER_CORE, TIER_EMBERS, TIER_RING, TIER_PIPS,
  SOLDIER_RECOLOR, SOLDIER_FALLBACK_BODY, towerAccent,
} from './tierLooks.js';

const unit = (v) => typeof v === 'number' && v >= 0 && v <= 1;

describe('tierLooks tunables', () => {
  it('tower and soldier scales rise t1 < t2 < t3 <= t4a === t4b', () => {
    for (const k of ['tower', 'soldier']) {
      const s = TIER_SCALE[k];
      expect(s.t1).toBe(1);
      expect(s.t1 < s.t2 && s.t2 < s.t3 && s.t3 <= s.t4a).toBe(true);
      expect(s.t4a).toBe(s.t4b);
    }
  });

  it('towerAccent covers every TOWER_DEFS type with a number', () => {
    for (const t of Object.keys(TOWER_DEFS)) expect(typeof towerAccent(t)).toBe('number');
  });

  it('fractions and alphas lie in [0,1]', () => {
    const vals = [
      TIER_EMBERS.stillRiseFrac, TIER_EMBERS.stillAlpha, TIER_EMBERS.fadeInFrac, TIER_EMBERS.startFrac,
      ...TIER_CORE.alpha, TIER_CORE.stillAlpha,
      TIER_RING.alpha, TIER_RING.breathe.alphaLow, TIER_RING.spin.duty,
    ];
    for (const v of vals) expect(unit(v)).toBe(true);
  });

  it('the pips sit inside their own ring front arc (R9)', () => {
    expect(TIER_RING.ry).toBeGreaterThan(TIER_PIPS.gapBelowFootPx + TIER_PIPS.radius);
  });

  it('has a fallback body for every recolour variant plus t1', () => {
    expect(Object.keys(SOLDIER_FALLBACK_BODY).sort()).toEqual(['t1', ...Object.keys(SOLDIER_RECOLOR)].sort());
  });

  // R24: derived from the manifest, not literals
  it('a soldier at every tier stays narrower and shorter than the smallest hero', () => {
    const sol = SPRITE_MANIFEST.find((e) => e.category === 'soldier' && e.type === 'default');
    const heroes = SPRITE_MANIFEST.filter((e) => e.category === 'hero');
    const minHeroW = Math.min(...heroes.map((h) => h.ground.width));
    const minHeroCell = Math.min(...heroes.map((h) => h.states.idle.frameHeight * h.scale));
    for (const s of Object.values(TIER_SCALE.soldier)) {
      expect(sol.ground.width * s).toBeLessThan(minHeroW);
      expect(sol.states.idle.frameHeight * sol.scale * s).toBeLessThan(minHeroCell);
    }
  });
});
