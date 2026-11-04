import { describe, it, expect, vi } from 'vitest';

vi.mock('phaser', () => ({
  default: {
    GameObjects: {
      Container: class {
        constructor(scene, x = 0, y = 0) { this.scene = scene; this.x = x; this.y = y; this.visible = true; }
        add() { return this; }
        addAt() { return this; }
        setDepth() { return this; }
        setVisible(v) { this.visible = v; return this; }
        destroy() {}
      },
    },
  },
}));

import { Barracks } from './Barracks.js';
import { TOWER_DEFS } from '../data/towers.js';
import { SOLDIER_MARCH } from '../data/soldiers.js';
import { findBlockingSoldier } from '../systems/soldierCombat.js';
import { isMarching } from '../systems/soldierMarch.js';
import { pointAtProgress } from '../systems/pathGeometry.js';

const makeGraphics = () => ({
  clear() {}, fillStyle() {}, fillCircle() {}, fillRect() {}, lineStyle() {}, strokeCircle() {},
  strokeRect() {}, setVisible() { return this; },
});
const makeText = () => ({ setOrigin() { return this; }, setVisible() { return this; } });
const makeScene = () => ({
  add: { graphics: makeGraphics, text: makeText, existing() {} },
});

// A straight 600 px road: progress 0.1 = 60 px, so the 60 px/s march covers 0.1 a second.
const PATH = [{ x: 0, y: 100 }, { x: 600, y: 100 }];
const DT = 0.1; // 6 px of road per frame

function makeBarracks(at = 0.5) {
  const scene = makeScene();
  const b = new Barracks(scene, {
    type: 'barracks', x: 300, y: 60, def: TOWER_DEFS.barracks, zoneIndex: 0,
  });
  b.soldierPathProgress = at;
  b.spawnSoldiers(scene, PATH);
  return { b, scene };
}

const frames = (b, n, enemies = []) => {
  for (let i = 0; i < n; i++) for (const s of b.soldiers) s.update(DT, enemies);
};
// An enemy standing on the soldier's logical road point: in contact.
const enemyOn = (s) => ({ x: s.x, y: s.y, dead: false, def: {} });

describe('Barracks.spawnSoldiers', () => {
  it('keeps the road it spawned on and its arc length', () => {
    const { b } = makeBarracks();
    expect(b.pathPoints).toBe(PATH);
    expect(b.totalLength).toBe(600);
    expect(b.soldiers.map(s => s.pathProgress)).toEqual([0.5, 0.5, 0.5]);
  });
});

describe('Barracks.setRallyPoint', () => {
  it('sets the target and flag without teleporting anyone', () => {
    const { b } = makeBarracks();
    const before = b.soldiers.map(s => ({ x: s.x, y: s.y }));
    b.setRallyPoint(0.7);
    expect(b.soldiers.map(s => ({ x: s.x, y: s.y }))).toEqual(before);
    expect(b.soldierPathProgress).toBe(0.7);
    expect(b.rallyFlag).toEqual({ progress: 0.7, fadeLeftMs: null });
  });

  it('marches the squad to land exactly on the target, called with dt only', () => {
    const { b } = makeBarracks();
    b.setRallyPoint(0.6);
    for (let i = 0; i < 12; i++) for (const s of b.soldiers) s.update(DT);
    for (const s of b.soldiers) {
      expect(s.pathProgress).toBe(0.6);
      expect(isMarching(s, b.soldierPathProgress)).toBe(false);
      expect(s.x).toBeCloseTo(360);
    }
  });

  it('E14b: an engaged squad given an order walks off and stops blocking', () => {
    const { b } = makeBarracks();
    const enemy = enemyOn(b.soldiers[0]);
    expect(findBlockingSoldier(enemy, b.soldiers)).not.toBeNull();
    b.setRallyPoint(0.8, [enemy]);
    for (const s of b.soldiers) expect(s.disengageLeftPx).toBe(SOLDIER_MARCH.disengagePx);
    expect(findBlockingSoldier(enemy, b.soldiers)).toBeNull();
    frames(b, 3, [enemy]); // the enemy stays in contact the whole time
    for (const s of b.soldiers) {
      expect(s.pathProgress).toBeGreaterThan(0.5);
      expect(s.disengageLeftPx).toBeCloseTo(SOLDIER_MARCH.disengagePx - 18);
    }
  });

  it('E14d: an unengaged squad gets no window', () => {
    const { b } = makeBarracks();
    const far = { x: 0, y: 400, dead: false, def: {} };
    b.setRallyPoint(0.8, [far]);
    for (const s of b.soldiers) expect(s.disengageLeftPx).toBe(0);
  });

  it('an engaged squad rallied onto its own point keeps blocking', () => {
    const { b } = makeBarracks();
    const enemy = enemyOn(b.soldiers[0]);
    b.setRallyPoint(0.5, [enemy]);
    for (const s of b.soldiers) expect(s.disengageLeftPx).toBe(0);
    expect(findBlockingSoldier(enemy, b.soldiers)).not.toBeNull();
    frames(b, 2, [enemy]);
    expect(findBlockingSoldier(enemy, b.soldiers)).not.toBeNull();
  });

  it('zeroes the window on arrival so the squad blocks again', () => {
    const { b } = makeBarracks();
    const enemy = enemyOn(b.soldiers[0]);
    b.setRallyPoint(0.55, [enemy]); // 30 px: arrives with half the window unused
    frames(b, 5, [enemy]);
    for (const s of b.soldiers) {
      expect(s.pathProgress).toBe(0.55);
      expect(s.disengageLeftPx).toBe(0);
    }
    const newcomer = { x: b.soldiers[0].x, y: b.soldiers[0].y, dead: false, def: {} };
    expect(findBlockingSoldier(newcomer, b.soldiers)).not.toBeNull();
  });

  it('E14c: a window that runs out with an enemy in contact halts the squad', () => {
    const { b } = makeBarracks();
    const chaser = enemyOn(b.soldiers[0]);
    b.setRallyPoint(0.9, [chaser]);
    for (let i = 0; i < 15; i++) {
      chaser.x = b.soldiers[0].x; // keeps pace, never leaves melee range
      for (const s of b.soldiers) s.update(DT, [chaser]);
    }
    for (const s of b.soldiers) {
      expect(s.disengageLeftPx).toBe(0);
      expect(s.pathProgress).toBeCloseTo(0.5 + SOLDIER_MARCH.disengagePx / 600, 9);
      expect(isMarching(s, b.soldierPathProgress)).toBe(true);
    }
    expect(findBlockingSoldier(chaser, b.soldiers)).not.toBeNull();
  });

  it('E12/R10: a soldier killed mid-march respawns at the target', () => {
    const { b } = makeBarracks();
    b.setRallyPoint(0.9);
    frames(b, 2);
    const s = b.soldiers[0];
    const diedAt = s.pathProgress;
    s.takeDamage(1e6);
    expect(s.dead).toBe(true);
    s.update(DT);
    expect(s.pathProgress).toBe(diedAt); // the dead don't march
    s.update(s.respawnDuration);
    expect(s.dead).toBe(false);
    expect(s.pathProgress).toBe(0.9);
    expect(s.x).toBeCloseTo(pointAtProgress(PATH, 0.9).x);
  });

  it('a killing blow clears the disengage window', () => {
    const { b } = makeBarracks();
    const enemy = enemyOn(b.soldiers[0]);
    b.setRallyPoint(0.9, [enemy]);
    b.soldiers[0].takeDamage(1e6);
    expect(b.soldiers[0].disengageLeftPx).toBe(0);
  });
});

