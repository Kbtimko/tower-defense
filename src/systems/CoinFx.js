import { COIN_FLY, GOLD_POP } from '../data/juice.js';
import { arcPoint } from './juiceMath.js';
import { pageToWorld } from './viewport.js';
import { WORLD_WIDTH, WORLD_HEIGHT, RAIL_WIDTH } from '../data/layout.js';
import { pulseClass } from '../ui/pulse.js';

const PULSE_CLASS = 'gold-gain-pulse';

// Pooled gold feedback: a "+N" text at the kill and coins arcing to the HUD
// counter. Visual only — callers pass the reward they already earned.
export class CoinFx {
  constructor(scene) {
    this._scene = scene;
    this._to = { x: 0, y: 0 };
    this._pos = { x: 0, y: 0 };
    this._clock = 0;
    this._lastPulse = -Infinity;
    // The HUD rect only changes between frames; measuring per spawn would force
    // a layout for every kill in a volley.
    this._targetFresh = false;
    this._coins = [];
    for (let i = 0; i < COIN_FLY.maxLive; i++) {
      const img = scene.add.image(0, 0, COIN_FLY.texture);
      img.setTint(COIN_FLY.color);
      img.setDisplaySize(COIN_FLY.size * 2, COIN_FLY.size * 2);
      img.setDepth(COIN_FLY.depth);
      img.setVisible(false);
      this._coins.push({ img, live: false, t: 0, from: { x: 0, y: 0 }, to: { x: 0, y: 0 } });
    }
    this._texts = [];
    for (let i = 0; i < GOLD_POP.maxLive; i++) {
      const txt = scene.add.text(0, 0, '', {
        fontSize: GOLD_POP.fontSize, color: GOLD_POP.color, stroke: GOLD_POP.stroke, strokeThickness: GOLD_POP.strokeThickness,
        fontStyle: GOLD_POP.fontStyle,
      });
      txt.setOrigin(0.5, 0.5);
      txt.setDepth(GOLD_POP.depth);
      txt.setVisible(false);
      this._texts.push({ txt, live: false, t: 0, x: 0, y: 0 });
    }
  }

  _reduced() {
    return this._scene.game.registry.get('ambientMotion') === false;
  }

  _hudEl() {
    return document.getElementById('stat-gold')?.parentElement ?? null;
  }

  // Restarting the CSS animation faster than it plays reads as jitter, not a pulse.
  _pulseHud() {
    if (this._clock - this._lastPulse < COIN_FLY.pulseGap) return;
    this._lastPulse = this._clock;
    pulseClass(this._hudEl(), PULSE_CLASS);
  }

  // HUD counter centre in world px, clamped onto the canvas (world x runs
  // -RAIL_WIDTH..WORLD_WIDTH + RAIL_WIDTH across it): a counter above the
  // canvas makes coins exit past the top rather than pile into a corner. The
  // main camera only draws the map viewport, so a coin bound for a rail is
  // clipped at the map edge — it reads as flying off toward the counter.
  _resolveTarget() {
    const to = this._to;
    if (this._targetFresh) return to;
    this._targetFresh = true;
    const el = this._hudEl();
    if (!el) { to.x = WORLD_WIDTH / 2; to.y = COIN_FLY.exitY; return to; }
    const r = el.getBoundingClientRect();
    const w = pageToWorld(this._scene.scale, r.left + r.width / 2, r.top + r.height / 2);
    const minX = -RAIL_WIDTH + COIN_FLY.edgeInset;
    const maxX = WORLD_WIDTH + RAIL_WIDTH - COIN_FLY.edgeInset;
    to.x = Math.min(maxX, Math.max(minX, w.x));
    to.y = w.y < 0 ? COIN_FLY.exitY : Math.min(WORLD_HEIGHT, w.y);
    return to;
  }

  spawn(x, y, amount) {
    const text = this._texts.find((s) => !s.live);
    if (text) {
      text.live = true; text.t = 0; text.x = x + GOLD_POP.offsetX; text.y = y + GOLD_POP.offsetY;
      text.txt.setText(`+${amount}`);
      text.txt.setPosition(text.x, text.y);
      text.txt.setAlpha(1);
      text.txt.setVisible(true);
    }
    if (this._reduced()) {
      this._pulseHud();
      return;
    }
    const to = this._resolveTarget();
    for (let i = 0; i < COIN_FLY.perKill; i++) {
      const coin = this._coins.find((c) => !c.live);
      if (!coin) break;
      coin.live = true;
      coin.t = -i * COIN_FLY.stagger; // negative = waiting its turn, hidden
      coin.from.x = x; coin.from.y = y;
      coin.to.x = to.x; coin.to.y = to.y;
    }
  }

  update(dt) {
    this._clock += dt;
    this._targetFresh = false;
    const reduced = this._reduced();
    // Several coins landing in one frame still read as one pulse; restarting
    // the CSS animation per coin would force a style flush each time.
    let landed = false;
    for (const s of this._texts) {
      if (!s.live) continue;
      s.t += dt;
      const u = s.t / GOLD_POP.duration;
      if (u >= 1) { s.live = false; s.txt.setVisible(false); continue; }
      s.txt.setPosition(s.x, reduced ? s.y : s.y - GOLD_POP.rise * u);
      s.txt.setAlpha(u < GOLD_POP.fadeStart ? 1 : 1 - (u - GOLD_POP.fadeStart) / (1 - GOLD_POP.fadeStart));
    }
    for (const c of this._coins) {
      if (!c.live) continue;
      c.t += dt;
      if (c.t < 0) continue;
      const u = c.t / COIN_FLY.duration;
      if (u >= 1) {
        c.live = false;
        c.img.setVisible(false);
        landed = true;
        continue;
      }
      arcPoint(u, c.from, c.to, COIN_FLY.arcHeight, this._pos);
      c.img.setPosition(this._pos.x, this._pos.y);
      c.img.setVisible(true);
    }
    if (landed) this._pulseHud();
  }

  destroy() {
    for (const c of this._coins) c.img.destroy();
    for (const s of this._texts) s.txt.destroy();
    this._coins = [];
    this._texts = [];
  }
}
