import { TITLE, TITLE_PROMPT, STARS_TITLE } from '../data/title.js';
import { LAYOUT } from '../data/worldMap.js';
import { PALETTE, FONTS, FONT_FACES } from '../data/theme.js';
import { makeStars, advanceStars } from '../systems/starfield.js';
import { SpaceCanvas } from './SpaceCanvas.js';

// The CSS animations read these, so title.js stays the single source of timing.
const TIMING_VARS = {
  '--title-sweep-delay': TITLE.sweepDelayMs,
  '--title-sweep': TITLE.sweepMs,
  '--title-settle': TITLE.settleMs,
  '--title-prompt-delay': TITLE.promptDelayMs,
  '--title-pulse': TITLE.pulseMs,
};
const LIT_AFTER_SWEEP_MS = TITLE.sweepDelayMs + TITLE.sweepMs + TITLE.settleMs;

// The logo's face: the heading family at its registered weight.
const LOGO_FACE = FONT_FACES.find((f) => FONTS.heading.startsWith(`"${f.family}"`));
const LOGO_FONT = `${LOGO_FACE.weight} 1em ${LOGO_FACE.family}`;

const isStartKey = (e) => e.key === 'Enter' || e.key === ' ';

// #title-screen: drifting starfield, beam-sweep logo, pulsing prompt. One click
// or Enter/Space calls onStart once. data-phase: waiting -> sweep -> lit.
export class TitleScreen {
  constructor(root) {
    this._root = root;
    this._prompt = root.querySelector('.title-prompt');
    this._space = new SpaceCanvas(root.querySelector('canvas'), {
      maxDpr: LAYOUT.maxCanvasDpr,
      minFrameMs: STARS_TITLE.minFrameMs,
    });
    this._onStart = null;
    this._bound = false;
    this._motion = true;
    // Bumped by show/destroy so a font promise from an earlier show can't act.
    this._token = 0;
    this._fontTimer = 0;
    this._litTimer = 0;
    this._stars = [];
    this._starsW = 0;
    this._starsH = 0;
    this._clockMs = 0;
    this._onClick = this._onClick.bind(this);
    this._onKey = this._onKey.bind(this);
    this._drawStars = this._drawStars.bind(this);
  }

  show({ motion, pointerFine, onStart }) {
    const root = this._root;
    this._token++;
    this._onStart = onStart;
    this._motion = motion;
    this._clockMs = 0;
    for (const [name, ms] of Object.entries(TIMING_VARS)) root.style.setProperty(name, `${ms}ms`);
    root.classList.toggle('motion-off', !motion);
    root.classList.remove('title-sweep');
    this._prompt.textContent = pointerFine ? TITLE_PROMPT.fine : TITLE_PROMPT.coarse;
    root.style.display = 'block';
    this._bind();
    this._space.start(this._drawStars);
    if (!motion) {
      root.dataset.phase = 'lit';
      return;
    }
    // The dim "shadow" look doubles as the font wait, so the wait never shows.
    root.dataset.phase = 'waiting';
    this._awaitFont(this._token);
  }

  destroy() {
    this._token++;
    this._unbind();
    this._onStart = null;
    clearTimeout(this._fontTimer);
    clearTimeout(this._litTimer);
    this._fontTimer = 0;
    this._litTimer = 0;
    this._space.destroy();
    this._root.style.display = 'none';
  }

  _awaitFont(token) {
    const begin = () => {
      if (token !== this._token || this._root.dataset.phase !== 'waiting') return;
      clearTimeout(this._fontTimer);
      this._fontTimer = 0;
      this._beginSweep();
    };
    this._fontTimer = setTimeout(begin, TITLE.fontWaitMs);
    // Old WebViews have no document.fonts, and privacy modes can reject or throw;
    // every one of those still sweeps, on the fallback face.
    let loading;
    try {
      loading = document.fonts?.load(LOGO_FONT);
    } catch {
      loading = undefined;
    }
    Promise.resolve(loading).then(begin, begin);
  }

  _beginSweep() {
    this._root.dataset.phase = 'sweep';
    this._root.classList.add('title-sweep');
    this._litTimer = setTimeout(() => {
      this._litTimer = 0;
      this._root.dataset.phase = 'lit';
    }, LIT_AFTER_SWEEP_MS);
  }

  _bind() {
    if (this._bound) return;
    this._bound = true;
    this._root.addEventListener('click', this._onClick);
    document.addEventListener('keydown', this._onKey);
  }

  _unbind() {
    if (!this._bound) return;
    this._bound = false;
    this._root.removeEventListener('click', this._onClick);
    document.removeEventListener('keydown', this._onKey);
  }

  // Unbinds before calling out, so a second tap queued behind this one is a no-op.
  _start() {
    const onStart = this._onStart;
    if (!onStart) return;
    this._onStart = null;
    this._unbind();
    onStart();
  }

  _onClick() {
    this._start();
  }

  _onKey(e) {
    if (!isStartKey(e)) return;
    e.preventDefault();
    this._start();
  }

  _drawStars(ctx, dtMs, w, h) {
    const { layers, twinkle, seed } = STARS_TITLE;
    if (w !== this._starsW || h !== this._starsH) {
      this._stars = makeStars(seed, layers, w, h);
      this._starsW = w;
      this._starsH = h;
    }
    // Reduced motion: the same field, frozen.
    if (this._motion) {
      advanceStars(this._stars, dtMs, w, layers);
      this._clockMs += dtMs;
    }
    const spin = (this._clockMs / 1000) * twinkle.radPerS;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = PALETTE.text;
    for (const s of this._stars) {
      const layer = layers[s.layer];
      ctx.globalAlpha = layer.alpha * (1 - twinkle.depth + twinkle.depth * Math.sin(spin + s.phase));
      ctx.fillRect(s.x, s.y, layer.size, layer.size);
    }
    ctx.globalAlpha = 1;
  }
}
