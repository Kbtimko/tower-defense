import { samplePath, offsetPolyline } from './pathGeometry.js';

export const PATH_STYLES = ['planet-dust', 'station-strip', 'space-nav', 'organic-glow', 'planet-road', 'lunar-road'];

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
  'planet-road': {
    // Road layers (drawn first, bottom→top)
    bermWidth: 34, bermColor: 0x9a8362, bermAlpha: 0.30,
    roadbedWidth: 26, roadbedColor: 0x6b5740, roadbedAlpha: 0.78,
    rutOffset: 6, rutWidth: 2, rutColor: 0x4a3c2c, rutAlpha: 0.55,
    // Accents
    haloColor: 0x000000, haloAlpha: 0, haloWidth: 0,
    mainColor: 0x000000, mainAlpha: 0, mainWidth: 0,
    dashColor: 0x3a2e20, dashAlpha: 0.45, dashWidth: 2, dashOn: 5, dashOff: 9,
  },
  // Grey regolith road for the lunar maps (1, 2).
  'lunar-road': {
    bermWidth: 34, bermColor: 0xb8bcc4, bermAlpha: 0.26,
    roadbedWidth: 26, roadbedColor: 0x6e7178, roadbedAlpha: 0.80,
    rutOffset: 6, rutWidth: 2, rutColor: 0x44474e, rutAlpha: 0.55,
    haloColor: 0x000000, haloAlpha: 0, haloWidth: 0,
    mainColor: 0x000000, mainAlpha: 0, mainWidth: 0,
    dashColor: 0x2e3138, dashAlpha: 0.40, dashWidth: 2, dashOn: 5, dashOff: 9,
  },
};

/**
 * Render a curved path through `points` using one of PATH_STYLES.
 * Draws up to 3 stacked strokes: halo (soft underlay), main, dashed overlay.
 * Curves are sampled from a centripetal Catmull-Rom spline that passes
 * through every waypoint (see pathGeometry.samplePath).
 *
 * @param {Phaser.GameObjects.Graphics} gfx
 * @param {{x:number,y:number}[]} points
 * @param {string} style
 */
export function renderPath(gfx, points, style) {
  if (points.length < 2) return;
  const spec = STYLE_SPEC[style];
  if (!spec) throw new Error(`PathRenderer: unknown style "${style}"`);

  // ── Road layers (optional; drawn first so accents sit on top) ──
  // Dust berms: soft, wide, light edge underlay.
  if (spec.bermWidth > 0 && spec.bermAlpha > 0) {
    drawSmoothStroke(gfx, points, spec.bermColor, spec.bermAlpha, spec.bermWidth);
  }
  // Packed-earth roadbed.
  if (spec.roadbedWidth > 0 && spec.roadbedAlpha > 0) {
    drawSmoothStroke(gfx, points, spec.roadbedColor, spec.roadbedAlpha, spec.roadbedWidth);
  }
  // Worn wheel ruts: two thin lines offset ± along the curve normals.
  if (spec.rutOffset > 0 && spec.rutWidth > 0 && spec.rutAlpha > 0) {
    const curve = samplePath(points, CURVE_SAMPLES);
    drawPolylineStroke(gfx, offsetPolyline(curve, spec.rutOffset), spec.rutColor, spec.rutAlpha, spec.rutWidth);
    drawPolylineStroke(gfx, offsetPolyline(curve, -spec.rutOffset), spec.rutColor, spec.rutAlpha, spec.rutWidth);
  }

  // ── Themed accents ──
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

// Samples per Catmull-Rom segment. 12 gives visually-smooth corners at the
// path widths we draw without overspending on Graphics commands.
const CURVE_SAMPLES = 12;

function drawPolylineStroke(gfx, pts, color, alpha, width) {
  if (pts.length < 2) return;
  gfx.lineStyle(width, color, alpha);
  gfx.beginPath();
  gfx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) {
    gfx.lineTo(pts[i].x, pts[i].y);
  }
  gfx.strokePath();
}

function drawSmoothStroke(gfx, points, color, alpha, width) {
  if (points.length < 2) return;
  drawPolylineStroke(gfx, samplePath(points, CURVE_SAMPLES), color, alpha, width);
}

function drawDashedStroke(gfx, points, color, alpha, width, dashOn, dashOff) {
  if (points.length < 2) return;
  const curve = samplePath(points, CURVE_SAMPLES);
  gfx.lineStyle(width, color, alpha);
  let phase = 0;
  let remaining = dashOn;
  for (let i = 0; i < curve.length - 1; i++) {
    let x = curve[i].x, y = curve[i].y;
    const tx = curve[i + 1].x, ty = curve[i + 1].y;
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
