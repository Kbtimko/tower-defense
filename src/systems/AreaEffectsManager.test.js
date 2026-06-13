import { describe, it, expect } from 'vitest';
import { AreaEffectsManager } from './AreaEffectsManager.js';

function makeScene() {
  const created = [];
  return {
    _created: created,
    add: {
      graphics: () => {
        const g = {
          destroyed: false, x: 0, y: 0,
          setDepth() { return g; },
          setPosition(x, y) { g.x = x; g.y = y; return g; },
          destroy() { g.destroyed = true; },
          clear() {}, fillStyle() {}, fillCircle() {}, lineStyle() {}, strokeCircle() {},
        };
        created.push(g);
        return g;
      },
    },
  };
}

function makeEnemy(x, y) {
  const e = {
    x, y, dead: false, hp: 100, _statuses: [],
    takeDamage(amt) { e.hp -= amt; if (e.hp <= 0) e.dead = true; },
    applyStatus(s)   { e._statuses.push(s); },
  };
  return e;
}

describe('AreaEffectsManager', () => {
  it('damages enemies in radius at 1-second ticks', () => {
    const scene = makeScene();
    const mgr = new AreaEffectsManager(scene);
    const e = makeEnemy(50, 50);
    mgr.add({
      x: 50, y: 50, radius: 100, duration: 5, dps: 10,
      sourceTag: { kind:'status', type:'burn' },
      drawFn() {},
    });
    mgr.update(0.5, [e]);
    expect(e.hp).toBe(100);
    mgr.update(0.5, [e]);
    expect(e.hp).toBe(90);
  });

  it('skips enemies outside radius', () => {
    const scene = makeScene();
    const mgr = new AreaEffectsManager(scene);
    const e = makeEnemy(200, 200);
    mgr.add({ x: 0, y: 0, radius: 50, duration: 5, dps: 10, sourceTag: {}, drawFn() {} });
    mgr.update(1.5, [e]);
    expect(e.hp).toBe(100);
  });

  it('destroys graphic and removes effect at duration end', () => {
    const scene = makeScene();
    const mgr = new AreaEffectsManager(scene);
    mgr.add({ x: 0, y: 0, radius: 50, duration: 2, dps: 0, sourceTag: {}, drawFn() {} });
    mgr.update(2.5, []);
    expect(scene._created[0].destroyed).toBe(true);
  });

  it('followsTarget moves effect centre each frame', () => {
    const scene = makeScene();
    const mgr = new AreaEffectsManager(scene);
    const target = { x: 0, y: 0 };
    mgr.add({ followsTarget: target, radius: 50, duration: 5, dps: 0, sourceTag: {}, drawFn() {} });
    target.x = 100; target.y = 200;
    mgr.update(0.1, []);
    expect(scene._created[0].x).toBe(100);
    expect(scene._created[0].y).toBe(200);
  });

  it('applies slow status to enemies inside when slowFactor is set', () => {
    const scene = makeScene();
    const mgr = new AreaEffectsManager(scene);
    const e = makeEnemy(0, 0);
    mgr.add({ x: 0, y: 0, radius: 50, duration: 5, dps: 1, slowFactor: 0.5, sourceTag: {}, drawFn() {} });
    mgr.update(1.0, [e]);
    expect(e._statuses[0]).toMatchObject({ type:'slow', factor: 0.5 });
  });

  it('terminates a followsTarget effect when the target becomes dead', () => {
    const scene = makeScene();
    const mgr = new AreaEffectsManager(scene);
    const target = { x: 0, y: 0, dead: false };
    const enemy = makeEnemy(0, 0);
    mgr.add({
      followsTarget: target,
      radius: 50, duration: 8, dps: 10,
      sourceTag: {}, drawFn() {},
    });
    // Live frame: damages enemy, effect still active.
    mgr.update(1.0, [enemy]);
    expect(enemy.hp).toBe(90);
    expect(scene._created[0].destroyed).toBe(false);
    // Target dies.
    target.dead = true;
    mgr.update(0.1, [enemy]);
    // Effect is destroyed and removed; no further damage applied.
    expect(scene._created[0].destroyed).toBe(true);
    expect(enemy.hp).toBe(90);
    // Subsequent update is a no-op (effect already gone).
    mgr.update(2.0, [enemy]);
    expect(enemy.hp).toBe(90);
  });

  it('stationary (x/y) effect is unaffected by an enemy.dead in the enemies list', () => {
    const scene = makeScene();
    const mgr = new AreaEffectsManager(scene);
    const liveEnemy = makeEnemy(0, 0);
    const deadEnemy = { x: 999, y: 999, dead: true, hp: 50, _statuses: [],
                       takeDamage(amt) { this.hp -= amt; }, applyStatus() {} };
    mgr.add({
      x: 0, y: 0, radius: 50, duration: 5, dps: 10,
      sourceTag: {}, drawFn() {},
    });
    mgr.update(1.0, [liveEnemy, deadEnemy]);
    expect(liveEnemy.hp).toBe(90);
    expect(scene._created[0].destroyed).toBe(false);
  });

  it('destroyAll removes every effect and its graphic', () => {
    const scene = makeScene();
    const mgr = new AreaEffectsManager(scene);
    mgr.add({ x: 0, y: 0, radius: 10, duration: 10, dps: 0, sourceTag: {}, drawFn() {} });
    mgr.add({ x: 0, y: 0, radius: 10, duration: 10, dps: 0, sourceTag: {}, drawFn() {} });
    mgr.destroyAll();
    expect(scene._created.every(g => g.destroyed)).toBe(true);
  });
});
