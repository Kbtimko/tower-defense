import { describe, it, expect } from 'vitest';
import { TOWER_DEFS } from '../data/towers.js';
import { FX_TEXTURES } from './fxTextures.js';
import {
  PROJECTILE_FX, PROJECTILE_SHAPES, TRAIL_FX, MUZZLE_FX, IMPACT_FX, SOLDIER_MUZZLE,
} from '../data/fx.js';
import { projectileFx, arcOffset } from './fxResolve.js';

const TEXTURE_KEYS = new Set(FX_TEXTURES.map((t) => t.key));
const SHAPES = new Set(PROJECTILE_SHAPES);
const isColor = (c) => Number.isInteger(c) && c >= 0 && c <= 0xffffff;
const layers = (v) => (Array.isArray(v) ? v : [v]);

// Every partial/base definition that can name an effect table key.
function allDefs() {
  const out = [];
  for (const base of Object.values(PROJECTILE_FX)) {
    out.push(base);
    for (const o of Object.values(base.tiers ?? {})) out.push(o);
    for (const o of Object.values(base.branches ?? {})) out.push(o);
  }
  return out;
}

describe('PROJECTILE_FX contract', () => {
  it('has an entry for every tower type plus sentry', () => {
    for (const type of Object.keys(TOWER_DEFS)) expect(PROJECTILE_FX[type]).toBeDefined();
    expect(PROJECTILE_FX.sentry).toBeDefined();
  });

  it('references only trail/muzzle/impact keys that exist', () => {
    for (const d of allDefs()) {
      if (d.trail !== undefined) expect(TRAIL_FX).toHaveProperty(d.trail);
      if (d.muzzle !== undefined) expect(MUZZLE_FX).toHaveProperty(d.muzzle);
      if (d.impact !== undefined) expect(IMPACT_FX).toHaveProperty(d.impact);
    }
    expect(MUZZLE_FX).toHaveProperty(SOLDIER_MUZZLE);
  });

  it('uses allowed shapes and integer colours', () => {
    for (const d of allDefs()) {
      if (d.shape !== undefined) expect(SHAPES.has(d.shape)).toBe(true);
      if (d.color !== undefined) expect(isColor(d.color)).toBe(true);
    }
  });

  it('every effect texture is a registered FX texture and tints are colours', () => {
    const effects = [
      ...Object.values(TRAIL_FX), ...Object.values(MUZZLE_FX),
      ...Object.values(IMPACT_FX).flatMap(layers),
    ];
    for (const e of effects) {
      if (e.texture === undefined) continue; // the 'none' trail has no texture
      expect(TEXTURE_KEYS.has(e.texture)).toBe(true);
      expect(isColor(e.tint)).toBe(true);
    }
  });

  it('explosion layers smoke and ember', () => {
    const keys = layers(IMPACT_FX.explosion).map((e) => e.texture);
    expect(keys).toContain('fx-smoke');
    expect(keys).toContain('fx-ember');
  });
});

describe('projectileFx', () => {
  it('cannon resolves an arc and shadow', () => {
    const fx = projectileFx('cannon');
    expect(fx.arc).toBeGreaterThan(0);
    expect(fx.shadow).toBe(true);
  });

  it('unknown type falls back to sentry', () => {
    expect(projectileFx('nope')).toEqual(projectileFx('sentry'));
  });

  it('merges tiers cumulatively with later tiers winning, branch only at tier 4', () => {
    const base = { shape: 'bolt', color: 1, size: 1, trail: 'none', muzzle: 'small', impact: 'spark' };
    const saved = PROJECTILE_FX.sentry;
    PROJECTILE_FX.sentry = {
      ...base,
      tiers: { 2: { size: 2, color: 2 }, 3: { size: 3 }, 4: { color: 4 } },
      branches: { A: { color: 9 } },
    };
    try {
      expect(projectileFx('sentry', 1, 'A')).toMatchObject({ size: 1, color: 1 });
      expect(projectileFx('sentry', 2)).toMatchObject({ size: 2, color: 2 });
      expect(projectileFx('sentry', 3, 'A')).toMatchObject({ size: 3, color: 2 });
      expect(projectileFx('sentry', 4)).toMatchObject({ size: 3, color: 4 });
      expect(projectileFx('sentry', 4, 'A').color).toBe(9);
      expect(projectileFx('sentry', 4, 'B').color).toBe(4);
      expect(PROJECTILE_FX.sentry.size).toBe(1);
    } finally {
      PROJECTILE_FX.sentry = saved;
    }
  });

  it('real data: cannon branch A overrides, base untouched', () => {
    const before = JSON.stringify(PROJECTILE_FX.cannon);
    expect(projectileFx('cannon', 4, 'A')).toMatchObject({ size: 5, arc: 48, shadow: true });
    expect(projectileFx('cannon', 3, 'A').arc).toBe(PROJECTILE_FX.cannon.arc);
    expect(projectileFx('mage', 4, 'A').color).not.toBe(projectileFx('mage', 4, 'B').color);
    expect(JSON.stringify(PROJECTILE_FX.cannon)).toBe(before);
  });
});

describe('arcOffset', () => {
  it('is 0 at the ends and peak at the midpoint', () => {
    expect(arcOffset(0, 36)).toBe(0);
    expect(arcOffset(1, 36)).toBe(0);
    expect(arcOffset(0.5, 36)).toBe(36);
  });
  it('clamps progress outside [0,1] and never goes negative', () => {
    expect(arcOffset(-0.5, 36)).toBe(0);
    expect(arcOffset(1.5, 36)).toBe(0);
  });
});
