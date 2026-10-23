import { describe, it, expect } from 'vitest';
import { radialMetrics, layoutRadial } from './radialLayout.js';
import { TOUCH_HUD_CELL, FINE_HUD_CELL } from '../data/layout.js';
import { BUILD_ANGLES_COUNT, buildAngles, RING_ANGLES, RADIAL_MARGIN } from '../data/radial.js';

const CELLS = [TOUCH_HUD_CELL, FINE_HUD_CELL];
const bounds = { left: 0, top: 0, width: 1280, height: 720 };

const ringConfigs = {
  build: buildAngles(BUILD_ANGLES_COUNT),
  towerWithBranches: [RING_ANGLES.branchA, RING_ANGLES.branchB, RING_ANGLES.reposition, RING_ANGLES.sell],
  towerWithUpgrade: [RING_ANGLES.upgrade, RING_ANGLES.reposition, RING_ANGLES.sell],
};

const circles = (layout, m) => [
  { x: layout.centre.x, y: layout.centre.y, r: m.hub / 2 },
  ...layout.items.map(p => ({ ...p, r: m.item / 2 })),
];

describe('radialMetrics', () => {
  it('pins the spec geometry at the touch cell', () => {
    expect(radialMetrics(TOUCH_HUD_CELL)).toMatchObject({ item: 88, hub: 110, radius: 108, footprint: 152 });
  });
  it('pins the spec geometry at the fine cell', () => {
    expect(radialMetrics(FINE_HUD_CELL)).toMatchObject({ item: 52, radius: 64, footprint: 90 });
  });
  it('footprint is the ring radius plus half an item', () => {
    for (const c of CELLS) {
      const m = radialMetrics(c);
      expect(m.footprint).toBe(m.radius + m.item / 2);
    }
  });
});

describe('layoutRadial', () => {
  for (const cell of CELLS) {
    const m = radialMetrics(cell);
    for (const [name, angles] of Object.entries(ringConfigs)) {
      it(`no two circles overlap, cell ${cell}, ${name}`, () => {
        const cs = circles(layoutRadial({ anchor: { x: 600, y: 360 }, angles, metrics: m, bounds, margin: RADIAL_MARGIN }), m);
        for (let i = 0; i < cs.length; i++) for (let j = i + 1; j < cs.length; j++) {
          expect(Math.hypot(cs[i].x - cs[j].x, cs[i].y - cs[j].y)).toBeGreaterThanOrEqual(cs[i].r + cs[j].r);
        }
      });
    }

    const pads = {
      'top-left': [0, 0], 'top-right': [1280, 0], 'bottom-left': [0, 720], 'bottom-right': [1280, 720],
      top: [640, 0], bottom: [640, 720], left: [0, 360], right: [1280, 360],
    };
    for (const [name, [x, y]] of Object.entries(pads)) {
      it(`clamps ${name} inside bounds with margin, cell ${cell}`, () => {
        const r = layoutRadial({ anchor: { x, y }, angles: ringConfigs.build, metrics: m, bounds, margin: RADIAL_MARGIN });
        expect(r.shifted).toBe(true);
        for (const c of circles(r, m)) {
          expect(c.x - c.r).toBeGreaterThanOrEqual(RADIAL_MARGIN - 1e-9);
          expect(c.y - c.r).toBeGreaterThanOrEqual(RADIAL_MARGIN - 1e-9);
          expect(c.x + c.r).toBeLessThanOrEqual(bounds.width - RADIAL_MARGIN + 1e-9);
          expect(c.y + c.r).toBeLessThanOrEqual(bounds.height - RADIAL_MARGIN + 1e-9);
        }
      });
    }

    it(`a central pad is not shifted and centres on the anchor, cell ${cell}`, () => {
      const r = layoutRadial({ anchor: { x: 600, y: 360 }, angles: ringConfigs.build, metrics: m, bounds, margin: RADIAL_MARGIN });
      expect(r.shifted).toBe(false);
      expect(r.centre).toEqual({ x: 600, y: 360 });
    });
  }

  it('places item 0 of the build ring straight above the centre (-90deg)', () => {
    const m = radialMetrics(TOUCH_HUD_CELL);
    const r = layoutRadial({ anchor: { x: 600, y: 360 }, angles: ringConfigs.build, metrics: m, bounds, margin: 8 });
    expect(r.items[0].x).toBeCloseTo(600);
    expect(r.items[0].y).toBeCloseTo(360 - m.radius);
  });

  it('keeps slot offsets identical when shifted (fixed angles)', () => {
    const m = radialMetrics(TOUCH_HUD_CELL);
    const a = layoutRadial({ anchor: { x: 600, y: 360 }, angles: ringConfigs.build, metrics: m, bounds, margin: 8 });
    const b = layoutRadial({ anchor: { x: 0, y: 0 }, angles: ringConfigs.build, metrics: m, bounds, margin: 8 });
    a.items.forEach((p, i) => {
      expect(b.items[i].x - b.centre.x).toBeCloseTo(p.x - a.centre.x);
      expect(b.items[i].y - b.centre.y).toBeCloseTo(p.y - a.centre.y);
    });
  });

  it('honours a non-zero bounds origin', () => {
    const m = radialMetrics(FINE_HUD_CELL);
    const r = layoutRadial({ anchor: { x: 0, y: 0 }, angles: ringConfigs.build, metrics: m, bounds: { left: 100, top: 50, width: 500, height: 400 }, margin: 8 });
    for (const c of circles(r, m)) {
      expect(c.x - c.r).toBeGreaterThanOrEqual(108 - 1e-9);
      expect(c.y - c.r).toBeGreaterThanOrEqual(58 - 1e-9);
    }
  });
});
