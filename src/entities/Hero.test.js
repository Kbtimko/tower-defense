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

const makeEnemy = (x, y, hp = 50) => {
  const calls = [];
  return {
    x, y, hp, dead: false,
    _calls: calls,
    takeDamage(amount, opts) {
      calls.push({ amount, opts });
      this.hp = Math.max(0, this.hp - amount);
      if (this.hp <= 0) { this.hp = 0; this.dead = true; }
    },
  };
};

describe('Hero — movement', () => {
  it('initializes at given position', () => {
    const hero = new Hero(makeScene(), { x: 100, y: 50 });
    expect(hero.x).toBe(100);
    expect(hero.y).toBe(50);
  });

  it('moveToProgress sets targetProgress and moving flag', () => {
    const pathPoints = [{ x: 0, y: 100 }, { x: 200, y: 100 }];
    const hero = new Hero(makeScene(), { x: 0, y: 0, pathPoints });
    hero.moveToProgress(0.5);
    expect(hero.targetProgress).toBe(0.5);
    expect(hero.moving).toBe(true);
  });

  it('update advances pathProgress toward targetProgress at MOVE_SPEED / totalLength per second', () => {
    // 200px horizontal path → totalPathLength = 200; MOVE_SPEED = 130
    // → expected deltaProgress per second = 130 / 200 = 0.65
    const pathPoints = [{ x: 0, y: 100 }, { x: 200, y: 100 }];
    const hero = new Hero(makeScene(), { x: 0, y: 0, pathPoints });
    hero.moveToProgress(1);
    hero.update(0.1, []);
    // 0.1 seconds → 0.065 progress
    expect(hero.pathProgress).toBeCloseTo(0.065, 5);
    expect(hero.x).toBeCloseTo(13, 1);
    expect(hero.y).toBe(100);
  });

  it('stops when pathProgress reaches targetProgress', () => {
    const pathPoints = [{ x: 0, y: 100 }, { x: 200, y: 100 }];
    const hero = new Hero(makeScene(), { x: 0, y: 0, pathPoints });
    hero.moveToProgress(0.5);
    // 200px path, 130 px/s → 0.5 progress = 100px → 100/130 ≈ 0.77s
    hero.update(1.0, []);
    expect(hero.pathProgress).toBe(0.5);
    expect(hero.moving).toBe(false);
  });

  it('dead hero ignores moveToProgress', () => {
    const pathPoints = [{ x: 0, y: 100 }, { x: 200, y: 100 }];
    const hero = new Hero(makeScene(), { x: 0, y: 0, pathPoints });
    hero.takeDamage(200);                  // hero dies
    hero.moveToProgress(0.7);
    expect(hero.targetProgress).toBe(0);   // unchanged
    expect(hero.moving).toBe(false);
  });

  it('initializes pathProgress=0 and projects to path[0] when pathPoints provided', () => {
    const pathPoints = [{ x: 100, y: 100 }, { x: 500, y: 100 }];
    const hero = new Hero(makeScene(), { x: 0, y: 0, pathPoints });
    expect(hero.pathProgress).toBe(0);
    expect(hero.x).toBe(100);
    expect(hero.y).toBe(100);
  });

  it('setPathPosition(0.5) places hero at midpoint of a straight horizontal path', () => {
    const pathPoints = [{ x: 0, y: 100 }, { x: 200, y: 100 }];
    const hero = new Hero(makeScene(), { x: 0, y: 0, pathPoints });
    hero.setPathPosition(0.5);
    expect(hero.pathProgress).toBe(0.5);
    expect(hero.x).toBe(100);
    expect(hero.y).toBe(100);
  });

  it('setPathPosition(1.0) places hero exactly at the last point on a multi-segment path', () => {
    const pathPoints = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 200 }];
    const hero = new Hero(makeScene(), { x: 0, y: 0, pathPoints });
    hero.setPathPosition(1.0);
    expect(hero.x).toBe(100);
    expect(hero.y).toBe(200);
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

  it('respawn resets pathProgress to 0 and position to path[0]', () => {
    const pathPoints = [{ x: 50, y: 50 }, { x: 250, y: 50 }];
    const hero = new Hero(makeScene(), { x: 0, y: 0, pathPoints });
    hero.moveToProgress(1);
    hero.update(2, []);                    // walk the full path
    expect(hero.pathProgress).toBe(1);
    hero.takeDamage(200);                  // hero dies
    hero.update(20, []);                   // respawns
    expect(hero.pathProgress).toBe(0);
    expect(hero.x).toBe(50);
    expect(hero.y).toBe(50);
  });

  it('does not attack on first frame after respawn', () => {
    const hero  = new Hero(makeScene(), { x: 0, y: 0 });
    const enemy = makeEnemy(30, 0);
    hero.update(1, [enemy]);           // triggers attack, timer resets
    hero.takeDamage(200);              // hero dies
    hero.update(20, []);               // respawns
    const hpAfterRespawn = enemy.hp;
    hero.update(0.01, [enemy]);        // first frame alive — should NOT attack
    expect(enemy.hp).toBe(hpAfterRespawn);
  });
});

