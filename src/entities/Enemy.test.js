vi.mock('phaser', () => ({
  default: {
    GameObjects: {
      Container: class {
        constructor(scene, x, y) { this.scene = scene; this.x = x; this.y = y; }
        add() {}
        setDepth() { return this; }
      }
    }
  }
}));

import { Enemy } from './Enemy.js';

const makeGraphics = () => ({
  clear() {}, fillStyle() {}, fillCircle() {}, fillRect() {},
  lineStyle() {}, strokeCircle() {}, strokeRect() {},
  fillEllipse() {}, fillPoints() {}, strokePoints() {},
  fillTriangle() {}, strokeTriangle() {}, strokeCircle() {},
  strokeRect() {}, setVisible(v) { this.visible = v; return this; },
  lineBetween() {}, // required by skitter branch in _redrawBody()
});

const makeScene = () => ({
  add: { graphics: makeGraphics, existing() {} },
});

const makeDef = () => ({
  hp: 100, speed: 80, armor: 0, reward: 10,
  radius: 10, color: 0x00ff00, type: 'drone', flying: false,
});

describe('Enemy stun', () => {
  it('applyStatus stun sets active and timer', () => {
    const e = new Enemy(makeScene(), { def: makeDef(), startX: 0, startY: 0 });
    e.applyStatus({ type: 'stun', duration: 3 });
    expect(e.statusEffects.stun.active).toBe(true);
    expect(e.statusEffects.stun.timer).toBe(3);
  });

  it('stun timer ticks down in update', () => {
    const e = new Enemy(makeScene(), { def: makeDef(), startX: 0, startY: 0 });
    e.applyStatus({ type: 'stun', duration: 3 });
    e.update(1);
    expect(e.statusEffects.stun.timer).toBeCloseTo(2);
  });

  it('stun clears when timer reaches 0', () => {
    const e = new Enemy(makeScene(), { def: makeDef(), startX: 0, startY: 0 });
    e.applyStatus({ type: 'stun', duration: 1 });
    e.update(1.5);
    expect(e.statusEffects.stun.active).toBe(false);
  });
});
