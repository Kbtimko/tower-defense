import { describe, it, expect, vi } from 'vitest';

vi.mock('phaser', () => ({
  default: {
    GameObjects: {
      Container: class {
        constructor(scene, x, y) { this.scene = scene; this.x = x; this.y = y; this.destroyed = false; }
        add() {}
        setDepth() { return this; }
        destroy() { this.destroyed = true; }
      }
    }
  }
}));

vi.mock('./Projectile.js', () => ({
  Projectile: class {
    constructor(scene, opts) { Object.assign(this, opts); this.scene = scene; }
  },
}));

import { SentryTurret } from './SentryTurret.js';

const makeGraphics = () => ({ clear(){}, fillStyle(){}, fillCircle(){}, fillRect(){}, lineStyle(){}, strokeCircle(){}, strokeRect(){} });
const makeScene = () => ({
  add: { graphics: () => makeGraphics(), existing() {} },
  projectiles: [],
});
const makeEnemy = (x, y) => ({ x, y, dead: false });

describe('SentryTurret', () => {
  it('despawns after lifespan and returns false from update', () => {
    const scene = makeScene();
    const s = new SentryTurret(scene, { x: 0, y: 0, ownerHeroId: 'engineer' });
    const result = s.update(13, []);
    expect(result).toBe(false);
    expect(s.destroyed).toBe(true);
  });

  it('fires at the nearest enemy in range and pushes a Projectile into scene.projectiles', () => {
    const scene = makeScene();
    const s = new SentryTurret(scene, { x: 0, y: 0, ownerHeroId: 'engineer' });
    const inRangeNear = makeEnemy(30, 0);
    const inRangeFar  = makeEnemy(80, 0);
    const outOfRange  = makeEnemy(200, 0);
    s.update(1.5, [inRangeNear, inRangeFar, outOfRange]);
    expect(scene.projectiles.length).toBe(1);
    expect(scene.projectiles[0].target).toBe(inRangeNear);
    expect(scene.projectiles[0].damage).toBe(15);
    expect(scene.projectiles[0].towerType).toBe('archer');
    expect(scene.projectiles[0].tier).toBe(1);
  });

  it('does not fire when no enemy is in range', () => {
    const scene = makeScene();
    const s = new SentryTurret(scene, { x: 0, y: 0, ownerHeroId: 'engineer' });
    s.update(1.5, [makeEnemy(500, 500)]);
    expect(scene.projectiles.length).toBe(0);
  });

  it('respects fire rate cooldown between shots', () => {
    const scene = makeScene();
    const s = new SentryTurret(scene, { x: 0, y: 0, ownerHeroId: 'engineer' });
    const e = makeEnemy(30, 0);
    s.update(0.5, [e]);
    s.update(0.5, [e]);
    s.update(0.2, [e]);
    expect(scene.projectiles.length).toBe(2);
  });

  it('skips dead enemies when picking target', () => {
    const scene = makeScene();
    const s = new SentryTurret(scene, { x: 0, y: 0, ownerHeroId: 'engineer' });
    const dead  = { x: 30, y: 0, dead: true };
    const alive = makeEnemy(60, 0);
    s.update(1.5, [dead, alive]);
    expect(scene.projectiles.length).toBe(1);
    expect(scene.projectiles[0].target).toBe(alive);
  });
});
