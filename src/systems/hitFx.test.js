import { describe, it, expect } from 'vitest';
import { ENEMY_DEFS } from '../data/enemies.js';
import { FX_TEXTURES } from './fxTextures.js';
import { IMPACT_FX, DEATH_CLASS, DEATH_FX, HIT_SQUASH, HIT_STOP, STATUS_FX } from '../data/fx.js';
import { squashScale, deathClass, isHeavyHit, canHitStop, statusTint } from './hitFx.js';

const TEXTURE_KEYS = new Set(FX_TEXTURES.map((t) => t.key));
const layers = (v) => (Array.isArray(v) ? v : [v]);
const CLASSES = ['small', 'large', 'boss'];

describe('data contracts', () => {
  it('every enemy type has a valid DEATH_CLASS', () => {
    for (const type of Object.keys(ENEMY_DEFS)) {
      expect(CLASSES, type).toContain(DEATH_CLASS[type]);
    }
  });
  it('DEATH_CLASS has no entries for unknown enemy types', () => {
    for (const type of Object.keys(DEATH_CLASS)) expect(ENEMY_DEFS[type], type).toBeDefined();
  });
  it('every class has DEATH_FX steps naming existing IMPACT_FX keys', () => {
    for (const cls of CLASSES) {
      expect(DEATH_FX[cls].length, cls).toBeGreaterThan(0);
      for (const step of DEATH_FX[cls]) {
        expect(IMPACT_FX[step.effect], `${cls}:${step.effect}`).toBeDefined();
        expect(step.delay).toBeGreaterThanOrEqual(0);
      }
    }
  });
  it('every IMPACT_FX layer uses a registered texture', () => {
    for (const [key, v] of Object.entries(IMPACT_FX)) {
      for (const l of layers(v)) expect(TEXTURE_KEYS.has(l.texture), key).toBe(true);
    }
  });
  it('boss sequence runs about 0.8s before the finale', () => {
    const delays = DEATH_FX.boss.map((s) => s.delay);
    expect(Math.max(...delays)).toBeGreaterThanOrEqual(800);
  });
});

describe('squashScale', () => {
  it('is identity at/below 0 and at/after duration', () => {
    for (const t of [-1, 0, HIT_SQUASH.duration, HIT_SQUASH.duration + 1]) {
      const s = squashScale(t, HIT_SQUASH);
      expect(s.x).toBe(1);
      expect(s.y).toBe(1);
    }
  });
  it('starts near widened/flattened and returns monotonically to 1', () => {
    const { duration, amount } = HIT_SQUASH;
    const first = squashScale(0.0001, HIT_SQUASH);
    expect(first.x).toBeCloseTo(1 + amount, 2);
    expect(first.y).toBeCloseTo(1 - amount, 2);
    let px = Infinity;
    let py = -Infinity;
    for (let i = 1; i < 20; i++) {
      const s = squashScale((duration * i) / 20, HIT_SQUASH);
      expect(s.x).toBeLessThanOrEqual(px);
      expect(s.y).toBeGreaterThanOrEqual(py);
      px = s.x;
      py = s.y;
    }
    expect(px).toBeGreaterThanOrEqual(1);
    expect(py).toBeLessThanOrEqual(1);
  });
  it('reuses one result object (no per-call allocation)', () => {
    expect(squashScale(0.05, HIT_SQUASH)).toBe(squashScale(0.06, HIT_SQUASH));
  });
});

describe('deathClass', () => {
  it('maps known types and defaults unknown to small', () => {
    expect(deathClass('titan')).toBe('boss');
    expect(deathClass('brute')).toBe('large');
    expect(deathClass('drone')).toBe('small');
    expect(deathClass('nope')).toBe('small');
    expect(deathClass(undefined)).toBe('small');
  });
});

describe('isHeavyHit', () => {
  const f = HIT_STOP.heavyFraction;
  const typeOf = (cls) => Object.keys(DEATH_CLASS).find((t) => DEATH_CLASS[t] === cls);
  const [small, large, boss] = ['small', 'large', 'boss'].map(typeOf);
  it('large/boss damage threshold is inclusive', () => {
    for (const t of [large, boss]) {
      expect(isHeavyHit(100 * f, 100, false, t)).toBe(true);
      expect(isHeavyHit(100 * f - 1, 100, false, t)).toBe(false);
    }
  });
  it('kills of large/boss always qualify', () => {
    for (const t of [large, boss]) {
      expect(isHeavyHit(1, 1000, true, t)).toBe(true);
      expect(isHeavyHit(1, 1000, false, t)).toBe(false);
    }
  });
  it('small enemies are never heavy, even for a huge hit or a kill; unknown types count as small', () => {
    expect(isHeavyHit(1000, 100, false, small)).toBe(false);
    expect(isHeavyHit(1000, 100, true, small)).toBe(false);
    expect(isHeavyHit(1000, 100, true, 'mystery')).toBe(false);
  });
  it('non-positive maxHp is never heavy', () => {
    expect(isHeavyHit(50, 0, false, large)).toBe(false);
    expect(isHeavyHit(50, -5, true, boss)).toBe(false);
  });
});

describe('canHitStop', () => {
  it('allows at exactly the cooldown, blocks just under', () => {
    expect(canHitStop(HIT_STOP.cooldown, false, false)).toBe(true);
    expect(canHitStop(HIT_STOP.cooldown - 0.001, false, false)).toBe(false);
  });
  it('blocks when paused or reduced motion', () => {
    expect(canHitStop(HIT_STOP.cooldown, true, false)).toBe(false);
    expect(canHitStop(HIT_STOP.cooldown, false, true)).toBe(false);
  });
});

describe('statusTint', () => {
  const none = { slow: { active: false }, stun: { active: false }, burn: { active: false } };
  it('null with nothing active', () => {
    expect(statusTint(none)).toBeNull();
  });
  it('picks stun > burn > slow', () => {
    const on = (...ks) => {
      const o = { slow: { active: false }, stun: { active: false }, burn: { active: false } };
      for (const k of ks) o[k] = { active: true };
      return o;
    };
    expect(statusTint(on('slow'))).toBe(STATUS_FX.slow.tint);
    expect(statusTint(on('slow', 'burn'))).toBe(STATUS_FX.burn.tint);
    expect(statusTint(on('slow', 'burn', 'stun'))).toBe(STATUS_FX.stun.color);
  });
});
