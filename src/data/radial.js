// Radial menu geometry knobs. Angles are degrees, 0 = east, clockwise on screen
// (y grows downward), so -90 is straight up.

// Sizes are fractions of the HUD cell so the ring meets the per-device touch
// floor the rail audit already enforces (see radialMetrics).
export const RADIAL_HUB_SCALE = 1.25;
export const RADIAL_GAP_SCALE = 0.1;

// Game px kept clear between the ring and the map edge when the centre is clamped.
export const RADIAL_MARGIN = 8;

export const BUILD_START_ANGLE = -90;

// Fixed per-slot angles keep muscle memory: a slot never moves with pad position.
// 60 degrees between neighbours gives a chord equal to the ring radius, which
// is wider than an item at both cell sizes (asserted in radialLayout.test.js).
export const RING_ANGLES = { upgrade: -90, branchA: -120, branchB: -60, reposition: 180, sell: 90 };

export function buildAngles(count) {
  return Array.from({ length: count }, (_, i) => BUILD_START_ANGLE + (360 / count) * i);
}

export const BUILD_ANGLES_COUNT = 6;
