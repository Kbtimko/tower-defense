// Render-only squad layout: where each soldier is drawn relative to its
// logical road point. Index 0 leads, 1/2 flank slightly behind, 3+ fill in
// behind on alternating sides, one spacing further back per row.
export function formationOffsets(count, dir, spacing, flankBackFrac) {
  let dx = Number(dir?.x), dy = Number(dir?.y);
  const len = Math.hypot(dx, dy);
  if (!Number.isFinite(len) || len === 0) { dx = -1; dy = 0; } else { dx /= len; dy /= len; }
  const nx = -dy, ny = dx;
  const at = (along, side) => ({ dx: dx * along + nx * side, dy: dy * along + ny * side });
  const out = [];
  for (let i = 0; i < count; i++) {
    if (i === 0) out.push(at(spacing, 0));
    else if (i <= 2) out.push(at(-flankBackFrac * spacing, (i === 1 ? 1 : -1) * spacing));
    else out.push(at(-(flankBackFrac + (i - 2)) * spacing, (i % 2 === 1 ? 0.5 : -0.5) * spacing));
  }
  return out;
}
