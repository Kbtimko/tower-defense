import { describe, it, expect } from 'vitest';
import { layoutProblems, railProblems, minTouchFor } from './layoutAudit.js';

const rect = (left, top, right, bottom) => ({ left, top, right, bottom, width: right - left, height: bottom - top });

function healthy(overrides = {}) {
  return {
    device: { width: 750, height: 340 },
    innerWidth: 750, innerHeight: 340, scale: 1, scrollWidth: 750,
    targets: [{ name: '#play', rect: rect(10, 10, 110, 50), visibleRect: rect(10, 10, 110, 50), visible: true }],
    ...overrides,
  };
}
const withTarget = t => healthy({ targets: [{ name: '#play', rect: rect(10, 10, 110, 50), visibleRect: rect(10, 10, 110, 50), visible: true, ...t }] });

describe('layoutProblems', () => {
  it('is empty for a healthy layout', () => {
    expect(layoutProblems(healthy())).toEqual([]);
  });

  it('reports page zoom', () => {
    expect(layoutProblems(healthy({ scale: 1.92 }))).toEqual(['zoomed: visualViewport.scale=1.92']);
  });

  it('tolerates scale within 0.01 of 1', () => {
    expect(layoutProblems(healthy({ scale: 1.005 }))).toEqual([]);
  });

  it('reports a layout viewport wider than the device', () => {
    const out = layoutProblems(healthy({ innerWidth: 770, scrollWidth: 770 }));
    expect(out).toEqual(['layout viewport 770x340 wider than device 750x340']);
  });

  it('reports page overflow', () => {
    expect(layoutProblems(healthy({ scrollWidth: 800 }))).toEqual(['page overflows: scrollWidth 800 > innerWidth 750']);
  });

  it('reports a missing target', () => {
    expect(layoutProblems(withTarget({ rect: null, visibleRect: null }))).toEqual(['#play missing']);
  });

  it('reports a hidden target', () => {
    expect(layoutProblems(withTarget({ visible: false }))).toEqual(['#play hidden']);
  });

  it('reports a target below the viewport', () => {
    const r = rect(10, 320, 110, 363);
    const out = layoutProblems(withTarget({ rect: r, visibleRect: r }));
    expect(out).toHaveLength(1);
    expect(out[0]).toMatch(/^#play off-screen /);
  });

  it('treats an edge exactly at innerWidth as healthy and +2px as off-screen', () => {
    const edge = rect(650, 10, 750, 50);
    expect(layoutProblems(withTarget({ rect: edge, visibleRect: edge }))).toEqual([]);
    const over = rect(652, 10, 752, 50);
    expect(layoutProblems(withTarget({ rect: over, visibleRect: over }))[0]).toMatch(/^#play off-screen /);
  });

  it('allows 1px of tolerance on an edge', () => {
    const r = rect(-1, 10, 99, 50);
    expect(layoutProblems(withTarget({ rect: r, visibleRect: r }))).toEqual([]);
  });

  it('reports a zero-size target as off-screen', () => {
    const r = rect(10, 10, 10, 50);
    expect(layoutProblems(withTarget({ rect: r, visibleRect: r }))[0]).toMatch(/^#play off-screen /);
  });

  it('reports a target clipped by an overflow ancestor below 90% visible', () => {
    // 100x40 box, only the top 20px survives its ancestor's overflow:hidden.
    const out = layoutProblems(withTarget({ visibleRect: rect(10, 10, 110, 30) }));
    expect(out).toEqual(['#play clipped']);
  });

  it('reports a fully clipped target (null visibleRect)', () => {
    expect(layoutProblems(withTarget({ visibleRect: null }))).toEqual(['#play clipped']);
  });

  it('does not report clipping at 90% visible or more', () => {
    expect(layoutProblems(withTarget({ visibleRect: rect(10, 10, 110, 46) }))).toEqual([]);
  });
});

describe('minTouchFor', () => {
  it.each([
    [750, 340, 40],   // iphone: scale 0.46 -> 40.4 css px per cell, cannot reach 44
    [863, 360, 44],   // pixel: height-bound scale 0.5 -> exactly 44
    [844, 390, 44],
    [932, 430, 44],
    [815, 390, 40],   // width-bound: 815/1632*88 = 43.94, just under
    [816, 390, 44],   // exactly 44.0
  ])('%ix%i -> %i', (vw, vh, expected) => {
    expect(minTouchFor({ vw, vh })).toBe(expected);
  });
});

describe('railProblems', () => {
  const rails = { left: rect(0, 0, 80, 360), right: rect(560, 0, 640, 360) };
  const touch = { hasTouch: true };
  const run = (t, extra = {}) => railProblems({ device: touch, rails, minTouchPx: 44, targets: [{ name: '#b', visible: true, rect: rect(10, 10, 60, 60), ...t }], ...extra });

  it('is empty when a target is inside a rail and big enough', () => {
    expect(run({})).toEqual([]);
  });
  it('accepts a target in the right rail', () => {
    expect(run({ rect: rect(570, 10, 620, 60) })).toEqual([]);
  });
  it('reports "rails missing" when either rail is absent', () => {
    expect(run({}, { rails: { left: null, right: rails.right } })).toEqual(['rails missing']);
    expect(run({}, { rails: { left: rails.left, right: null } })).toEqual(['rails missing']);
  });
  it('reports a target outside both rails', () => {
    expect(run({ rect: rect(200, 10, 250, 60) })).toEqual(['#b outside rails']);
  });
  it('reports a target straddling a rail edge', () => {
    expect(run({ rect: rect(40, 10, 90, 60) })).toEqual(['#b outside rails']);
  });
  it('tolerates 1px overhang but not 2px', () => {
    expect(run({ rect: rect(-1, 0, 49, 50) })).toEqual([]);
    expect(run({ rect: rect(-2, 0, 48, 50) })).toEqual(['#b outside rails']);
  });
  it('reports a touch target too small, in either dimension', () => {
    expect(run({ rect: rect(10, 10, 53, 60) })).toEqual(['#b too small 43x50']);
    expect(run({ rect: rect(10, 10, 60, 53) })).toEqual(['#b too small 50x43']);
  });
  it('accepts exactly minTouchPx and honours a lower floor', () => {
    expect(run({ rect: rect(10, 10, 54, 54) })).toEqual([]);
    expect(run({ rect: rect(10, 10, 50, 50) }, { minTouchPx: 40 })).toEqual([]);
  });
  it('allows 0.5px of sub-pixel slack under the floor', () => {
    expect(run({ rect: rect(10, 10, 53.6, 60) })).toEqual([]);
    expect(run({ rect: rect(10, 10, 53.4, 60) })).toEqual(['#b too small 43x50']);
    expect(run({ rect: rect(10, 10, 60, 53.4) })).toEqual(['#b too small 50x43']);
  });
  it('applies no size rule without touch', () => {
    expect(run({ rect: rect(10, 10, 20, 20) }, { device: { hasTouch: false } })).toEqual([]);
  });
  it('skips absent or hidden targets (layoutProblems reports those)', () => {
    expect(run({ rect: null, visible: false })).toEqual([]);
    expect(run({ visible: false, rect: rect(200, 10, 250, 60) })).toEqual([]);
  });
});
