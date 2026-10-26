import { describe, it, expect } from 'vitest';
import { resultsProblems, bannerLowerEdge } from './resultsLayout.js';

const R = (left, top, right, bottom) => ({ left, top, right, bottom, width: right - left, height: bottom - top });

const fixture = (over = {}) => ({
  mapRect: R(0, 0, 800, 400),
  bannerBox: R(200, 10, 600, 70),
  skewDeg: 5,
  bannerText: R(220, 20, 580, 60),
  bannerTextScroll: { scrollWidth: 300, clientWidth: 360 },
  stars: R(300, 100, 500, 150),
  chips: [R(40, 170, 180, 230), R(200, 170, 340, 230), R(360, 170, 500, 230), R(520, 170, 660, 230)],
  newBest: [R(40, 160, 100, 172)],
  caption: R(40, 245, 760, 315),
  captionScroll: { scrollHeight: 70, clientHeight: 70 },
  actions: R(40, 330, 760, 390),
  buttons: [{ name: 'next', rect: R(40, 330, 300, 390), visible: true }],
  fonts: [{ name: 'chip', px: 12 }],
  minTouchPx: 44,
  ...over,
});

describe('bannerLowerEdge', () => {
  const box = R(200, 10, 600, 70);
  it('returns box.bottom at the horizontal centre', () => {
    expect(bannerLowerEdge(box, 5)(400)).toBeCloseTo(70);
  });
  it('drops by tan(skew) * (cx - left) at the left edge', () => {
    expect(bannerLowerEdge(box, 5)(200)).toBeCloseTo(70 + Math.tan(5 * Math.PI / 180) * 200);
  });
  it('rises on the right edge', () => {
    expect(bannerLowerEdge(box, 5)(600)).toBeCloseTo(70 - Math.tan(5 * Math.PI / 180) * 200);
  });
});

describe('resultsProblems', () => {
  it('passes the good fixture', () => {
    expect(resultsProblems(fixture())).toEqual([]);
  });
  it('passes a defeat (stars null)', () => {
    expect(resultsProblems(fixture({ stars: null }))).toEqual([]);
  });
  it('flags a rect outside the map', () => {
    expect(resultsProblems(fixture({ caption: R(40, 245, 900, 315) })).join()).toMatch(/caption outside map/);
    expect(resultsProblems(fixture({ bannerText: R(220, -20, 580, 60) })).join()).toMatch(/bannerText outside map/);
    expect(resultsProblems(fixture({ newBest: [R(40, 160, 100, 172), R(0, 0, 900, 5)] })).join()).toMatch(/newBest\[1\] outside map/);
  });
  it('flags a visible button outside the map but ignores a hidden one', () => {
    const off = R(700, 330, 900, 390);
    expect(resultsProblems(fixture({ buttons: [{ name: 'map', rect: off, visible: true }] })).join()).toMatch(/button map outside map/);
    expect(resultsProblems(fixture({ buttons: [{ name: 'map', rect: off, visible: false }] }))).toEqual([]);
  });
  it('flags banner text overflow', () => {
    expect(resultsProblems(fixture({ bannerTextScroll: { scrollWidth: 400, clientWidth: 360 } })).join()).toMatch(/banner text overflows/);
    expect(resultsProblems(fixture({ bannerTextScroll: { scrollWidth: 361, clientWidth: 360 } }))).toEqual([]);
  });
  it('flags caption overflow', () => {
    expect(resultsProblems(fixture({ captionScroll: { scrollHeight: 90, clientHeight: 70 } })).join()).toMatch(/caption overflows/);
  });
  it.each([
    ['stars/chips', { stars: R(300, 100, 500, 200) }, /stars overlaps chip \d/],
    ['chips/caption', { caption: R(40, 220, 760, 315) }, /chip \d overlaps caption/],
    ['chips/actions', { actions: R(40, 215, 760, 390), caption: R(40, 240, 760, 250) }, /chip \d overlaps actions/],
    ['caption/actions', { actions: R(40, 300, 760, 390) }, /caption overlaps actions/],
    ['stars/actions', { actions: R(40, 120, 760, 390), chips: [] }, /stars overlaps actions/],
    ['chip/chip', { chips: [R(40, 170, 180, 230), R(150, 170, 340, 230)] }, /chip 0 overlaps chip 1/],
  ])('flags overlap %s', (_n, over, re) => {
    expect(resultsProblems(fixture(over)).join()).toMatch(re);
  });
  it('tolerates a 1px touch between neighbours', () => {
    expect(resultsProblems(fixture({ caption: R(40, 229, 760, 315), actions: R(40, 314, 760, 390) }))).toEqual([]);
  });
  it('flags a banner collision by the slanted edge (left side drops lower)', () => {
    // Left edge of the box: edge y = 70 + tan5 * 200 ~ 87.5, so top 80 collides there.
    const stars = R(205, 80, 300, 140);
    expect(resultsProblems(fixture({ stars, chips: [] })).join()).toMatch(/stars collides with banner/);
  });
  it('passes a rect in the bounding-box right corner but under the slanted edge', () => {
    // Right edge y ~ 52.5; bounding-box bottom is 70. Top 60 is inside the bbox yet below the edge.
    const stars = R(560, 60, 600, 100);
    expect(resultsProblems(fixture({ stars, chips: [], actions: R(40, 330, 760, 390) }))).toEqual([]);
  });
  it('ignores a rect that does not overlap the banner horizontally', () => {
    expect(resultsProblems(fixture({ stars: R(10, 20, 100, 60), chips: [] }))).toEqual([]);
  });
  it('flags a small visible button, not a small hidden one', () => {
    const small = R(40, 330, 80, 360);
    expect(resultsProblems(fixture({ buttons: [{ name: 'next', rect: small, visible: true }] })).join()).toMatch(/next too small 40x30/);
    expect(resultsProblems(fixture({ buttons: [{ name: 'next', rect: small, visible: false }] }))).toEqual([]);
  });
  it('flags a font under 11px', () => {
    expect(resultsProblems(fixture({ fonts: [{ name: 'chip', px: 10 }] })).join()).toMatch(/chip font-size 10px < 11px/);
    expect(resultsProblems(fixture({ fonts: [{ name: 'chip', px: 11 }] }))).toEqual([]);
  });
});
