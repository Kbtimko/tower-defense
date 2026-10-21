import { describe, it, expect } from 'vitest';
import { shadowSpec, unitDepth } from './grounding.js';
import { SHADOW, FLYER_SHADOW, UNIT_DEPTH } from '../data/grounding.js';
import { SPRITE_MANIFEST } from '../data/sprites.js';

describe('shadowSpec', () => {
  const ground = { footY: 20, width: 30 };

  it('sizes the ellipse from the silhouette and sits it under the feet, offset lower-right', () => {
    const s = shadowSpec(ground);
    expect(s.width).toBeCloseTo(30 * SHADOW.widthRatio);
    expect(s.height).toBeCloseTo(s.width * SHADOW.heightRatio);
    expect(s.x).toBe(SHADOW.dx);
    // Centred just below the art's lowest pixel, so half of it shows past the feet.
    expect(s.y).toBeCloseTo(ground.footY + SHADOW.dy);
    expect(s.y + s.height / 2).toBeGreaterThan(ground.footY);
    expect(s.alpha).toBe(SHADOW.alpha);
  });

  it('detaches a flyer shadow below the art and makes it fainter', () => {
    const ground = shadowSpec({ footY: 9, width: 29 });
    const flyer  = shadowSpec({ footY: 9, width: 29 }, { flying: true });
    expect(flyer.y - ground.y).toBeCloseTo(FLYER_SHADOW.drop);
    expect(flyer.alpha).toBeCloseTo(SHADOW.alpha * FLYER_SHADOW.alphaMult);
    // Detached: the whole ellipse is below the art's lowest pixel.
    expect(flyer.y - flyer.height / 2).toBeGreaterThan(9);
  });

  it('returns null without ground metrics or with a degenerate width', () => {
    expect(shadowSpec(undefined)).toBeNull();
    expect(shadowSpec({ footY: 10, width: 0 })).toBeNull();
    expect(shadowSpec({ footY: 10 })).toBeNull();
  });
});

describe('unitDepth', () => {
  it('increases with y, so lower units draw in front', () => {
    expect(unitDepth(400)).toBeGreaterThan(unitDepth(399));
  });

  it('stays inside the unit band: above the static layer, below projectiles', () => {
    for (const y of [-500, 0, 360, 720, 5000]) {
      expect(unitDepth(y)).toBeGreaterThanOrEqual(UNIT_DEPTH.min);
      expect(unitDepth(y)).toBeLessThanOrEqual(UNIT_DEPTH.max);
    }
    expect(UNIT_DEPTH.min).toBeGreaterThan(10);
    expect(UNIT_DEPTH.max).toBeLessThan(16);
  });

  it('treats a missing y as the top of the band', () => {
    expect(unitDepth(NaN)).toBe(UNIT_DEPTH.min);
  });
});

describe('sprite manifest ground metrics', () => {
  it('gives every entry a measured foot offset and silhouette width', () => {
    for (const e of SPRITE_MANIFEST) {
      expect(e.ground, `${e.category}/${e.type}`).toBeDefined();
      expect(e.ground.width).toBeGreaterThan(0);
      expect(Number.isFinite(e.ground.footY)).toBe(true);
    }
  });
});
