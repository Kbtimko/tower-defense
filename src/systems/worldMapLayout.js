// World-map layout: the route frame, node rects and the fit rule (spec 5). The
// scene and the capture audit share this, and the scene publishes the same LAYOUT
// numbers as --wm-* CSS custom properties so CSS and math can't drift.
import { COMPACT_MAX_HEIGHT_PX } from '../data/mobile.js';
import { LAYOUT } from '../data/worldMap.js';
import { MAPS } from '../data/maps.js';

const FRAME_MARGIN_PX = 4;

export function layoutClass({ height }) {
  return height <= COMPACT_MAX_HEIGHT_PX ? 'compact' : 'tall';
}

export function cardWidth(viewport, cls, L = LAYOUT) {
  const c = L.card[cls];
  return Math.min(c.max, Math.max(c.min, c.vw * viewport.width));
}

// The card hugs the right edge with a gutter either side; the frame takes the rest.
export function routeFrameFor(viewport, cls, L = LAYOUT) {
  const g = L.gutter;
  const top = L.topBand[cls];
  return {
    x: g,
    y: top + g,
    w: viewport.width - cardWidth(viewport, cls, L) - 3 * g,
    h: viewport.height - top - L.statsStrip[cls] - 2 * g,
  };
}

// One rect per map, centred on the node+label box (the label hangs below the node),
// so cx/cy is the rect centre, not the node centre. d is the round button itself,
// which is what a finger has to hit.
export function nodeRects(frame, route, cls, L = LAYOUT) {
  const size = L.node[cls];
  const lastId = MAPS[MAPS.length - 1].id;
  return MAPS.map(m => {
    const d = m.id === lastId ? size.final : size.d;
    const label = L.labelPx[cls];
    const [nx, ny] = route.nodes[m.id];
    return {
      id: m.id,
      d,
      cx: frame.x + nx * frame.w,
      cy: frame.y + ny * frame.h + label / 2,
      w: Math.max(d, L.labelW[cls]),
      h: d + label,
    };
  });
}

function edges(r) {
  return { l: r.cx - r.w / 2, r: r.cx + r.w / 2, t: r.cy - r.h / 2, b: r.cy + r.h / 2 };
}

function overlaps(a, b) {
  const e = edges(a);
  const f = edges(b);
  return e.l < f.r && f.l < e.r && e.t < f.b && f.t < e.b;
}

function insideFrame(r, frame) {
  const e = edges(r);
  const m = FRAME_MARGIN_PX;
  return e.l >= frame.x + m && e.r <= frame.x + frame.w - m
    && e.t >= frame.y + m && e.b <= frame.y + frame.h - m;
}

function insideViewport(r, viewport) {
  const e = edges(r);
  return e.l >= 0 && e.t >= 0 && e.r <= viewport.width && e.b <= viewport.height;
}

export function worldMapProblems({ nodes, frame, viewport, coarse, minTouchPx = 44 }) {
  const problems = [];
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      if (overlaps(nodes[i], nodes[j])) problems.push(`node ${nodes[i].id} overlaps node ${nodes[j].id}`);
    }
  }
  for (const n of nodes) {
    if (!insideFrame(n, frame)) problems.push(`node ${n.id} outside the route frame (${FRAME_MARGIN_PX}-px margin)`);
    if (!insideViewport(n, viewport)) problems.push(`node ${n.id} outside the viewport`);
    // The label box is not a hit target: a small node under a wide label still fails.
    const touch = Math.min(n.d ?? n.w, n.h);
    if (coarse && !n.locked && touch < minTouchPx) {
      problems.push(`node ${n.id} touch target ${touch} < ${minTouchPx} px`);
    }
  }
  return problems;
}
