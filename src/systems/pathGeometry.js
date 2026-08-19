// src/systems/pathGeometry.js

// Distance between two points.
function dist(a, b) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

// Linear interpolation along a knot interval. If the interval has zero
// length (coincident knots — happens at duplicated endpoints or repeated
// control points), return `a` instead of dividing by zero.
function knotLerp(a, b, ta, tb, t) {
  if (tb === ta) return { x: a.x, y: a.y };
  const f = (t - ta) / (tb - ta);
  return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
}

/**
 * Sample a centripetal Catmull-Rom spline through `points` into a dense
 * polyline that passes through every input point. Endpoints are handled by
 * duplicating the first/last control point. Centripetal parameterization
 * (alpha = 0.5) avoids the cusps plain Catmull-Rom produces on sharp bends.
 *
 * @param {{x:number,y:number}[]} points  control points in pixel space
 * @param {number} samplesPerSegment      sub-segments per control-point span
 * @returns {{x:number,y:number}[]}        dense polyline
 */
export function samplePath(points, samplesPerSegment = 12) {
  samplesPerSegment = Math.max(1, Math.floor(samplesPerSegment));
  const n = points.length;
  if (n < 2) return points.map(p => ({ x: p.x, y: p.y }));

  if (n === 2) {
    const out = [];
    for (let s = 0; s <= samplesPerSegment; s++) {
      const t = s / samplesPerSegment;
      out.push({
        x: points[0].x + (points[1].x - points[0].x) * t,
        y: points[0].y + (points[1].y - points[0].y) * t,
      });
    }
    return out;
  }

  const out = [{ x: points[0].x, y: points[0].y }];
  for (let i = 0; i < n - 1; i++) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? points[i + 1];

    // Centripetal knot sequence (alpha = 0.5 => sqrt of distance).
    const t0 = 0;
    const t1 = t0 + Math.sqrt(dist(p0, p1));
    const t2 = t1 + Math.sqrt(dist(p1, p2));
    const t3 = t2 + Math.sqrt(dist(p2, p3));

    for (let s = 1; s <= samplesPerSegment; s++) {
      const t = t1 + (t2 - t1) * (s / samplesPerSegment);
      const a1 = knotLerp(p0, p1, t0, t1, t);
      const a2 = knotLerp(p1, p2, t1, t2, t);
      const a3 = knotLerp(p2, p3, t2, t3, t);
      const b1 = knotLerp(a1, a2, t0, t2, t);
      const b2 = knotLerp(a2, a3, t1, t3, t);
      out.push(knotLerp(b1, b2, t1, t2, t));
    }
  }
  return out;
}

/**
 * Clamp every point into the canvas rectangle. Guards Catmull-Rom overshoot
 * near the edges.
 *
 * @param {{x:number,y:number}[]} points
 * @param {number} w canvas width
 * @param {number} h canvas height
 */
export function clampToBounds(points, w, h) {
  return points.map(p => ({
    x: Math.max(0, Math.min(w, p.x)),
    y: Math.max(0, Math.min(h, p.y)),
  }));
}

/**
 * Return a polyline parallel to `points`, offset by `dist` pixels along the
 * per-point left normal. The tangent at point i uses neighbours i-1 and i+1
 * (one-sided at the ends); the left normal of tangent (tx,ty) is (-ty,tx).
 * Positive `dist` offsets left, negative offsets right.
 *
 * @param {{x:number,y:number}[]} points
 * @param {number} dist
 * @returns {{x:number,y:number}[]}
 */
export function offsetPolyline(points, dist) {
  const n = points.length;
  if (n < 2) return points.map((p) => ({ x: p.x, y: p.y }));
  const out = [];
  for (let i = 0; i < n; i++) {
    const prev = points[Math.max(0, i - 1)];
    const next = points[Math.min(n - 1, i + 1)];
    let tx = next.x - prev.x;
    let ty = next.y - prev.y;
    const len = Math.hypot(tx, ty) || 1;
    tx /= len;
    ty /= len;
    out.push({ x: points[i].x + -ty * dist, y: points[i].y + tx * dist });
  }
  return out;
}

// Total arc length of a polyline.
export function pathLength(points) {
  let total = 0;
  for (let i = 0; i < points.length - 1; i++) {
    total += Math.hypot(points[i + 1].x - points[i].x, points[i + 1].y - points[i].y);
  }
  return total;
}

// The point a fraction `progress` (0..1) of the way along a polyline, measured
// by arc length rather than by index so evenly-spaced progress means evenly-
// spaced travel. Extracted from Hero.setPathPosition so the hero and the
// headless simulator position along the path by the same arithmetic.
export function pointAtProgress(points, progress) {
  if (points.length === 0) return { x: 0, y: 0 };
  const last = points[points.length - 1];
  if (points.length === 1) return { x: points[0].x, y: points[0].y };

  const total = pathLength(points);
  if (total <= 0) return { x: points[0].x, y: points[0].y };

  let target = Math.min(Math.max(progress, 0), 1) * total;
  for (let i = 0; i < points.length - 1; i++) {
    const dx = points[i + 1].x - points[i].x;
    const dy = points[i + 1].y - points[i].y;
    const len = Math.hypot(dx, dy);
    if (target <= len || i === points.length - 2) {
      const t = len > 0 ? Math.min(1, target / len) : 0;
      return { x: points[i].x + t * dx, y: points[i].y + t * dy };
    }
    target -= len;
  }
  return { x: last.x, y: last.y };
}
