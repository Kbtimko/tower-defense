// Pure verdicts for the capture harness's phone-layout audit (roadmap 2.3).
// The harness gathers the metrics in a real browser; this decides what is wrong,
// so the rules are unit-testable without one.

import { CANVAS_WIDTH, WORLD_HEIGHT, HUD_CELL, MIN_TOUCH_PX, MIN_TOUCH_PX_SMALL_PHONE } from '../data/layout.js';

const EDGE_TOLERANCE_PX = 1;
const ZOOM_TOLERANCE = 0.01;
// A control mostly inside its overflow-hidden ancestor is still tappable; below this it is not.
const MIN_VISIBLE_FRACTION = 0.9;

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

// The HUD is scaled with the canvas (FIT), so a phone's touch size is HUD_CELL x that scale.
// Below 44 only when the geometry physically cannot reach it (iphone 750x340).
export function minTouchFor({ vw, vh }) {
  const scale = Math.min(vw / CANVAS_WIDTH, vh / WORLD_HEIGHT);
  return scale * HUD_CELL < MIN_TOUCH_PX ? MIN_TOUCH_PX_SMALL_PHONE : MIN_TOUCH_PX;
}

const insideRect = (r, rail) => r.left >= rail.left - EDGE_TOLERANCE_PX && r.right <= rail.right + EDGE_TOLERANCE_PX
  && r.top >= rail.top - EDGE_TOLERANCE_PX && r.bottom <= rail.bottom + EDGE_TOLERANCE_PX;

// Every HUD control must live fully inside one rail; on touch devices it must also be tappable.
// Absent/hidden targets are layoutProblems' job (missing/hidden), so they are skipped here.
export function railProblems({ device, rails, targets, minTouchPx }) {
  if (!rails?.left || !rails?.right) return ['rails missing'];
  const problems = [];
  for (const t of targets) {
    if (!t.rect || !t.visible) continue;
    if (!insideRect(t.rect, rails.left) && !insideRect(t.rect, rails.right)) problems.push(`${t.name} outside rails`);
    if (device.hasTouch && (t.rect.width < minTouchPx || t.rect.height < minTouchPx)) {
      problems.push(`${t.name} too small ${Math.round(t.rect.width)}x${Math.round(t.rect.height)}`);
    }
  }
  return problems;
}

export function layoutProblems(m) {
  const problems = [];
  if (Math.abs(m.scale - 1) > ZOOM_TOLERANCE) problems.push(`zoomed: visualViewport.scale=${m.scale}`);
  if (m.innerWidth > m.device.width) {
    problems.push(`layout viewport ${m.innerWidth}x${m.innerHeight} wider than device ${m.device.width}x${m.device.height}`);
  }
  if (m.scrollWidth > m.innerWidth) problems.push(`page overflows: scrollWidth ${m.scrollWidth} > innerWidth ${m.innerWidth}`);
  for (const t of m.targets) problems.push(...targetProblems(t, m.innerWidth, m.innerHeight));
  return problems;
}
