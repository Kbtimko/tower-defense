vi.mock('phaser', () => ({
  default: {
    GameObjects: {
      Container: class {
        constructor(scene, x, y) {
          this.scene = scene; this.x = x; this.y = y;
          this.visible = true;
        }
        add() {}
        setDepth() { return this; }
        setVisible(v) { this.visible = v; return this; }
      }
    }
  }
}));

import { Hero } from './Hero.js';

const makeGraphics = () => ({
  clear() {}, fillStyle() {}, fillCircle() {}, fillRect() {},
  lineStyle() {}, strokeCircle() {}, strokeRect() {},
  setVisible(v) { this.visible = v; return this; },
});

const makeScene = () => {
  const emitted = [];
  return {
    add: { graphics: makeGraphics, existing() {} },
    events: {
      emitted,
      emit(event, data) { this.emitted.push({ event, data }); },
    },
  };
};

const makeEnemy = (x, y, hp = 50) => ({
  x, y, hp, dead: false,
  takeDamage(amount) {
    this.hp = Math.max(0, this.hp - amount);
    if (this.hp <= 0) { this.hp = 0; this.dead = true; }
  },
});

describe('Hero — movement', () => {
  it('initializes at given position', () => {
    const hero = new Hero(makeScene(), { x: 100, y: 50 });
    expect(hero.x).toBe(100);
    expect(hero.y).toBe(50);
  });

  it('moveTo sets target and moving flag', () => {
    const hero = new Hero(makeScene(), { x: 0, y: 0 });
    hero.moveTo(200, 150);
    expect(hero.targetX).toBe(200);
    expect(hero.targetY).toBe(150);
    expect(hero.moving).toBe(true);
  });

  it('moves toward target each update', () => {
    const hero = new Hero(makeScene(), { x: 0, y: 0 });
    hero.moveTo(130, 0);
    hero.update(1, []);
    expect(hero.x).toBeGreaterThan(0);
    expect(hero.x).toBeLessThanOrEqual(130);
  });

  it('stops when within 8px of target', () => {
    const hero = new Hero(makeScene(), { x: 0, y: 0 });
    hero.moveTo(5, 0);
    hero.update(1, []);
    expect(hero.moving).toBe(false);
  });
});

describe('Hero — combat', () => {
  it('does not attack enemy out of range', () => {
    const hero = new Hero(makeScene(), { x: 0, y: 0 });
    const enemy = makeEnemy(200, 200);
    hero.update(1, [enemy]);
    expect(enemy.hp).toBe(50);
  });

  it('attacks nearest enemy in range', () => {
    const hero = new Hero(makeScene(), { x: 0, y: 0 });
    const enemy = makeEnemy(30, 0);
    // Advance enough time for first attack (attackTimer starts at 0)
    hero.update(0.01, [enemy]);
    expect(enemy.hp).toBeLessThan(50);
  });
});

describe('Hero — takeDamage and respawn', () => {
  it('takeDamage reduces hp', () => {
    const hero = new Hero(makeScene(), { x: 0, y: 0 });
    hero.takeDamage(30);
    expect(hero.hp).toBe(120);
  });

  it('death sets dead flag and starts respawn timer', () => {
    const hero = new Hero(makeScene(), { x: 0, y: 0 });
    hero.takeDamage(200);
    expect(hero.dead).toBe(true);
    expect(hero.respawnTimer).toBe(20);
  });

  it('respawn timer ticks in update; hero respawns when timer reaches 0', () => {
    const hero = new Hero(makeScene(), { x: 50, y: 50 });
    hero.takeDamage(200);
    hero.update(20, []);
    expect(hero.dead).toBe(false);
    expect(hero.hp).toBe(150);
  });

  it('respawn repositions hero to spawn point', () => {
    const hero = new Hero(makeScene(), { x: 50, y: 50 });
    hero.moveTo(300, 300);
    hero.update(0.5, []);
    hero.takeDamage(200);
    hero.update(20, []);
    expect(hero.x).toBe(50);
    expect(hero.y).toBe(50);
  });
});
