// Draws the world map's two canvases (spec 2.2, 4.2):
//   backdrop: the cached vista (far + near layers, rebuilt only on resize) with the
//             2-layer star drift between them, on a SpaceCanvas rAF loop
//   story:    haze, front line, hive glow, route/trail and the ship, redrawn by render()
// render() is idempotent and holds no game rules: the scene (and Task 9's arrival)
// hand it route params and px radii. Every method no-ops without a 2D context.
import { HAZE, TRAIL, SHIP, HIVE_CORE, STARS_MAP, TRANSPARENT } from '../data/worldMap.js';
import { PALETTE } from '../data/theme.js';
import { makeStars, advanceStars } from '../systems/starfield.js';
import { splitRoute } from '../systems/worldRoute.js';
import { SpaceCanvas } from './SpaceCanvas.js';
import { paintFar, paintNear, shortSide } from './worldVista.js';

const TAU = Math.PI * 2;

function polyline(ctx, pts) {
  ctx.beginPath();
  pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  ctx.stroke();
}

export class WorldMapRenderer {
  constructor({ backdrop, story, maxDpr, source, motion = () => true }) {
    this._space = new SpaceCanvas(backdrop, { maxDpr });
    this._story = story;
    this._storyCtx = story.getContext('2d');
    this._maxDpr = maxDpr;
    // Read every frame, so a Settings toggle on the map takes effect at once.
    this._motion = motion;
    this._frame = null;
    this._viewport = null;
    this._far = null;
    this._near = null;
    this._stars = [];
    this._state = null;
    this._painted = null;
    this._gold = PALETTE.currency;
    this._art = null;
    this._img = null;
    this._drawBackdrop = this._drawBackdrop.bind(this);
    if (source !== 'procedural' && this._storyCtx) this._loadArt(source);
  }

  resize(frame, viewport) {
    if (!this._storyCtx) return;
    this._frame = frame;
    this._viewport = viewport;
    this._gold = getComputedStyle(document.documentElement)
      .getPropertyValue(TRAIL.travelled.cssVar).trim() || PALETTE.currency;
    this._far = this._layer((ctx) => paintFar(ctx, viewport, this._art));
    this._near = this._layer((ctx) => paintNear(ctx, frame, viewport));
    this._stars = makeStars(STARS_MAP.seed, STARS_MAP.layers, viewport.width, viewport.height);
    this._painted = null;
    this._fitStory();
    this._space.start(this._drawBackdrop);
    if (this._state) this.render(this._state);
  }

  render(state) {
    this._state = state;
    const ctx = this._storyCtx;
    if (!ctx || !this._viewport) return;
    const { width, height } = this._viewport;
    ctx.clearRect(0, 0, width, height);
    const { points } = state;
    const hive = points[points.length - 1];
    if (state.frontR > 0 && state.frontAlpha > 0) this._drawHaze(ctx, hive, state.frontR, state.frontAlpha);
    this._drawHive(ctx, hive, state.hiveDim);
    this._drawRoute(ctx, points, state.trailT);
    this._drawShip(ctx, splitRoute(points, state.ship.param), state.ship.offset ?? 0);
  }

  destroy() {
    this._space.destroy();
    if (this._img) {
      this._img.onload = null;
      this._img = null;
    }
    this._state = null;
  }

  _dpr() {
    return Math.min(window.devicePixelRatio || 1, this._maxDpr);
  }

