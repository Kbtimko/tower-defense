import { SHADOW, FLYER_SHADOW, UNIT_DEPTH } from '../data/grounding.js';

/**
 * Contact-shadow ellipse in the entity's local space (origin = entity x/y).
 * `ground` is the sprite's measured silhouette (sprites.js): footY is the art's
 * lowest pixel below the anchor, width its silhouette width, both display px.
 * Returns null when there is nothing to measure from.
 */
export function shadowSpec(ground, { flying = false } = {}) {
  if (!ground || !(ground.width > 0) || !Number.isFinite(ground.footY)) return null;
  const width  = ground.width * SHADOW.widthRatio;
  const height = width * SHADOW.heightRatio;
  return {
    x: SHADOW.dx,
    y: ground.footY + SHADOW.dy + (flying ? FLYER_SHADOW.drop : 0),
    width,
    height,
    alpha: SHADOW.alpha * (flying ? FLYER_SHADOW.alphaMult : 1),
  };
}

// Screen-y to display depth inside the unit band.
export function unitDepth(y) {
  const { min, max, worldHeight } = UNIT_DEPTH;
  const t = Number.isFinite(y) ? Math.max(0, Math.min(1, y / worldHeight)) : 0;
  return min + t * (max - min);
}
