import { describe, it, expect } from 'vitest';
import { filterStages, applyColorStages, rgbToHue, meanHue, hueDistance } from './colorMatrix.js';
import { SOLDIER_RECOLOR, SOLDIER_4A_HUE } from '../data/tierLooks.js';

const px = (...v) => new Uint8ClampedArray(v);
const hexHue = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return rgbToHue((n >> 16) & 255, (n >> 8) & 255, n & 255);
};

describe('colorMatrix', () => {
  it('identity params leave pixels byte-identical (E35)', () => {
    const a = px(12, 200, 99, 255, 1, 2, 3, 128);
    expect(applyColorStages(a.slice(), filterStages({}))).toEqual(a);
  });
  it('alpha is untouched and alpha-0 rgb is skipped (E36)', () => {
    const a = applyColorStages(px(10, 20, 30, 0, 10, 20, 30, 77), filterStages({ sepia: 1 }));
    expect([...a.slice(0, 4)]).toEqual([10, 20, 30, 0]);
    expect(a[7]).toBe(77);
  });
  it('clamps per stage: white under sepia 1 -> (255,255,239) (E37)', () => {
    expect([...applyColorStages(px(255, 255, 255, 255), filterStages({ sepia: 1 })).slice(0, 3)]).toEqual([255, 255, 239]);
  });
  // A single stage can't tell per-stage clamping from clamp-at-the-end; a second stage can.
  it('clamps between stages, not once at the end (E37)', () => {
    expect([...applyColorStages(px(255, 255, 255, 255), filterStages({ sepia: 1, brightness: 0.5 })).slice(0, 3)]).toEqual([128, 128, 120]);
  });
  // Blue -> sepia tone (~40 deg) -> rotated 180 (~220); swapped order would end ~40.
  it('applies stages in CSS order', () => {
    const a = applyColorStages(px(0, 0, 255, 255), filterStages({ sepia: 1, hueRotate: 180 }));
    const h = rgbToHue(a[0], a[1], a[2]);
    expect(hueDistance(h, 220)).toBeLessThan(25);
    expect(hueDistance(h, 40)).toBeGreaterThan(90);
  });
  it('hue-rotate 120 maps pure red near pure green hue', () => {
    const a = applyColorStages(px(255, 0, 0, 255), filterStages({ hueRotate: 120 }));
    expect(hueDistance(rgbToHue(a[0], a[1], a[2]), 120)).toBeLessThan(20);
  });
  it('meanHue ignores transparent and grey pixels', () => {
    expect(meanHue(px(255, 0, 0, 255, 0, 0, 255, 0, 128, 128, 128, 255))).toBeCloseTo(0, 0);
  });
  it('meanHue is null with no coloured pixels', () => {
    expect(meanHue(px(128, 128, 128, 255))).toBeNull();
  });
  it('hueDistance wraps around 360', () => {
    expect(hueDistance(350, 10)).toBe(20);
  });
  // R26 pure check (E43)
  it('t4a turns art-bible steel #5b6b7a into the #6fb6ff family, clear of slow cyan', () => {
    const a = applyColorStages(px(0x5b, 0x6b, 0x7a, 255), filterStages(SOLDIER_RECOLOR.t4a));
    const h = rgbToHue(a[0], a[1], a[2]);
    expect(hueDistance(h, hexHue(SOLDIER_4A_HUE.target))).toBeLessThanOrEqual(SOLDIER_4A_HUE.maxTargetDeg);
    expect(hueDistance(h, hexHue(SOLDIER_4A_HUE.avoid))).toBeGreaterThanOrEqual(SOLDIER_4A_HUE.minAvoidDeg);
  });
});
