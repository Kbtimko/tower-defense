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
