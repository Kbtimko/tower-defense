import { describe, it, expect } from 'vitest';
import { arcPoint, popScale, padGlowAlpha, cooldownFraction, waveBannerText, bossWarning } from './juiceMath.js';
import { DEATH_CLASS } from '../data/fx.js';
import { MAP_WAVES } from '../data/waves.js';
import { PAD_GLOW, BOSS_WARNING } from '../data/juice.js';

const isBoss = (g) => DEATH_CLASS[g.type] === 'boss';
const allWaves = Object.values(MAP_WAVES).flat();

describe('arcPoint', () => {
  const from = { x: 0, y: 100 }, to = { x: 100, y: 100 };
  it('hits endpoints', () => {
    const out = { x: 0, y: 0 };
    arcPoint(0, from, to, 40, out);
    expect(out).toEqual({ x: 0, y: 100 });
    arcPoint(1, from, to, 40, out);
    expect(out).toEqual({ x: 100, y: 100 });
  });
  it('peaks `height` px above the straight line at t=0.5 and returns out', () => {
    const out = { x: 0, y: 0 };
    expect(arcPoint(0.5, from, to, 40, out)).toBe(out);
    expect(out.x).toBeCloseTo(50);
    expect(out.y).toBeCloseTo(60);
  });
});

describe('popScale', () => {
  it('is exactly 1 outside [0, duration]', () => {
    expect(popScale(0, 0.3, 1.3)).toBe(1);
    expect(popScale(-1, 0.3, 1.3)).toBe(1);
    expect(popScale(0.3, 0.3, 1.3)).toBe(1);
    expect(popScale(5, 0.3, 1.3)).toBe(1);
  });
  it('reaches peak early and never dips much below 1', () => {
    let max = 0, min = Infinity, argmax = 0;
    for (let i = 1; i < 100; i++) {
      const v = popScale(i * 0.003, 0.3, 1.3);
      if (v > max) { max = v; argmax = i; }
      min = Math.min(min, v);
    }
    expect(max).toBeCloseTo(1.3, 1);
    expect(argmax).toBeLessThan(50);
    expect(min).toBeGreaterThanOrEqual(0.95);
  });
});

describe('padGlowAlpha', () => {
  it('stays within [min, max] and varies', () => {
    const [lo, hi] = PAD_GLOW.alpha;
    const vals = [];
    for (let t = 0; t < PAD_GLOW.period * 2; t += 0.1) vals.push(padGlowAlpha(t, 0.7, PAD_GLOW));
    expect(Math.min(...vals)).toBeGreaterThanOrEqual(lo - 1e-9);
    expect(Math.max(...vals)).toBeLessThanOrEqual(hi + 1e-9);
    expect(Math.max(...vals) - Math.min(...vals)).toBeGreaterThan((hi - lo) * 0.9);
  });
  it('is periodic and phase shifts the pulse', () => {
    const cfg = { period: 2, alpha: [0.2, 0.6] };
    expect(padGlowAlpha(0.3, 0, cfg)).toBeCloseTo(padGlowAlpha(2.3, 0, cfg));
    expect(padGlowAlpha(0, 0, cfg)).not.toBeCloseTo(padGlowAlpha(0, 0.25, cfg));
  });
});

describe('cooldownFraction', () => {
  it('clamps to [0,1]', () => {
    expect(cooldownFraction(5, 10)).toBe(0.5);
    expect(cooldownFraction(-1, 10)).toBe(0);
    expect(cooldownFraction(20, 10)).toBe(1);
  });
  it('is 0 when max <= 0', () => {
    expect(cooldownFraction(5, 0)).toBe(0);
    expect(cooldownFraction(5, -3)).toBe(0);
  });
});

describe('waveBannerText', () => {
  it('formats current / total', () => {
    expect(waveBannerText(5, 10)).toBe('Wave 5 / 10');
  });
  it('distinct text for the final wave', () => {
    expect(waveBannerText(10, 10)).toBe('Final wave');
    expect(waveBannerText(9, 10)).not.toBe('Final wave');
  });
});

describe('bossWarning', () => {
  it('finds a boss type in a real wave containing one', () => {
    const wave = allWaves.find((w) => w.some(isBoss));
    expect(wave).toBeDefined();
    const expected = wave.find(isBoss).type;
    expect(DEATH_CLASS[bossWarning(wave)]).toBe('boss');
    expect(bossWarning(wave)).toBe(expected);
  });
  it('returns null for a real wave with no boss', () => {
    const wave = allWaves.find((w) => !w.some(isBoss));
    expect(bossWarning(wave)).toBeNull();
  });
  it('tolerates empty/undefined', () => {
    expect(bossWarning([])).toBeNull();
    expect(bossWarning(undefined)).toBeNull();
  });
});

describe('BOSS_WARNING data', () => {
  it('derives boss types from DEATH_CLASS', () => {
    const expected = Object.keys(DEATH_CLASS).filter((k) => DEATH_CLASS[k] === 'boss');
    expect([...BOSS_WARNING.types].sort()).toEqual(expected.sort());
  });
});
