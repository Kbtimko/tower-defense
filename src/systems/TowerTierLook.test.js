import { describe, it, expect } from 'vitest';
import { TowerTierLook } from './TowerTierLook.js';
import { EntitySprite } from './EntitySprite.js';
import {
  TIER_CORE, TIER_EMBERS, TIER_PIPS, TIER_FALLBACK_GROUND, towerAccent,
} from '../data/tierLooks.js';
import { emberPose } from './tierLookMath.js';
import { hexToInt } from '../ui/theme.js';
import { FONTS } from '../data/theme.js';

// Only real Phaser Graphics methods; anything else throws, as Phaser would.
const VALID_GFX_METHODS = new Set([
  'clear', 'fillStyle', 'lineStyle', 'fillCircle', 'strokeCircle',
  'fillRoundedRect', 'strokeRoundedRect', 'destroy',
]);

function makeGfx() {
  const calls = [];
  const stored = { kind: 'graphics', destroyed: false, visible: true };
  const proxy = new Proxy(stored, {
    get(t, prop) {
      if (prop in t) return t[prop];
      if (typeof prop === 'symbol') return undefined;
      if (!VALID_GFX_METHODS.has(prop)) {
        throw new TypeError(`Mock Graphics: '${prop}' is not a Phaser.GameObjects.Graphics method`);
      }
      return (...args) => {
        if (prop === 'destroy') t.destroyed = true;
        if (prop === 'clear') calls.length = 0;
        calls.push({ method: prop, args });
        return proxy;
      };
    },
  });
  proxy._calls = () => calls;
  return proxy;
}

function makeImage(key) {
  return {
    kind: 'image', key, x: 0, y: 0, alpha: 1, visible: true, tint: null, blendMode: 0,
    displayWidth: 0, displayHeight: 0, destroyed: false,
    setTint(c) { this.tint = c; return this; },
    setBlendMode(m) { this.blendMode = m; return this; },
    setDisplaySize(w, h) { this.displayWidth = w; this.displayHeight = h; return this; },
    setPosition(x, y) { this.x = x; this.y = y; return this; },
    setAlpha(a) { this.alpha = a; return this; },
    setVisible(v) { this.visible = v; return this; },
    destroy() { this.destroyed = true; },
  };
}

function makeText(x, y, text, style) {
  return {
    kind: 'text', x, y, text, style, originX: 0, originY: 0, visible: true, destroyed: false,
    setOrigin(ox, oy = ox) { this.originX = ox; this.originY = oy; return this; },
    setText(t) { this.text = t; return this; },
    setPosition(px, py) { this.x = px; this.y = py; return this; },
    setVisible(v) { this.visible = v; return this; },
    destroy() { this.destroyed = true; },
  };
}

function makeScene() {
  const made = { image: 0, graphics: 0, text: 0 };
  const scene = {
    made,
    game: { registry: { get: () => [] } },
    add: {
      image: (x, y, key) => { made.image++; return makeImage(key).setPosition(x, y); },
      graphics: () => { made.graphics++; return makeGfx(); },
      text: (x, y, text, style) => { made.text++; return makeText(x, y, text, style); },
    },
  };
  return scene;
}

function makeContainer() {
  const SPRITE = { kind: 'sprite', destroyed: false };
  return {
    SPRITE,
    list: [SPRITE],
    add(o) { this.list.push(o); return this; },
    live(kind) { return this.list.filter((o) => !o.destroyed && (!kind || o.kind === kind)); },
  };
}

// Stand-in for an active EntitySprite at some tier scale.
const fakeSprite = (ground, pivot) => ({ groundSpec: () => ground, pivotOffsetY: () => pivot });

function build({ type = 'archer', sprite } = {}) {
  const scene = makeScene();
  const container = makeContainer();
  const look = new TowerTierLook(container, scene, {
    type, sprite: sprite ?? fakeSprite(null, 0),
  });
  return { scene, container, look };
}

const pipsGfx = (container) => container.live('graphics')[0];
const fillCircles = (gfx) => gfx._calls().filter((c) => c.method === 'fillCircle');

