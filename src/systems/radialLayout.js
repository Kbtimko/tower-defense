import { RADIAL_HUB_SCALE, RADIAL_GAP_SCALE } from '../data/radial.js';

// Item diameter is the HUD cell; hub and gap scale from it. Rounded so DOM sizes
// are whole game px: 88 -> item 88, hub 110, radius 108; 52 -> radius 64.
export function radialMetrics(hudCell) {
  const item = hudCell;
  const hub = Math.round(item * RADIAL_HUB_SCALE);
  const gap = Math.round(item * RADIAL_GAP_SCALE);
  const radius = Math.round((hub + item) / 2 + gap);
  return { item, hub, gap, radius, footprint: radius + item / 2 };
}

const toRad = deg => (deg * Math.PI) / 180;

// Slides the centre inward just enough that every item and the hub sit inside
// `bounds` minus `margin`; slot angles never change. Clamping is always feasible
// because the footprint is far smaller than the map.
export function layoutRadial({ anchor, angles, metrics, bounds, margin }) {
  const offsets = angles.map(a => ({ x: metrics.radius * Math.cos(toRad(a)), y: metrics.radius * Math.sin(toRad(a)) }));
  const half = metrics.item / 2;
  let minX = -metrics.hub / 2, maxX = metrics.hub / 2, minY = -metrics.hub / 2, maxY = metrics.hub / 2;
  for (const o of offsets) {
    minX = Math.min(minX, o.x - half); maxX = Math.max(maxX, o.x + half);
    minY = Math.min(minY, o.y - half); maxY = Math.max(maxY, o.y + half);
  }
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(v, hi));
  const centre = {
    x: clamp(anchor.x, bounds.left + margin - minX, bounds.left + bounds.width - margin - maxX),
    y: clamp(anchor.y, bounds.top + margin - minY, bounds.top + bounds.height - margin - maxY),
  };
  return {
    centre,
    items: offsets.map(o => ({ x: centre.x + o.x, y: centre.y + o.y })),
    shifted: centre.x !== anchor.x || centre.y !== anchor.y,
  };
}

// How far text must shrink, about the face's centre, for every line box to
// sit inside a round button. Shrinking the font scales the centred text block
// about that centre, so the farthest corner decides. 1 means it already fits.
export function circleFitScale({ cx, cy, r }, boxes) {
  let scale = 1;
  for (const b of boxes) {
    const dx = Math.max(Math.abs(b.left - cx), Math.abs(b.right - cx));
    const dy = Math.max(Math.abs(b.top - cy), Math.abs(b.bottom - cy));
    const d = Math.hypot(dx, dy);
    if (d > r) scale = Math.min(scale, r / d);
  }
  return scale;
}
