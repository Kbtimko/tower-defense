// Route geometry for the world map: normalized ROUTE coords -> px points in the
// route frame, arc-length params for the trail/ship, and the front-line radius.
import { MAPS } from '../data/maps.js';
import { pathLength } from './pathGeometry.js';

function toFrame(frame, [nx, ny]) {
  return { x: frame.x + nx * frame.w, y: frame.y + ny * frame.h };
}

// Earth first, then one point per map in MAPS order, so map id m is index m + 1.
export function routePoints(frame, route) {
  return [toFrame(frame, route.earth), ...MAPS.map(m => toFrame(frame, route.nodes[m.id]))];
}

// Arc-length fraction at point `index`, so a ship lerping in param space moves at
// an even speed and survives a resize (the fraction is frame-independent enough).
export function routeParamAt(points, index) {
  const total = pathLength(points);
  if (total <= 0) return 0;
  return pathLength(points.slice(0, index + 1)) / total;
}

// The front line is an arc on the hive core through the frontier mission, so the
// fighting is always at the next node; nothing is held once every map is cleared.
export function frontRadius(points, frontier) {
  if (frontier >= MAPS.length) return 0;
  const hive = points[points.length - 1];
  const p = points[frontier + 1];
  return Math.hypot(hive.x - p.x, hive.y - p.y);
}
