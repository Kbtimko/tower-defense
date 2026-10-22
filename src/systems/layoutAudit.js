// Pure verdicts for the capture harness's phone-layout audit (roadmap 2.3).
// The harness gathers the metrics in a real browser; this decides what is wrong,
// so the rules are unit-testable without one.

const EDGE_TOLERANCE_PX = 1;
const ZOOM_TOLERANCE = 0.01;
// A control mostly inside its overflow-hidden ancestor is still tappable; below this it is not.
const MIN_VISIBLE_FRACTION = 0.9;
// The bar is align-items:center, so controls of different heights share a vertical centre, not a top;
// a wrapped row's centre is a whole button-height away.
const SAME_ROW_TOLERANCE_PX = 2;

const area = r => (r ? Math.max(0, r.width) * Math.max(0, r.height) : 0);
const fmt = r => `[${[r.left, r.top, r.right, r.bottom].map(n => Math.round(n)).join(',')}]`;

function isOffScreen(r, innerWidth, innerHeight) {
  return r.width <= 0 || r.height <= 0
    || r.left < -EDGE_TOLERANCE_PX || r.top < -EDGE_TOLERANCE_PX
    || r.right > innerWidth + EDGE_TOLERANCE_PX || r.bottom > innerHeight + EDGE_TOLERANCE_PX;
}

// target.visibleRect is rect intersected with every overflow-clipping ancestor
// (null when nothing survives); rect alone cannot see a clipped control, because
// getBoundingClientRect ignores ancestor clipping.
function targetProblems(t, innerWidth, innerHeight) {
  if (!t.rect) return [`${t.name} missing`];
  if (!t.visible) return [`${t.name} hidden`];
  const problems = [];
  if (isOffScreen(t.rect, innerWidth, innerHeight)) problems.push(`${t.name} off-screen ${fmt(t.rect)}`);
  if (t.visibleRect !== undefined && area(t.visibleRect) < MIN_VISIBLE_FRACTION * area(t.rect)) {
    problems.push(`${t.name} clipped`);
  }
  return problems;
}

// m.barRects: rects of the visible tower buttons, exit and wave buttons. On a phone the
// bar must stay ONE row (the flex-wrap in the compact block is a safety net, not a layout).
function barWrapProblems(barRects) {
  if (!barRects?.length) return [];
  const centres = barRects.map(r => (r.top + r.bottom) / 2);
  return Math.max(...centres) - Math.min(...centres) > SAME_ROW_TOLERANCE_PX ? ['bottom bar wraps'] : [];
}

export function layoutProblems(m) {
  const problems = [];
  if (Math.abs(m.scale - 1) > ZOOM_TOLERANCE) problems.push(`zoomed: visualViewport.scale=${m.scale}`);
  if (m.innerWidth > m.device.width) {
    problems.push(`layout viewport ${m.innerWidth}x${m.innerHeight} wider than device ${m.device.width}x${m.device.height}`);
  }
  if (m.scrollWidth > m.innerWidth) problems.push(`page overflows: scrollWidth ${m.scrollWidth} > innerWidth ${m.innerWidth}`);
  for (const t of m.targets) problems.push(...targetProblems(t, m.innerWidth, m.innerHeight));
  problems.push(...barWrapProblems(m.barRects));
  return problems;
}
