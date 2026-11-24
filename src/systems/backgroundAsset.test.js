import { describe, it, expect } from 'vitest';
import { backgroundUrl, pickBackgroundVariant, mapCssWidth } from './backgroundAsset.js';
import { WORLD_WIDTH, CANVAS_WIDTH } from '../data/layout.js';
import { BACKGROUND_VARIANTS, BACKGROUND_SOURCE_WIDTH } from '../data/backgroundAssets.js';
import { MAPS } from '../data/maps.js';

const FULL = BACKGROUND_VARIANTS[0];
const HALF = BACKGROUND_VARIANTS[1];

describe('backgroundUrl', () => {
  it('derives the shipped WebP from the source PNG name', () => {
    expect(backgroundUrl('map_0_outpost_sigma.png', FULL)).toBe('assets/backgrounds/map_0_outpost_sigma.webp');
    expect(backgroundUrl('map_0_outpost_sigma.png', HALF)).toBe('assets/backgrounds/map_0_outpost_sigma@0.5x.webp');
  });

  it('gives every map a distinct URL per variant', () => {
    for (const v of BACKGROUND_VARIANTS) {
      const urls = MAPS.map(m => backgroundUrl(m.backgroundImage, v));
      expect(new Set(urls).size).toBe(MAPS.length);
    }
  });
});

describe('pickBackgroundVariant', () => {
  it('uses full size whenever the canvas shows more device pixels than the half variant has', () => {
    // 1280x720 desktop window: the map shows ~1004 CSS px wide at DPR 1.
    expect(pickBackgroundVariant({ mapCssWidth: 1036, dpr: 1 })).toBe(FULL);
    // Retina desktop and a phone at DPR 3 both need the detail.
    expect(pickBackgroundVariant({ mapCssWidth: 1036, dpr: 2 })).toBe(FULL);
    expect(pickBackgroundVariant({ mapCssWidth: 360, dpr: 3 })).toBe(FULL);
  });

  it('drops to the half variant only when it would not be upscaled', () => {
    const halfWidth = BACKGROUND_SOURCE_WIDTH * HALF.scale;
    expect(pickBackgroundVariant({ mapCssWidth: halfWidth, dpr: 1 })).toBe(HALF);
    expect(pickBackgroundVariant({ mapCssWidth: halfWidth + 1, dpr: 1 })).toBe(FULL);
    expect(pickBackgroundVariant({ mapCssWidth: 400, dpr: 1 })).toBe(HALF);
  });

  it('falls back to full size when the measurements are missing or nonsense', () => {
    expect(pickBackgroundVariant({})).toBe(FULL);
    expect(pickBackgroundVariant({ mapCssWidth: 0, dpr: 1 })).toBe(FULL);
    expect(pickBackgroundVariant({ mapCssWidth: NaN, dpr: 2 })).toBe(FULL);
    expect(pickBackgroundVariant({ mapCssWidth: 400, dpr: undefined })).toBe(HALF);
  });
});

describe('mapCssWidth', () => {
  // The canvas carries a HUD rail each side; the backdrop covers only the map.
  it('is the map share of the canvas CSS width', () => {
    expect(mapCssWidth(CANVAS_WIDTH)).toBe(WORLD_WIDTH);
    expect(mapCssWidth(1280)).toBeCloseTo(1280 * WORLD_WIDTH / CANVAS_WIDTH);
  });

  it('passes a missing measurement through, so the picker falls back to full size', () => {
    expect(pickBackgroundVariant({ mapCssWidth: mapCssWidth(undefined), dpr: 1 })).toBe(BACKGROUND_VARIANTS[0]);
  });
});
