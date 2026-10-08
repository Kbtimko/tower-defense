// Hero and soldier HP bars. They used hard-coded pixel boxes from the old
// Graphics bodies, so once sprite art landed the hero's 16x2 bar sat across
// its own head and the soldier's 14x2 green bar vanished against green art —
// the defect PR #68 fixed for enemies. These pin the shared geometry.

vi.mock('phaser', () => ({
  default: {
    GameObjects: {
      Container: class {
        constructor(scene, x, y) { this.scene = scene; this.x = x ?? 0; this.y = y ?? 0; this.visible = true; }
        add() {}
        setDepth() { return this; }
        setVisible(v) { this.visible = v; return this; }
      },
    },
  },
}));

import { describe, it, expect, vi } from 'vitest';
import { Hero } from './Hero.js';
import { Soldier } from './Soldier.js';

// Records every fillRect with the fill colour in force when it was drawn.
function recordingGraphics() {
  const g = { rects: [], _color: null, _alpha: 1 };
  Object.assign(g, {
    clear() { g.rects.length = 0; },
    fillStyle(c, a = 1) { g._color = c; g._alpha = a; },
    fillRect(x, y, w, h) { g.rects.push({ x, y, w, h, color: g._color, alpha: g._alpha }); },
    fillCircle() {}, lineStyle() {}, strokeCircle() {}, strokeRect() {},
    setVisible() { return g; },
  });
  return g;
}
const scene = () => ({
  add: { graphics: recordingGraphics, existing() {} },
  events: { emit() {} },
});

const makeHero = () => new Hero(scene(), { x: 0, y: 0 });
const makeSoldier = () => new Soldier(scene(), {
  barracks: { level: 1, branch: null },
  pathProgress: 0,
  pathPoints: [{ x: 0, y: 0 }, { x: 10, y: 0 }],
  soldierStats: { hp: 50, damage: 5, respawnDuration: 8, canBlockFlyers: false },
});

// Real rendered sizes: 64px cell x 0.76, 48px cell x 0.36 (src/data/sprites.js).
const HERO_ART    = { width: 48.64, height: 48.64 };
const SOLDIER_ART = { width: 17.28, height: 17.28 };
const withArt = (e, size) => { e._sprite = { active: true, getDisplaySize: () => size }; return e; };

const damage = (e) => { e.hp = e.maxHp * 0.6; e._redrawHpBar(); return e._hpBar.rects; };
const frame = (rects) => rects[1];            // [outline, track, fill]
const fill  = (rects) => rects[rects.length - 1];

for (const [name, make, art, fallbackTop] of [
  ['hero', makeHero, HERO_ART, -22],
  ['soldier', makeSoldier, SOLDIER_ART, -17],
]) {
  describe(`${name} HP bar`, () => {
    it('sits entirely above the rendered sprite', () => {
      const rects = damage(withArt(make(), art));
      for (const r of rects) expect(r.y + r.h).toBeLessThanOrEqual(-art.height / 2);
    });

    it('is at least as wide as 80% of the sprite, centred', () => {
      const t = frame(damage(withArt(make(), art)));
      expect(t.w).toBeGreaterThanOrEqual(art.width * 0.8 - 1e-9);
      expect(t.x).toBeCloseTo(-t.w / 2);
    });

    it('keeps its old position when no art is registered', () => {
      expect(frame(damage(make())).y).toBe(fallbackTop);
    });

    it('is 3px tall and outlined in black so it reads against same-coloured art', () => {
      const rects = damage(withArt(make(), art));
      expect(frame(rects).h).toBe(3);
      expect(rects[0].color).toBe(0x000000);
      expect(rects[0].alpha).toBeGreaterThanOrEqual(0.5);
      expect(rects[0].w).toBe(frame(rects).w + 2);
    });

    it('shows a first point of damage', () => {
      const e = withArt(make(), art);
      e.hp = e.maxHp - 0.01;
      e._redrawHpBar();
      const rects = e._hpBar.rects;
      expect(frame(rects).w - fill(rects).w).toBeGreaterThanOrEqual(1);
    });

    it('draws nothing at full health', () => {
      const e = withArt(make(), art);
      e._redrawHpBar();
      expect(e._hpBar.rects).toEqual([]);
    });
  });
}
