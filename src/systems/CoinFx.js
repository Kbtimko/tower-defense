import { COIN_FLY, GOLD_POP } from '../data/juice.js';
import { arcPoint } from './juiceMath.js';
import { pageToGame } from './viewport.js';
import { pulseClass } from '../ui/pulse.js';

const PULSE_CLASS = 'gold-gain-pulse';

// Pooled gold feedback: a "+N" text at the kill and coins arcing to the HUD
// counter. Visual only — callers pass the reward they already earned.
export class CoinFx {
  constructor(scene) {
    this._scene = scene;
    this._to = { x: 0, y: 0 };
    this._pos = { x: 0, y: 0 };
    this._coins = [];
    for (let i = 0; i < COIN_FLY.maxLive; i++) {
      const img = scene.add.image(0, 0, 'fx-glow');
      img.setTint(COIN_FLY.color);
      img.setDisplaySize(COIN_FLY.size * 2, COIN_FLY.size * 2);
      img.setDepth(COIN_FLY.depth);
      img.setVisible(false);
      this._coins.push({ img, live: false, t: 0, from: { x: 0, y: 0 }, to: { x: 0, y: 0 } });
    }
    this._texts = [];
    for (let i = 0; i < GOLD_POP.maxLive; i++) {
      const txt = scene.add.text(0, 0, '', {
        fontSize: GOLD_POP.fontSize, color: GOLD_POP.color, stroke: '#000000', strokeThickness: 2,
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

  // HUD counter centre in game px, clamped onto the canvas: the counter sits
  // above the play area, so coins fly to the nearest edge point instead.
  _resolveTarget() {
    const el = this._hudEl();
    const to = this._to;
    const { width, height } = this._scene.scale;
    if (!el) { to.x = width / 2; to.y = 0; return to; }
    const r = el.getBoundingClientRect();
    const g = pageToGame(this._scene.scale, r.left + r.width / 2, r.top + r.height / 2);
    to.x = Math.min(width, Math.max(0, g.x));
    to.y = Math.min(height, Math.max(0, g.y));
    return to;
  }

  spawn(x, y, amount) {
    const text = this._texts.find((s) => !s.live);
    if (text) {
      text.live = true; text.t = 0; text.x = x; text.y = y;
      text.txt.setText(`+${amount}`);
      text.txt.setPosition(x, y);
      text.txt.setAlpha(1);
      text.txt.setVisible(true);
    }
    if (this._reduced()) {
      pulseClass(this._hudEl(), PULSE_CLASS);
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
    // Several coins landing in one frame still read as one pulse; restarting
    // the CSS animation per coin would force a style flush each time.
    let landed = false;
    for (const s of this._texts) {
      if (!s.live) continue;
      s.t += dt;
      const u = s.t / GOLD_POP.duration;
      if (u >= 1) { s.live = false; s.txt.setVisible(false); continue; }
      s.txt.setPosition(s.x, s.y - GOLD_POP.rise * u);
      s.txt.setAlpha(1 - u);
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
    if (landed) pulseClass(this._hudEl(), PULSE_CLASS);
  }

  destroy() {
    for (const c of this._coins) c.img.destroy();
    for (const s of this._texts) s.txt.destroy();
    this._coins = [];
    this._texts = [];
  }
}