describe('TowerTierLook', () => {
  it('E1: T1 is one pip and nothing else', () => {
    const { container, look } = build();
    look.setTier(1);
    expect(container.live('image')).toHaveLength(0);
    expect(container.live('text')).toHaveLength(0);
    expect(fillCircles(pipsGfx(container))).toHaveLength(1);
    expect(look.snapshot()).toEqual({ core: false, embers: 0, emberDy: [], pips: 1 });
  });

  it('E2: T2 adds the core (glow + hot dot); T3 adds the embers', () => {
    const { container, look } = build();
    look.setTier(2);
    expect(container.live('image')).toHaveLength(2);
    expect(fillCircles(pipsGfx(container))).toHaveLength(2);
    expect(look.snapshot()).toMatchObject({ core: true, embers: 0, pips: 2 });

    look.setTier(3);
    expect(container.live('image')).toHaveLength(2 + TIER_EMBERS.count);
    expect(fillCircles(pipsGfx(container))).toHaveLength(3);
    expect(look.snapshot()).toMatchObject({ core: true, embers: 3, pips: 3 });
    expect(look.snapshot().emberDy).toHaveLength(3);
  });

  it('core and embers are fx textures, ADD blend, tinted with the accent (hot dot white)', () => {
    const { container, look } = build({ type: 'mage' });
    look.setTier(3);
    const imgs = container.live('image');
    const accent = towerAccent('mage');
    for (const img of imgs) expect(img.blendMode).toBe(1);
    expect(imgs.filter((i) => i.key === 'fx-glow')).toHaveLength(1);
    expect(imgs.filter((i) => i.key === 'fx-ember')).toHaveLength(1 + TIER_EMBERS.count);
    expect(imgs.find((i) => i.key === 'fx-glow').tint).toBe(accent);
    expect(imgs.filter((i) => i.key === 'fx-ember' && i.tint === accent)).toHaveLength(TIER_EMBERS.count);
    expect(imgs.filter((i) => i.key === 'fx-ember' && i.tint === null)).toHaveLength(1);
    for (const e of imgs.filter((i) => i.tint === accent && i.key === 'fx-ember')) {
      expect(e.displayWidth).toBe(TIER_EMBERS.sizePx);
      expect(e.displayHeight).toBe(TIER_EMBERS.sizePx);
    }
  });

  it('E3: T4 B shows the B badge instead of dots, with core and embers', () => {
    const { container, look } = build({ type: 'cannon' });
    look.setTier(4, 'B');
    const texts = container.live('text');
    expect(texts).toHaveLength(1);
    expect(texts[0].text).toBe('B');
    expect(texts[0].style).toMatchObject({
      fontFamily: FONTS.body, fontStyle: 'bold',
      fontSize: `${TIER_PIPS.badge.fontPx}px`, color: TIER_PIPS.badge.ink,
    });
    const gfx = pipsGfx(container);
    expect(fillCircles(gfx)).toHaveLength(0);
    const rect = gfx._calls().find((c) => c.method === 'fillRoundedRect');
    expect(rect).toBeTruthy();
    const fills = gfx._calls().filter((c) => c.method === 'fillStyle').map((c) => c.args[0]);
    expect(fills).toContain(towerAccent('cannon'));
    expect(container.live('image')).toHaveLength(2 + TIER_EMBERS.count);
    expect(look.snapshot()).toMatchObject({ core: true, embers: 3, pips: 'B' });
  });

  it('badge centres on the pip row', () => {
    const { container, look } = build();
    look.setTier(4, 'A');
    const y = TIER_PIPS.minY + TIER_PIPS.gapBelowFootPx;
    const text = container.live('text')[0];
    expect(text.x).toBe(0);
    expect(text.y).toBe(y);
    expect([text.originX, text.originY]).toEqual([0.5, 0.5]);
    const [rx, ry, rw, rh] = pipsGfx(container)._calls().find((c) => c.method === 'fillRoundedRect').args;
    expect(rx + rw / 2).toBeCloseTo(0);
    expect(ry + rh / 2).toBeCloseTo(y);
  });

  it('T4 straight from T1 equals the T4 set, and setTier is idempotent', () => {
    const a = build();
    a.look.setTier(1);
    a.look.setTier(4, 'A');
    const b = build();
    b.look.setTier(2); b.look.setTier(3); b.look.setTier(4, 'A');
    expect(a.look.snapshot()).toEqual(b.look.snapshot());
    expect(a.container.live('image')).toHaveLength(b.container.live('image').length);

    const before = a.container.live().length;
    const made = { ...a.scene.made };
    a.look.setTier(4, 'A');
    expect(a.container.live().length).toBe(before);
    expect(a.container.live('text')).toHaveLength(1);
    expect(a.scene.made).toEqual(made);
  });

  it('destroys the marks a lower tier no longer needs', () => {
    const { container, look } = build();
    look.setTier(4, 'B');
    look.setTier(1);
    expect(container.live('image')).toHaveLength(0);
    expect(container.live('text')).toHaveLength(0);
    expect(fillCircles(pipsGfx(container))).toHaveLength(1);
    expect(look.snapshot()).toEqual({ core: false, embers: 0, emberDy: [], pips: 1 });
  });

  it('marks are added after the sprite (drawn on top)', () => {
    const { container, look } = build();
    look.setTier(4, 'A');
    expect(container.list[0]).toBe(container.SPRITE);
    expect(container.list.length).toBeGreaterThan(1);
  });

  it('pip row: fallback (inactive sprite) sits at minY + gap', () => {
    const scene = makeScene();
    const container = makeContainer();
    container.addAt = () => {};
    const sprite = new EntitySprite(container, scene, { category: 'tower', type: 'archer' });
    expect(sprite.active).toBe(false);
    const look = new TowerTierLook(container, scene, { type: 'archer', sprite });
    look.setTier(1);
    expect(look.ground()).toEqual(TIER_FALLBACK_GROUND);
    expect(look.centreY()).toBe(0);
    const [, y] = fillCircles(pipsGfx(container))[0].args;
    expect(y).toBe(22 + 4);
  });

  it('pip row: art foot below the pad rim sits at footY + gap', () => {
    const { container, look } = build({ sprite: fakeSprite({ footY: 41.2, width: 50, height: 115 }, -16.5) });
    look.setTier(3);
    const ys = fillCircles(pipsGfx(container)).map((c) => c.args[1]);
    for (const y of ys) expect(y).toBeCloseTo(45.2);
  });

  it('dots are centred on x = 0, accent filled, outlined in the panel colour', () => {
    const { container, look } = build({ type: 'sniper' });
    look.setTier(3);
    const gfx = pipsGfx(container);
    const xs = fillCircles(gfx).map((c) => c.args[0]);
    expect(xs.reduce((s, x) => s + x, 0)).toBeCloseTo(0);
    expect(new Set(xs).size).toBe(3);
    for (const c of fillCircles(gfx)) expect(c.args[2]).toBe(TIER_PIPS.radius);
    const fills = gfx._calls().filter((c) => c.method === 'fillStyle').map((c) => c.args[0]);
    expect(fills).toContain(towerAccent('sniper'));
    const line = gfx._calls().find((c) => c.method === 'lineStyle');
    expect(line.args.slice(0, 2)).toEqual([TIER_PIPS.outlinePx, hexToInt(TIER_PIPS.outline)]);
    expect(gfx._calls().filter((c) => c.method === 'strokeCircle')).toHaveLength(3);
  });

  it('core sits on the drawn centre at sizeFrac of the ground width', () => {
    const ground = { footY: 41.2, width: 50, height: 115 };
    const { container, look } = build({ sprite: fakeSprite(ground, -16.5) });
    look.setTier(2);
    const glow = container.live('image').find((i) => i.key === 'fx-glow');
    const hot = container.live('image').find((i) => i.key === 'fx-ember');
    expect([glow.x, glow.y]).toEqual([0, -16.5]);
    expect([hot.x, hot.y]).toEqual([0, -16.5]);
    const size = TIER_CORE.sizeFrac * ground.width;
    expect(glow.displayWidth).toBeCloseTo(size);
    expect(hot.displayWidth).toBeCloseTo(TIER_CORE.hotFrac * size);
  });

  it('re-reads the ground in setTier (tier scale changed under it)', () => {
    let ground = { footY: 40, width: 40, height: 80 };
    let pivot = -4.8;
    const sprite = { groundSpec: () => ground, pivotOffsetY: () => pivot };
    const { container, look } = build({ sprite });
    look.setTier(2);
    ground = { footY: 40, width: 50, height: 100 };
    pivot = -10;
    look.setTier(3);
    const glow = container.live('image').find((i) => i.key === 'fx-glow');
    expect(glow.y).toBe(-10);
    expect(glow.displayWidth).toBeCloseTo(TIER_CORE.sizeFrac * 50);
  });

  it('updateLook allocates nothing; reduced motion holds the still pose, all visible', () => {
    const { scene, container, look } = build();
    look.setTier(4, 'A');
    const made = { ...scene.made };
    const count = container.list.length;
    for (let i = 0; i < 100; i++) look.updateLook(i * 0.016, false);
    expect(scene.made).toEqual(made);
    expect(container.list.length).toBe(count);

    look.updateLook(3.3, true);
    const imgs = container.live('image');
    const core = imgs.filter((i) => i.key === 'fx-glow' || i.tint === null);
    const embers = imgs.filter((i) => i.key === 'fx-ember' && i.tint !== null);
    for (const c of core) expect(c.alpha).toBe(TIER_CORE.stillAlpha);
    embers.forEach((e, i) => {
      const still = emberPose(0, i, TIER_EMBERS, TIER_FALLBACK_GROUND, true);
      expect(e.alpha).toBe(TIER_EMBERS.stillAlpha);
      expect(e.x).toBeCloseTo(still.dx);
      expect(e.y).toBeCloseTo(still.dy);
    });
    expect(look.snapshot().emberDy.map((y) => +y.toFixed(6)))
      .toEqual(embers.map((e) => +e.y.toFixed(6)));
    for (const o of container.live()) if (o !== container.SPRITE) expect(o.visible).toBe(true);
  });

  it('updateLook animates: core alpha pulses and embers move over time', () => {
    const { container, look } = build();
    look.setTier(3);
    look.updateLook(0, false);
    const glow = container.live('image').find((i) => i.key === 'fx-glow');
    const a0 = glow.alpha;
    const y0 = look.snapshot().emberDy;
    look.updateLook(TIER_CORE.periodS / 2, false);
    expect(glow.alpha).not.toBe(a0);
    expect(look.snapshot().emberDy).not.toEqual(y0);
  });
});
