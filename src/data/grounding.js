// Contact shadows and draw order (roadmap 1.2). Values follow
// docs/art-bible.md §1: light from the upper left, shadows fall lower right as
// a soft ellipse at ~35 % black; flyers get a detached, fainter one.
//
// The ellipse is CENTRED on the contact point: a shadow whose bottom edge sat
// at the feet was almost entirely hidden behind the unit's own body (first
// capture of 1.2), so half of it now extends below the art.
import { WORLD_HEIGHT } from './layout.js';

export const SHADOW = {
  widthRatio:  1.0,   // ellipse width / silhouette width
  heightRatio: 0.35,  // ellipse height / ellipse width (the ~60° camera squash)
  dx: 3,              // lower-right offset of the centre from the contact point, design px
  dy: 1,
  // Art bible seed was 0.35; on map 0's busy red sand that did not read at
  // game scale (measured in captures), so 0.5 pending G1.
  alpha: 0.5,
};

export const FLYER_SHADOW = {
  alphaMult: 0.65,    // fainter: the light is diffused over the hover height (0.5 vanished on sand)
  drop: 12,           // design px below the art's lowest pixel
};

// Units (towers, soldiers, sentries, enemies, hero) are y-sorted inside this
// band: above the static road/pad layer (10) and below projectiles (16), so a
// unit lower on screen draws in front of one behind it.
export const UNIT_DEPTH = { min: 11, max: 15.9, worldHeight: WORLD_HEIGHT };
