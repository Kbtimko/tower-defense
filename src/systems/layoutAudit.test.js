import { describe, it, expect } from 'vitest';
import { layoutProblems } from './layoutAudit.js';

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

  it('is healthy when every bar control shares a row (vertical centres within 2px, whatever their heights)', () => {
    const row = [rect(10, 100, 60, 150), rect(70, 105, 120, 145), rect(130, 101, 180, 151)];
    expect(layoutProblems(healthy({ barRects: row }))).toEqual([]);
  });

  it('reports "bottom bar wraps" when a control drops to a second row', () => {
    const wrapped = [rect(10, 100, 60, 150), rect(70, 100, 120, 150), rect(10, 153, 60, 193)];
    expect(layoutProblems(healthy({ barRects: wrapped }))).toEqual(['bottom bar wraps']);
  });

  it('skips the row check when no bar controls were measured', () => {
    expect(layoutProblems(healthy({ barRects: [] }))).toEqual([]);
  });
});
