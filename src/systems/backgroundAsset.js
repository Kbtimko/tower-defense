import { BACKGROUND_VARIANTS, BACKGROUND_SOURCE_WIDTH } from '../data/backgroundAssets.js';

// maps.js names the SOURCE png (assets-src/backgrounds/); the shipped file is
// a WebP derived from it, so the data keeps one name per map.
export function backgroundUrl(sourceName, variant) {
  const stem = sourceName.replace(/\.png$/i, '');
  return `assets/backgrounds/${stem}${variant.suffix}.webp`;
}

/**
 * The smallest variant that still has at least as many pixels as the canvas
 * shows on screen, so a backdrop is never upscaled past its art. Picked once
 * at boot: a later resize keeps the variant, which at worst means a slightly
 * soft backdrop after rotating a small screen.
 */
export function pickBackgroundVariant({ canvasCssWidth, dpr }) {
  const devicePx = canvasCssWidth * (dpr || 1);
  if (!(devicePx > 0)) return BACKGROUND_VARIANTS[0];
  let pick = BACKGROUND_VARIANTS[0];
  for (const v of BACKGROUND_VARIANTS) {
    if (BACKGROUND_SOURCE_WIDTH * v.scale >= devicePx) pick = v;
  }
  return pick;
}
