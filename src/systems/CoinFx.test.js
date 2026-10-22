// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CoinFx } from './CoinFx.js';
import { COIN_FLY, GOLD_POP } from '../data/juice.js';

function stubScene(reduced = false) {
  const made = { images: [], texts: [] };
  const mk = () => {
    const o = { x: 0, y: 0, visible: false, destroyed: false, setText: vi.fn(function (t) { this.text = t; return this; }) };
    for (const m of ['setTint', 'setDisplaySize', 'setDepth', 'setOrigin', 'setAlpha']) o[m] = vi.fn(() => o);
    o.setVisible = vi.fn((v) => { o.visible = v; return o; });
    o.setPosition = vi.fn((x, y) => { o.x = x; o.y = y; return o; });
    o.destroy = vi.fn(() => { o.destroyed = true; });
    return o;
  };
  return {
    made,
    add: {
      image: vi.fn(() => { const o = mk(); made.images.push(o); return o; }),
      text: vi.fn(() => { const o = mk(); made.texts.push(o); return o; }),
    },
    scale: { width: 1000, height: 600, canvasBounds: { x: 0, y: 0 }, displayScale: { x: 1, y: 1 } },
    game: { registry: { get: (k) => (k === 'ambientMotion' ? !reduced : undefined) } },
  };
}

let stat;
beforeEach(() => {
  document.body.innerHTML = '<div class="hud-stat"><span id="stat-gold">1</span></div>';
  stat = document.querySelector('.hud-stat');
  // HUD centre at page (500, -20): above the canvas, so it must clamp to y=0.
  stat.getBoundingClientRect = () => ({ left: 480, top: -30, width: 40, height: 20 });
});

describe('CoinFx', () => {
  const LAND = COIN_FLY.duration + COIN_FLY.stagger * COIN_FLY.perKill + 0.01;

  it('returns landed coins to the pool so later kills fly again', () => {
    const s = stubScene();
    const fx = new CoinFx(s);
    // More sequential kills than the pool holds: only recycling survives this.
    for (let i = 0; i < COIN_FLY.maxLive; i++) { fx.spawn(0, 0, 1); fx.update(LAND); }
    expect(s.made.images.some((i) => i.visible)).toBe(false);
    fx.spawn(50, 60, 1);
    fx.update(COIN_FLY.duration / 4);
    const flying = s.made.images.filter((i) => i.visible);
    expect(flying.length).toBeGreaterThan(0);
    const x0 = flying[0].x;
    fx.update(0.05);
    expect(flying[0].x).not.toBe(x0);
  });

  it('refills a full coin pool after everything lands', () => {
    const s = stubScene();
    const fx = new CoinFx(s);
    const kills = COIN_FLY.maxLive / COIN_FLY.perKill;
    for (let i = 0; i < kills; i++) fx.spawn(0, 0, 1);
    fx.update(LAND * 2);
    expect(s.made.images.some((i) => i.visible)).toBe(false);
    fx.spawn(0, 0, 1);
    fx.update(COIN_FLY.duration / 4);
    expect(s.made.images.filter((i) => i.visible).length).toBeGreaterThan(0);
  });

  it('pulses the HUD once per update however many coins land', () => {
    const s = stubScene();
    const fx = new CoinFx(s);
    fx.spawn(0, 0, 1);
    fx.spawn(0, 0, 1);
    const add = vi.spyOn(stat.classList, 'add');
    fx.update(LAND);
    expect(add).toHaveBeenCalledTimes(1);
  });

  it('creates pools once, sized from the tunables', () => {
    const s = stubScene();
    const fx = new CoinFx(s);
    expect(s.made.images).toHaveLength(COIN_FLY.maxLive);
    expect(s.made.texts).toHaveLength(GOLD_POP.maxLive);
    for (let i = 0; i < 50; i++) { fx.spawn(10, 10, 5); fx.update(0.1); }
    expect(s.made.images).toHaveLength(COIN_FLY.maxLive);
    expect(s.made.texts).toHaveLength(GOLD_POP.maxLive);
  });

  it('shows +amount text and reuses the object with setText', () => {
    const s = stubScene();
    const fx = new CoinFx(s);
    fx.spawn(100, 200, 7);
    const t = s.made.texts[0];
    expect(t.text).toBe('+7');
    expect(t.visible).toBe(true);
    fx.update(GOLD_POP.duration + 0.01);
    expect(t.visible).toBe(false);
    fx.spawn(5, 5, 9);
    expect(t.text).toBe('+9');
    expect(t.setText).toHaveBeenCalledTimes(2);
  });

  it('skips coins when the coin pool is exhausted but still shows text', () => {
    const s = stubScene();
    const fx = new CoinFx(s);
    for (let i = 0; i < COIN_FLY.maxLive / COIN_FLY.perKill; i++) fx.spawn(0, 0, 1);
    fx.update(0.001);
    fx.update(COIN_FLY.stagger * 2); // reveal every staggered coin
    const text = s.made.texts.find((t) => !t.visible);
    fx.spawn(1, 1, 3);
    expect(text.visible).toBe(true);
    expect(s.made.images.filter((i) => i.visible)).toHaveLength(COIN_FLY.maxLive);
  });

  it('skips both silently when neither pool has room', () => {
    const s = stubScene();
    const fx = new CoinFx(s);
    for (let i = 0; i < GOLD_POP.maxLive + 5; i++) fx.spawn(0, 0, 1);
    expect(() => fx.spawn(0, 0, 1)).not.toThrow();
  });

  it('arcs coins from the kill to the clamped HUD target and pulses on arrival', () => {
    const s = stubScene();
    const fx = new CoinFx(s);
    fx.spawn(100, 300, 4);
    const coin = s.made.images[0];
    fx.update(COIN_FLY.duration / 2);
    // Midpoint: x halfway to 500, y on the arc above the straight line.
    expect(coin.x).toBeCloseTo(300);
    expect(coin.y).toBeCloseTo(150 - COIN_FLY.arcHeight);
    expect(stat.classList.contains('gold-gain-pulse')).toBe(false);
    fx.update(COIN_FLY.duration / 2 + 0.001);
    expect(coin.visible).toBe(false);
    expect(stat.classList.contains('gold-gain-pulse')).toBe(true);
  });

  it('staggers the coins of one kill', () => {
    const s = stubScene();
    const fx = new CoinFx(s);
    fx.spawn(0, 0, 1);
    fx.update(0.01);
    expect(s.made.images.filter((i) => i.visible)).toHaveLength(1);
  });

  it('reduced motion: text and HUD pulse only, no coins', () => {
    const s = stubScene(true);
    const fx = new CoinFx(s);
    fx.spawn(10, 10, 6);
    fx.update(0.1);
    expect(s.made.texts[0].text).toBe('+6');
    expect(s.made.images.some((i) => i.visible)).toBe(false);
    expect(stat.classList.contains('gold-gain-pulse')).toBe(true);
  });

  it('destroy releases every pooled object', () => {
    const s = stubScene();
    const fx = new CoinFx(s);
    fx.destroy();
    expect([...s.made.images, ...s.made.texts].every((o) => o.destroyed)).toBe(true);
  });
});
