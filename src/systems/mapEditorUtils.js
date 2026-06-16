// src/systems/mapEditorUtils.js

/** Round a normalized coordinate to 3 decimals (numeric, no trailing zeros). */
export function roundCoord(n) {
  return Math.round(n * 1000) / 1000;
}

/** Serialize one [x,y] pair as a compact "[x,y]" string with rounded coords. */
function pair([x, y]) {
  return `[${roundCoord(x)},${roundCoord(y)}]`;
}

/**
 * Serialize waypoints + towerSlots into a maps.js-ready snippet (two lines,
 * trailing commas, ready to paste into a map entry).
 *
 * @param {number[][]} waypoints   normalized [x,y] pairs
 * @param {number[][]} towerSlots  normalized [x,y] pairs
 * @returns {string}
 */
export function serializeMapArrays(waypoints, towerSlots) {
  const wp = waypoints.map(pair).join(',');
  const ts = towerSlots.map(pair).join(',');
  return `waypoints: [${wp}],\ntowerSlots: [${ts}],`;
}

/**
 * True if a slot lies within `margin` (normalized) of any straight segment
 * between consecutive waypoints — i.e. it would sit in the no-build corridor.
 *
 * @param {number[]} slot        [x,y] normalized
 * @param {number[][]} waypoints normalized [x,y] pairs
 * @param {number} margin        normalized corridor half-width
 * @returns {boolean}
 */
export function slotInPathCorridor(slot, waypoints, margin) {
  const [sx, sy] = slot;
  for (let i = 0; i < waypoints.length - 1; i++) {
    const [ax, ay] = waypoints[i];
    const [bx, by] = waypoints[i + 1];
    const dx = bx - ax, dy = by - ay;
    const lenSq = dx * dx + dy * dy;
    const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((sx - ax) * dx + (sy - ay) * dy) / lenSq));
    const cx = ax + t * dx, cy = ay + t * dy;
    if (Math.hypot(cx - sx, cy - sy) <= margin) return true;
  }
  return false;
}
