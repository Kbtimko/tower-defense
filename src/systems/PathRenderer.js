export const PATH_STYLES = ['planet-dust', 'station-strip', 'space-nav', 'organic-glow'];

// Style colors: { haloColor, haloAlpha, haloWidth, mainColor, mainWidth, dashColor, dashWidth, dashAlpha, dashOn, dashOff }
const STYLE_SPEC = {
  'planet-dust': {
    haloColor: 0x9a8c70, haloAlpha: 0.18, haloWidth: 24,
    mainColor: 0x7a6a52, mainAlpha: 0.85, mainWidth: 14,
    dashColor: 0x2a2018, dashAlpha: 0.6,  dashWidth: 2, dashOn: 3, dashOff: 6,
  },
  'station-strip': {
    haloColor: 0x1a3a5a, haloAlpha: 0.55, haloWidth: 14,
    mainColor: 0x3a8ad0, mainAlpha: 0,    mainWidth: 0,  // no solid main; dashes are the visible track
    dashColor: 0x3a8ad0, dashAlpha: 0.75, dashWidth: 2, dashOn: 6, dashOff: 8,
  },
  'space-nav': {
    haloColor: 0x000000, haloAlpha: 0,    haloWidth: 0,
    mainColor: 0x000000, mainAlpha: 0,    mainWidth: 0,
    dashColor: 0x88aabb, dashAlpha: 0.75, dashWidth: 2, dashOn: 4, dashOff: 6,
  },
  'organic-glow': {
    haloColor: 0x00ffc8, haloAlpha: 0.25, haloWidth: 22,
    mainColor: 0x4affd0, mainAlpha: 0.65, mainWidth: 8,
    dashColor: 0xffffff, dashAlpha: 0.6,  dashWidth: 1.5, dashOn: 5, dashOff: 7,
  },
};

/**
 * Render a curved path through `points` using one of PATH_STYLES.
 * Draws up to 3 stacked strokes: halo (soft underlay), main, dashed overlay.
 * Curves are approximated with quadratic Bezier segments interpolated
 * at every waypoint (smooth corners through real waypoint positions).
 *
 * @param {Phaser.GameObjects.Graphics} gfx
 * @param {{x:number,y:number}[]} points
 * @param {string} style
 */
export function renderPath(gfx, points, style) {
  if (points.length < 2) return;
  const spec = STYLE_SPEC[style];
  if (!spec) throw new Error(`PathRenderer: unknown style "${style}"`);

  // Halo layer
  if (spec.haloWidth > 0 && spec.haloAlpha > 0) {
    drawSmoothStroke(gfx, points, spec.haloColor, spec.haloAlpha, spec.haloWidth);
  }
  // Main stroke
  if (spec.mainWidth > 0 && spec.mainAlpha > 0) {
    drawSmoothStroke(gfx, points, spec.mainColor, spec.mainAlpha, spec.mainWidth);
  }
  // Dashed overlay
  if (spec.dashWidth > 0 && spec.dashAlpha > 0) {
    drawDashedStroke(gfx, points, spec.dashColor, spec.dashAlpha, spec.dashWidth, spec.dashOn, spec.dashOff);
  }
}

function drawSmoothStroke(gfx, points, color, alpha, width) {
  gfx.lineStyle(width, color, alpha);
  gfx.beginPath();
  gfx.moveTo(points[0].x, points[0].y);
  // Quadratic-curve through midpoints: control = current waypoint,
  // endpoint = midpoint to next. Smooths the corners.
  for (let i = 1; i < points.length - 1; i++) {
    const mid = { x: (points[i].x + points[i + 1].x) / 2, y: (points[i].y + points[i + 1].y) / 2 };
    gfx.quadraticCurveTo(points[i].x, points[i].y, mid.x, mid.y);
  }
  const last = points[points.length - 1];
  gfx.lineTo(last.x, last.y);
  gfx.strokePath();
}

function drawDashedStroke(gfx, points, color, alpha, width, dashOn, dashOff) {
  // Approximate dashes by walking segments and laying short line segments.
  // Phaser's Graphics doesn't expose dash arrays natively; this is the
  // standard workaround used throughout this codebase.
  gfx.lineStyle(width, color, alpha);
  let phase = 0; // 0 = drawing on-segment, 1 = drawing off-segment
  let remaining = dashOn;
  for (let i = 0; i < points.length - 1; i++) {
    let x = points[i].x, y = points[i].y;
    const tx = points[i + 1].x, ty = points[i + 1].y;
    let dx = tx - x, dy = ty - y;
    let segLen = Math.hypot(dx, dy);
    if (segLen === 0) continue;
    let ux = dx / segLen, uy = dy / segLen;
    while (segLen > 0) {
      const step = Math.min(remaining, segLen);
      if (phase === 0) {
        gfx.lineBetween(x, y, x + ux * step, y + uy * step);
      }
      x += ux * step; y += uy * step;
      segLen -= step;
      remaining -= step;
      if (remaining <= 0) {
        phase = 1 - phase;
        remaining = phase === 0 ? dashOn : dashOff;
      }
    }
  }
}
