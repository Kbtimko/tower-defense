import { describe, it, expect } from 'vitest';
import { beaconAlpha, beaconLevel } from './padBeacon.js';
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

describe('beaconLevel', () => {
  it('is bounded to 0..1 and continuous across the period wrap', () => {
    let prev = beaconLevel(0, 0, PAD_BEACON);
    for (let t = 0.002; t < PAD_BEACON.period * 3; t += 0.002) {
      const l = beaconLevel(t, 0, PAD_BEACON);
      expect(l).toBeGreaterThanOrEqual(0);
      expect(l).toBeLessThanOrEqual(1);
      expect(Math.abs(l - prev)).toBeLessThan(0.1);
      prev = l;
    }
    expect(beaconLevel(PAD_BEACON.period - 1e-6, 0, PAD_BEACON)).toBeCloseTo(beaconLevel(0, 0, PAD_BEACON), 3);
  });
  it('reads the ramp from the beacon data', () => {
    const t = PAD_BEACON.period * PAD_BEACON.onFraction * 0.5 * PAD_BEACON.ramp; // halfway up the ramp
    const slow = { ...PAD_BEACON, ramp: PAD_BEACON.ramp * 4 };
    expect(beaconLevel(t, 0, slow)).toBeLessThan(beaconLevel(t, 0, PAD_BEACON));
  });
  it('maps linearly onto beaconAlpha', () => {
    const t = 0.03;
    const l = beaconLevel(t, 0, PAD_BEACON);
    expect(beaconAlpha(t, 0, PAD_BEACON)).toBeCloseTo(lo + (hi - lo) * l, 9);
  });
});

describe('PAD_BEACON geometry', () => {
  it('sits on the dark cleared platform inside the padEdge stroke (r*0.8), clear of the stud ring', () => {
    const { offset, radius, outline } = PAD_BEACON;
    expect(Math.hypot(offset.x, offset.y) + radius + outline.width).toBeLessThan(22 * 0.8);
  });
});
