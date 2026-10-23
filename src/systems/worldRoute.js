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

// Cuts the route at arc-length fraction t: `head` is the travelled polyline (the
// gold trail), `tail` the part ahead, `at` the cut point and `angle` the heading of
// the leg it lies on (the ship's orientation). t is clamped; NaN reads as 0.
export function splitRoute(points, t) {
  if (points.length < 2) {
    return { head: [...points], tail: [...points], at: points[0] ?? { x: 0, y: 0 }, angle: 0 };
  }
  const p = Number.isFinite(t) ? Math.min(1, Math.max(0, t)) : 0;
  let target = p * pathLength(points);
  const head = [points[0]];
  const legLen = (i) => Math.hypot(points[i + 1].x - points[i].x, points[i + 1].y - points[i].y);
  // Walk whole legs; the last leg takes whatever is left (absorbs float error at t = 1).
  let i = 0;
  for (; i < points.length - 2 && target >= legLen(i); i++) {
    target -= legLen(i);
    head.push(points[i + 1]);
  }
  const a = points[i];
  const b = points[i + 1];
  const len = legLen(i);
  const f = len > 0 ? Math.min(1, target / len) : 0;
  const at = { x: a.x + f * (b.x - a.x), y: a.y + f * (b.y - a.y) };
  if (f > 0) head.push(at);
  const tail = [at, ...points.slice(f < 1 ? i + 1 : i + 2)];
  return { head, tail, at, angle: Math.atan2(b.y - a.y, b.x - a.x) };
}

// Route param gapPx short of point `index`, so a parked ship sits on the approach
// to its node instead of under the node's button.
export function parkParam(points, index, gapPx) {
  const total = pathLength(points);
  if (total <= 0) return 0;
  return Math.max(0, (pathLength(points.slice(0, index + 1)) - gapPx) / total);
}