describe('Barracks._rebuildSoldiers', () => {
  it('E14e: mid-march, live soldiers keep their progress and dead ones appear at the target', () => {
    const { b, scene } = makeBarracks();
    b.setRallyPoint(0.9);
    frames(b, 3);
    b.soldiers[1].takeDamage(1e6);
    const live0 = b.soldiers[0].pathProgress;
    const live2 = b.soldiers[2].pathProgress;
    expect(live0).toBeGreaterThan(0.5);
    expect(live0).toBeLessThan(0.9);
    b.upgrade(2);
    b._rebuildSoldiers(scene, PATH);
    expect(b.soldiers.map(s => s.pathProgress)).toEqual([live0, 0.9, live2]);
    frames(b, 1);
    expect(b.soldiers[0].pathProgress).toBeGreaterThan(live0); // keeps walking
  });

  it('rebuild with more soldiers than before spawns the extras at the target', () => {
    const { b, scene } = makeBarracks();
    b.setRallyPoint(0.9);
    frames(b, 3);
    const old = b.soldiers.map(s => s.pathProgress);
    b.upgrade(4, 'B');
    b._rebuildSoldiers(scene, PATH);
    expect(b.soldiers).toHaveLength(4);
    expect(b.soldiers.map(s => s.pathProgress)).toEqual([...old, 0.9]);
    expect(b.soldiers[3].x).toBeCloseTo(pointAtProgress(PATH, 0.9).x);
  });

  it('keeps each live soldier\'s disengage window across an upgrade', () => {
    const { b, scene } = makeBarracks();
    const chaser = enemyOn(b.soldiers[0]);
    b.setRallyPoint(0.9, [chaser]);
    frames(b, 3, [chaser]);
    b.soldiers[2].takeDamage(1e6);
    b.soldiers[2].disengageLeftPx = 50; // stale value: a dead soldier must never hand on a window
    const left = b.soldiers[0].disengageLeftPx;
    expect(left).toBeCloseTo(SOLDIER_MARCH.disengagePx - 18);
    b.upgrade(4, 'B');
    b._rebuildSoldiers(scene, PATH);
    expect(b.soldiers.map(s => s.disengageLeftPx)).toEqual([left, left, 0, 0]);
    const from = b.soldiers[0].pathProgress;
    for (let i = 0; i < 3; i++) {
      chaser.x = b.soldiers[0].x; // still in contact: only the window lets it walk on
      b.soldiers[0].update(DT, [chaser]);
    }
    expect(b.soldiers[0].pathProgress).toBeGreaterThan(from);
  });
});
