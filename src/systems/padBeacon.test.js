import { describe, it, expect } from 'vitest';
import { beaconAlpha } from './padBeacon.js';
import { PAD_BEACON } from '../data/ambient.js';

const [lo, hi] = PAD_BEACON.alpha;
const at = (t, slot = 0) => beaconAlpha(t, slot, PAD_BEACON);

describe('beaconAlpha', () => {
  it('is periodic', () => {
    for (const t of [0.05, 0.2, 0.7, 1.9]) {
      expect(at(t)).toBeCloseTo(at(t + PAD_BEACON.period), 6);
      expect(at(t)).toBeCloseTo(at(t + 3 * PAD_BEACON.period), 6);
    }
  });
  it('stays within the alpha bounds', () => {
    for (let t = 0; t < 10; t += 0.013) for (const s of [0, 1, 7]) {
      const a = at(t, s);
      expect(a).toBeGreaterThanOrEqual(lo - 1e-9);
      expect(a).toBeLessThanOrEqual(hi + 1e-9);
    }
  });
  it('is at full alpha mid-window and at the floor outside it', () => {
    expect(at(PAD_BEACON.period * PAD_BEACON.onFraction / 2)).toBeCloseTo(hi, 6);
    expect(at(PAD_BEACON.period * 0.6)).toBeCloseTo(lo, 6);
  });
  it('ramps smoothly rather than strobing', () => {
    const edge = PAD_BEACON.period * PAD_BEACON.onFraction;
    const ramp = at(edge - 0.01);
    expect(ramp).toBeGreaterThan(lo);
    expect(ramp).toBeLessThan(hi);
    let maxStep = 0;
    for (let t = 0; t < PAD_BEACON.period; t += 0.005) maxStep = Math.max(maxStep, Math.abs(at(t + 0.005) - at(t)));
    expect(maxStep).toBeLessThan((hi - lo) / 2);
  });
  it('phase-shifts per slot', () => {
    const t = PAD_BEACON.period * PAD_BEACON.onFraction / 2;
    expect(at(t, 0)).toBeCloseTo(hi, 6);
    expect(at(t, 1)).toBeCloseTo(lo, 6);
  });
  it('has a duty cycle near onFraction', () => {
    const mid = (lo + hi) / 2;
    let on = 0; const n = 4800;
    for (let i = 0; i < n; i++) if (at((i / n) * PAD_BEACON.period) > mid) on++;
    expect(on / n).toBeCloseTo(PAD_BEACON.onFraction, 1);
  });
});
