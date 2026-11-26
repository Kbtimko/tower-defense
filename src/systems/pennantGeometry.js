// The rally pennant: pole top, tip, and down the pole.
export function pennantCorners(x, top, { w, h }) {
  return [{ x, y: top }, { x: x + w, y: top + h / 2 }, { x, y: top + h }];
}

// Push every edge of a triangle `d` px outward. Scaling about the incentre by
// (r + d) / r moves each edge's tangent line from r to r + d, so the outline is
// even all round; nudging the corners by d would leave the sharp tip bare.
export function growTriangle([A, B, C], d) {
  const a = Math.hypot(B.x - C.x, B.y - C.y);
  const b = Math.hypot(A.x - C.x, A.y - C.y);
  const c = Math.hypot(A.x - B.x, A.y - B.y);
  const per = a + b + c;
  const ix = (a * A.x + b * B.x + c * C.x) / per;
  const iy = (a * A.y + b * B.y + c * C.y) / per;
  const r = Math.abs((B.x - A.x) * (C.y - A.y) - (C.x - A.x) * (B.y - A.y)) / per;
  const k = (r + d) / r;
  return [A, B, C].map(p => ({ x: ix + (p.x - ix) * k, y: iy + (p.y - iy) * k }));
}
