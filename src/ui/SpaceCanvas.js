// A viewport-sized 2D canvas behind a DOM screen (title, world map). Not Phaser:
// the Phaser canvas is FIT-letterboxed, and these backdrops must fill the viewport.
// The draw callback works in CSS px; the backing store is scaled by a capped DPR.
export class SpaceCanvas {
  constructor(canvas, { maxDpr }) {
    this._canvas = canvas;
    this._maxDpr = maxDpr;
    // null in jsdom (no canvas package): every method then no-ops so scene tests run.
    this._ctx = canvas.getContext('2d');
    this._draw = null;
    this._raf = 0;
    this._last = null;
    this._w = 0;
    this._h = 0;
    this._dpr = 0;
    this._tick = this._tick.bind(this);
    this._onVisibility = this._onVisibility.bind(this);
  }

  start(draw) {
    if (!this._ctx || this._draw) return;
    this._draw = draw;
    document.addEventListener('visibilitychange', this._onVisibility);
    if (!document.hidden) this._schedule();
  }

  // One frame with dt 0, for static (reduced-motion) paints and re-layouts.
  redraw() {
    if (!this._ctx || !this._draw) return;
    this._fit();
    this._draw(this._ctx, 0, this._w, this._h);
  }

  destroy() {
    if (!this._draw) return;
    this._stop();
    document.removeEventListener('visibilitychange', this._onVisibility);
    this._draw = null;
  }

  _schedule() {
    this._raf = requestAnimationFrame(this._tick);
  }

  _stop() {
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = 0;
    // A resume starts from dt 0 rather than replaying the whole hidden gap.
    this._last = null;
  }

  _tick(now) {
    this._raf = 0;
    if (!this._draw) return;
    const dt = this._last === null ? 0 : now - this._last;
    this._last = now;
    this._fit();
    this._draw(this._ctx, dt, this._w, this._h);
    this._schedule();
  }

  _onVisibility() {
    if (document.hidden) this._stop();
    else if (!this._raf) this._schedule();
  }

  // Polled per frame instead of a resize listener: it also catches box changes
  // that fire no window resize (safe-area insets settling, fullscreen toggles).
  _fit() {
    const dpr = Math.min(window.devicePixelRatio || 1, this._maxDpr);
    const w = this._canvas.clientWidth;
    const h = this._canvas.clientHeight;
    if (w === this._w && h === this._h && dpr === this._dpr) return;
    this._w = w;
    this._h = h;
    this._dpr = dpr;
    this._canvas.width = Math.round(w * dpr);
    this._canvas.height = Math.round(h * dpr);
    this._ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
}
