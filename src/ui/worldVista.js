// Procedural world-map vista, painted once per resize into the renderer's cached
// layers (spec 2.2, the approved world-map-vista mockup). Two layers so the
// deferred backdrop art can replace only the far one (spec 4.4):
//   far:  base gradient, nebulae, the fixed star field
//   near: sun glare, asteroid belt, planets, Earth
// All tunables live in src/data/worldMap.js; no text is drawn here.
import {
  SPACE_GRADIENT, NEBULAE, STARS_STATIC, SUN_GLARE, BELT, PLANETS, PLANET_STYLE, EARTH, ROUTE, TRANSPARENT,
} from '../data/worldMap.js';
import { SeededRandom } from '../systems/SeededRandom.js';

const TAU = Math.PI * 2;
const lerp = (a, b, t) => a + (b - a) * t;

export function shortSide(frame) {
  return Math.min(frame.w, frame.h);
}

export function framePoint(frame, [nx, ny]) {
  return { x: frame.x + nx * frame.w, y: frame.y + ny * frame.h };
}

// A radial wash from `color` to nothing, filling only its own bounding square.
export function radialWash(ctx, x, y, r, color, r0 = 0) {
  const g = ctx.createRadialGradient(x, y, r0, x, y, r);
  g.addColorStop(0, color);
  g.addColorStop(1, TRANSPARENT);
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
}

function disc(ctx, x, y, r) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
}

// object-fit: cover, so the art fills the viewport at any aspect.
function drawCover(ctx, img, w, h) {
  const s = Math.max(w / img.width, h / img.height);
  const dw = img.width * s;
  const dh = img.height * s;
  ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
}

export function paintFar(ctx, viewport, art) {
  const { width: w, height: h } = viewport;
  if (art) {
    drawCover(ctx, art, w, h);
    return;
  }
  const g = ctx.createLinearGradient(0, h, w, 0);
  for (const [offset, color] of SPACE_GRADIENT) g.addColorStop(offset, color);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  for (const n of NEBULAE) radialWash(ctx, n.x * w, n.y * h, n.r * w, n.color);

  const rng = new SeededRandom(STARS_STATIC.seed);
  const [a0, a1] = STARS_STATIC.alpha;
  const [s0, s1] = STARS_STATIC.sizePx;
  ctx.fillStyle = STARS_STATIC.color;
  for (let i = 0; i < STARS_STATIC.count; i++) {
    const z = rng.next();
    const size = lerp(s0, s1, z);
    ctx.globalAlpha = lerp(a0, a1, z);
    ctx.fillRect(rng.next() * w, rng.next() * h, size, size);
  }
  ctx.globalAlpha = 1;
}

function paintBelt(ctx, frame) {
  const rng = new SeededRandom(BELT.seed);
  const [from, to] = [framePoint(frame, BELT.from), framePoint(frame, BELT.to)];
  const [s0, s1] = BELT.sizePx;
  ctx.fillStyle = BELT.color;
  for (let i = 0; i < BELT.count; i++) {
    const t = rng.next();
    const jitter = (rng.next() - 0.5) * 2 * BELT.jitter * frame.h;
    disc(ctx, lerp(from.x, to.x, t), lerp(from.y, to.y, t) + jitter, lerp(s0, s1, rng.next()));
    ctx.fill();
  }
}

function ringHalf(ctx, x, y, r, color, start) {
  const { rx, ry, tilt, width } = PLANET_STYLE.ring;
  ctx.strokeStyle = color;
  ctx.lineWidth = r * width;
  ctx.beginPath();
  ctx.ellipse(x, y, r * rx, r * ry, tilt, start, start + Math.PI);
  ctx.stroke();
}

function paintCracks(ctx, x, y, r, color, rng) {
  const { count, width, from, to, sweep } = PLANET_STYLE.cracks;
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1, r * width);
  for (let i = 0; i < count; i++) {
    const a = rng.next() * TAU;
    ctx.beginPath();
    ctx.moveTo(x + Math.cos(a) * r * from, y + Math.sin(a) * r * from);
    ctx.lineTo(x + Math.cos(a + sweep) * r * to, y + Math.sin(a + sweep) * r * to);
    ctx.stroke();
  }
}

// The mockup's planet(): glow, back half of the ring, lit body, clipped bands,
// cracks, front half of the ring, then the night-side shade over the body.
function paintPlanet(ctx, p, frame, rng) {
  const { x, y } = framePoint(frame, [p.x, p.y]);
  const r = p.r * shortSide(frame);
  const [g0, g1] = PLANET_STYLE.glow;
  if (p.glow) radialWash(ctx, x, y, r * g1, p.glow, r * g0);
  if (p.ring) ringHalf(ctx, x, y, r, p.ring, Math.PI);

  const hl = PLANET_STYLE.highlight;
  const body = ctx.createRadialGradient(x - r * hl, y - r * hl, r * PLANET_STYLE.core, x, y, r);
  body.addColorStop(0, p.base[0]);
  body.addColorStop(1, p.base[1]);
  ctx.fillStyle = body;
  disc(ctx, x, y, r);
  ctx.fill();

  if (p.bands) {
    ctx.save();
    disc(ctx, x, y, r);
    ctx.clip();
    for (const [dy, h, color] of p.bands) {
      ctx.fillStyle = color;
      ctx.fillRect(x - r, y + dy * r, r * 2, h * r);
    }
    ctx.restore();
  }
  if (p.cracks) paintCracks(ctx, x, y, r, p.cracks, rng);
  if (p.ring) ringHalf(ctx, x, y, r, p.ring, 0);

  const { from, color } = PLANET_STYLE.night;
  const shade = ctx.createLinearGradient(x - r, y - r, x + r, y + r);
  shade.addColorStop(from, TRANSPARENT);
  shade.addColorStop(1, color);
  ctx.fillStyle = shade;
  disc(ctx, x, y, r);
  ctx.fill();
}

function paintEarth(ctx, frame) {
  const { x, y } = framePoint(frame, ROUTE.earth);
  const r = EARTH.r * shortSide(frame);
  const [g0, g1] = PLANET_STYLE.glow;
  radialWash(ctx, x, y, r * g1, EARTH.glow, r * g0);
  const hl = PLANET_STYLE.highlight;
  const body = ctx.createRadialGradient(x - r * hl, y - r * hl, 0, x, y, r);
  for (const [offset, color] of EARTH.stops) body.addColorStop(offset, color);
  ctx.fillStyle = body;
  disc(ctx, x, y, r);
  ctx.fill();
}

export function paintNear(ctx, frame, viewport) {
  const earth = framePoint(frame, ROUTE.earth);
  const [ox, oy] = SUN_GLARE.offset;
  radialWash(ctx, earth.x + ox * viewport.width, earth.y + oy * viewport.height,
    SUN_GLARE.r * viewport.width, SUN_GLARE.color);
  paintBelt(ctx, frame);
  const rng = new SeededRandom(PLANET_STYLE.cracks.seed);
  for (const p of PLANETS) paintPlanet(ctx, p, frame, rng);
  paintEarth(ctx, frame);
}