  // An offscreen canvas at the backing-store resolution, painted in CSS px.
  _layer(paint) {
    const dpr = this._dpr();
    const c = document.createElement('canvas');
    c.width = Math.round(this._viewport.width * dpr);
    c.height = Math.round(this._viewport.height * dpr);
    const ctx = c.getContext('2d');
    if (ctx) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      paint(ctx);
    }
    return c;
  }

  _fitStory() {
    const dpr = this._dpr();
    this._story.width = Math.round(this._viewport.width * dpr);
    this._story.height = Math.round(this._viewport.height * dpr);
    this._storyCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // Deferred art (spec 4.4) replaces only the far layer; until it loads, or if
  // it never does, the procedural far layer stays.
  _loadArt(url) {
    const img = new Image();
    img.onload = () => {
      this._art = img;
      if (this._viewport) {
        this._far = this._layer((ctx) => paintFar(ctx, this._viewport, img));
        this._painted = null;
      }
    };
    img.src = url;
    this._img = img;
  }

  // SpaceCanvas frame. With motion off the stars freeze and the canvas is only
  // repainted when its size or cached layers change.
  _drawBackdrop(ctx, dtMs, w, h) {
    if (!this._far) return;
    const moving = this._motion();
    if (!moving && this._painted && this._painted.w === w && this._painted.h === h) return;
    if (moving) advanceStars(this._stars, dtMs, w, STARS_MAP.layers);
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(this._far, 0, 0, w, h);
    ctx.fillStyle = PALETTE.text;
    for (const s of this._stars) {
      const layer = STARS_MAP.layers[s.layer];
      ctx.globalAlpha = layer.alpha;
      ctx.fillRect(s.x, s.y, layer.size, layer.size);
    }
    ctx.globalAlpha = 1;
    ctx.drawImage(this._near, 0, 0, w, h);
    this._painted = { w, h };
  }

  // Veth-held space: full haze inside the front line, feathered across it.
  _drawHaze(ctx, hive, frontR, alpha) {
    const { rgb: [r, g, b], maxAlpha, featherPx, front } = HAZE;
    const outer = frontR + featherPx / 2;
    const inner = Math.max(0, frontR - featherPx / 2);
    const fill = `rgba(${r},${g},${b},${maxAlpha * alpha})`;
    const grad = ctx.createRadialGradient(hive.x, hive.y, 0, hive.x, hive.y, outer);
    grad.addColorStop(0, fill);
    grad.addColorStop(inner / outer, fill);
    grad.addColorStop(1, TRANSPARENT);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, this._viewport.width, this._viewport.height);

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.setLineDash(front.dash);
    ctx.strokeStyle = front.color;
    ctx.lineWidth = front.width;
    ctx.beginPath();
    ctx.arc(hive.x, hive.y, frontR, 0, TAU);
    ctx.stroke();
    ctx.restore();
  }

  _drawHive(ctx, hive, dim) {
    const r = HIVE_CORE.r * shortSide(this._frame);
    const grad = ctx.createRadialGradient(hive.x, hive.y, 0, hive.x, hive.y, r);
    for (const [offset, color] of HIVE_CORE.stops) grad.addColorStop(offset, color);
    ctx.save();
    ctx.globalAlpha = 1 - (1 - HIVE_CORE.dimAlpha) * dim;
    ctx.fillStyle = grad;
    ctx.fillRect(hive.x - r, hive.y - r, r * 2, r * 2);
    ctx.restore();
  }

  // Gold where we've been, faint and dashed where we're going.
  _drawRoute(ctx, points, trailT) {
    const { head, tail } = splitRoute(points, trailT);
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.setLineDash(TRAIL.ahead.dash);
    ctx.strokeStyle = TRAIL.ahead.color;
    ctx.lineWidth = TRAIL.ahead.width;
    if (tail.length > 1) polyline(ctx, tail);
    ctx.setLineDash([]);
    ctx.strokeStyle = this._gold;
    ctx.lineWidth = TRAIL.travelled.width;
    if (head.length > 1) polyline(ctx, head);
    ctx.restore();
  }

  // A chevron hull pointing along the route, amber engine glow behind it; offset
  // (px, left normal) is where parkShip moved it off a crowded leg.
  _drawShip(ctx, { at, angle }, offset) {
    const s = SHIP.sizePx;
    ctx.save();
    ctx.translate(at.x - Math.sin(angle) * offset, at.y + Math.cos(angle) * offset);
    ctx.rotate(angle);
    const ex = SHIP.engineX * s;
    const er = SHIP.engineR * s;
    const glow = ctx.createRadialGradient(ex, 0, 0, ex, 0, er);
    glow.addColorStop(0, SHIP.engine);
    glow.addColorStop(1, TRANSPARENT);
    ctx.fillStyle = glow;
    ctx.fillRect(ex - er, -er, er * 2, er * 2);
    ctx.fillStyle = SHIP.hull;
    ctx.beginPath();
    SHIP.shape.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x * s, y * s) : ctx.lineTo(x * s, y * s)));
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}
