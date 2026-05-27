import { describe, it, expect, vi } from 'vitest';
import { DamageNumberOverlay } from './DamageNumberOverlay.js';

function makeText() {
  return {
    setText: vi.fn(function (s) { this.text = s; return this; }),
    setStyle: vi.fn(function () { return this; }),
    setColor: vi.fn(function () { return this; }),
    setFontSize: vi.fn(function () { return this; }),
    setOrigin: vi.fn(function () { return this; }),
    setPosition: vi.fn(function (x, y) { this.x = x; this.y = y; return this; }),
    setAlpha: vi.fn(function (a) { this.alpha = a; return this; }),
    setVisible: vi.fn(function (v) { this.visible = v; return this; }),
    setActive: vi.fn(function (a) { this.active = a; return this; }),
    setStroke: vi.fn(function () { return this; }),
    setShadow: vi.fn(function () { return this; }),
    setDepth:  vi.fn(function () { return this; }),
  };
}

function makeScene() {
  const events = { handlers: {}, on(e, fn) { this.handlers[e] = fn; }, off() {}, emit(e, p) { if (this.handlers[e]) this.handlers[e](p); } };
  const tweens = { add: vi.fn(({ onComplete }) => { if (onComplete) onComplete(); return {}; }) };
  const add = { text: vi.fn(() => makeText()) };
  return { events, tweens, add };
}

describe('DamageNumberOverlay', () => {
  it('spawns a number for a crit regardless of amount', () => {
    const scene = makeScene();
    new DamageNumberOverlay(scene);
    scene.events.emit('damage-dealt', { target: { x: 100, y: 100 }, amount: 5, isCrit: true });
    expect(scene.add.text).toHaveBeenCalledTimes(1);
  });

  it('spawns a number for an AoE hit regardless of amount', () => {
    const scene = makeScene();
    new DamageNumberOverlay(scene);
    scene.events.emit('damage-dealt', { target: { x: 0, y: 0 }, amount: 4, isAoe: true, abilityLabel: 'AIRSTRIKE' });
    expect(scene.add.text).toHaveBeenCalledTimes(1);
  });

  it('spawns a number for damage >= 30', () => {
    const scene = makeScene();
    new DamageNumberOverlay(scene);
    scene.events.emit('damage-dealt', { target: { x: 0, y: 0 }, amount: 30 });
    expect(scene.add.text).toHaveBeenCalledTimes(1);
  });

  it('suppresses small non-crit non-AoE hits', () => {
    const scene = makeScene();
    new DamageNumberOverlay(scene);
    scene.events.emit('damage-dealt', { target: { x: 0, y: 0 }, amount: 8 });
    scene.events.emit('damage-dealt', { target: { x: 0, y: 0 }, amount: 29 });
    expect(scene.add.text).not.toHaveBeenCalled();
  });

  it('returns text objects to the pool after expiry (tween onComplete)', () => {
    const scene = makeScene();
    new DamageNumberOverlay(scene);
    for (let i = 0; i < 5; i++) {
      scene.events.emit('damage-dealt', { target: { x: 0, y: 0 }, amount: 50 });
    }
    expect(scene.add.text).toHaveBeenCalledTimes(1);
  });

  it('drops new spawns silently when all 24 pool slots are in flight', () => {
    const scene = makeScene();
    scene.tweens.add = vi.fn(() => ({}));
    new DamageNumberOverlay(scene);
    for (let i = 0; i < 30; i++) {
      scene.events.emit('damage-dealt', { target: { x: 0, y: 0 }, amount: 50 });
    }
    expect(scene.add.text).toHaveBeenCalledTimes(24);
  });
});
