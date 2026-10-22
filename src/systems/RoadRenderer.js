// Procedural road (roadmap 1.7): painted once per map into a CanvasTexture and shown
// as a single Image. Canvas 2D gives round joins/caps, dashes and pattern fills for
// free; everything here avoids ctx.filter because iOS Safari ignores it.
import { samplePath } from './pathGeometry.js';
import { noiseTile, featherSteps } from './roadMath.js';
import { ROAD_STYLES, ROAD_PAINT, ROAD_CURVE_SAMPLES } from '../data/roads.js';

const css = (c) => `#${c.toString(16).padStart(6, '0')}`;

function strokeCurve(ctx, curve, strokeStyle, width, alpha) {
  ctx.strokeStyle = strokeStyle;
  ctx.lineWidth = width;
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  ctx.moveTo(curve[0].x, curve[0].y);
  for (let i = 1; i < curve.length; i++) ctx.lineTo(curve[i].x, curve[i].y);
  ctx.stroke();
}

// Solid base colour first so the pattern's alpha (noise contrast) blends over the
// road's own hue instead of over the terrain.
function strokeBed(ctx, curve, style, pattern, width) {
  strokeCurve(ctx, curve, css(style.base), width, 1);
  if (pattern) strokeCurve(ctx, curve, pattern, width, Math.min(1, style.noise.contrast));
}

function paintBed(ctx, curve, style, pattern) {
  const bedWidth = 2 * style.halfWidth;
  strokeBed(ctx, curve, style, pattern, bedWidth);

  // Darken the whole bed shifted toward the lower-right, then repaint the interior:
  // what survives is a thin lit lip upper-left, a dark rim, and a shadow spilling
  // onto the terrain lower-right.
  ctx.save();
  ctx.translate(ROAD_PAINT.light.dx, ROAD_PAINT.light.dy);
  strokeCurve(ctx, curve, css(style.noise.colors[0]), bedWidth, ROAD_PAINT.edgeAlpha);
  ctx.restore();
  strokeBed(ctx, curve, style, pattern, bedWidth - 2 * ROAD_PAINT.edgeBand);

  // Traffic polishes the middle of the track lighter than its edges.
  if (style.wear > 0) {
    for (const w of ROAD_PAINT.wear) {
      strokeCurve(ctx, curve, css(style.noise.colors[1]), w.scale * style.halfWidth, w.alpha * style.wear);
    }
  }
}

// Open-space nav lane: no ground to pave, just a soft translucent corridor.
function paintLaneCorridor(ctx, curve, style) {
  for (const c of ROAD_PAINT.laneCore) {
    strokeCurve(ctx, curve, css(style.base), c.scale * style.halfWidth, c.alpha);
  }
}

function paintLaneDashes(ctx, curve, style) {
  const { lane } = style;
  ctx.setLineDash([lane.dash, lane.gap]);
  if (style.kind === 'lane') {
    // Halo under the dashes so they read as emitted light, not paint.
    strokeCurve(ctx, curve, css(lane.color), lane.width * ROAD_PAINT.dashGlow.widthScale, ROAD_PAINT.dashGlow.alpha);
  }
  strokeCurve(ctx, curve, css(lane.color), lane.width, lane.alpha);
}

/**
 * Paint the road along `curve` (dense polyline) into any 2D context.
 * `tile` is the noise tile canvas used as a repeating pattern; null paints untextured.
 */
export function paintRoad(ctx, { curve, style, tile }) {
  if (curve.length < 2) return;
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  for (const step of featherSteps(style.halfWidth, style.feather, ROAD_PAINT.featherSteps)) {
    strokeCurve(ctx, curve, css(style.edge), step.width, step.alpha);
  }

  if (style.kind === 'lane') {
    paintLaneCorridor(ctx, curve, style);
  } else {
    paintBed(ctx, curve, style, tile ? ctx.createPattern(tile, 'repeat') : null);
  }

  if (style.lane) paintLaneDashes(ctx, curve, style);
  ctx.restore();
}

// Seeded so a map's road texture is identical on every load and capture.
function makeTileCanvas(seed, style) {
  const size = ROAD_PAINT.tileSize;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const tctx = canvas.getContext('2d');
  if (!tctx) return null;
  const img = tctx.createImageData(size, size);
  img.data.set(noiseTile(seed, size, style));
  tctx.putImageData(img, 0, 0);
  return canvas;
}

/**
 * Bake the road for one map into a CanvasTexture under `key` (reused if it exists,
 * so replays never repaint). Returns the texture key.
 */
export function bakeRoad(scene, { key, waypoints, styleKey, seed, width, height }) {
  if (scene.textures.exists(key)) return key;
  const style = ROAD_STYLES[styleKey];
  // Throw before createCanvas so an unknown key never leaves a blank texture registered.
  if (!style) throw new Error(`bakeRoad: unknown road style "${styleKey}"`);
  const texture = scene.textures.createCanvas(key, width, height);
  const ctx = texture.getContext();
  // jsdom (tests) has no canvas 2D; the texture still exists, just blank.
  if (!ctx) return key;
  const curve = samplePath(waypoints, ROAD_CURVE_SAMPLES);
  paintRoad(ctx, { curve, style, tile: makeTileCanvas(seed, style) });
  texture.refresh();
  return key;
}