describe('Hero — leveling', () => {
  it('levels up to L2 at 25 kills', () => {
    const scene = makeScene();
    const hero  = new Hero(scene, { x: 0, y: 0 });
    for (let i = 0; i < 24; i++) hero._registerKill();
    expect(hero.level).toBe(1);
    hero._registerKill();
    expect(hero.level).toBe(2);
  });

  it('levels up to L3 at 75 kills', () => {
    const scene = makeScene();
    const hero  = new Hero(scene, { x: 0, y: 0 });
    for (let i = 0; i < 75; i++) hero._registerKill();
    expect(hero.level).toBe(3);
  });

  it('emits hero:level-up on scene events when leveling', () => {
    const scene = makeScene();
    const hero  = new Hero(scene, { x: 0, y: 0 });
    for (let i = 0; i < 25; i++) hero._registerKill();
    expect(scene.events.emitted.some(e => e.event === 'hero:level-up' && e.data.level === 2)).toBe(true);
  });

  it('does not emit level-up when already at max level', () => {
    const scene = makeScene();
    const hero  = new Hero(scene, { x: 0, y: 0 });
    for (let i = 0; i < 100; i++) hero._registerKill();
    const l3Events = scene.events.emitted.filter(e => e.event === 'hero:level-up' && e.data.level === 3);
    expect(l3Events.length).toBe(1);
  });
});

describe('Hero — abilities', () => {
  it('overcharge returns true and sets active flag', () => {
    const hero = new Hero(makeScene(), { x: 0, y: 0 });
    expect(hero.overcharge()).toBe(true);
    expect(hero.overchargeActive).toBe(true);
  });

  it('overcharge returns false while on cooldown', () => {
    const hero = new Hero(makeScene(), { x: 0, y: 0 });
    hero.overcharge();
    expect(hero.overcharge()).toBe(false);
  });

  it('overchargeActive clears after 6s', () => {
    const hero = new Hero(makeScene(), { x: 0, y: 0 });
    hero.overcharge();
    hero.update(6.1, []);
    expect(hero.overchargeActive).toBe(false);
  });

  it('airstrike returns target data', () => {
    const hero   = new Hero(makeScene(), { x: 0, y: 0 });
    const result = hero.airstrike(100, 200);
    expect(result).toEqual({ x: 100, y: 200, radius: 70, damage: 80 });
  });

  it('airstrike returns null while on cooldown', () => {
    const hero = new Hero(makeScene(), { x: 0, y: 0 });
    hero.airstrike(100, 200);
    expect(hero.airstrike(100, 200)).toBeNull();
  });

  it('empPulse returns true and sets cooldown', () => {
    const hero = new Hero(makeScene(), { x: 0, y: 0 });
    expect(hero.empPulse()).toBe(true);
    expect(hero.empTimer).toBe(45);
  });

  it('empPulse returns false while on cooldown', () => {
    const hero = new Hero(makeScene(), { x: 0, y: 0 });
    hero.empPulse();
    expect(hero.empPulse()).toBe(false);
  });

  it('abilities return false when hero is dead', () => {
    const hero = new Hero(makeScene(), { x: 0, y: 0 });
    hero.takeDamage(200);
    expect(hero.overcharge()).toBe(false);
    expect(hero.airstrike(0, 0)).toBeNull();
    expect(hero.empPulse()).toBe(false);
  });
});

describe('Hero — auto-attack source', () => {
  it('passes {source: {kind: "hero"}} to enemy.takeDamage', () => {
    const hero = new Hero(makeScene(), { x: 0, y: 0 });
    const enemy = makeEnemy(10, 10); // well within ATTACK_RANGE
    hero._attackTimer = 0; // force the attack to fire this tick
    hero.update(0.016, [enemy]);
    expect(enemy._calls.length).toBe(1);
    expect(enemy._calls[0].opts).toEqual({ source: { kind: 'hero' } });
  });

  it('does not call takeDamage when no enemies are in range', () => {
    const hero = new Hero(makeScene(), { x: 0, y: 0 });
    const enemy = makeEnemy(10000, 10000); // far away
    hero._attackTimer = 0;
    hero.update(0.016, [enemy]);
    expect(enemy._calls.length).toBe(0);
  });
});
