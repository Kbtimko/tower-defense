// takeDamage already holds the raw amount and the final damage at the emit, so
// the band rides along on the existing event rather than needing new plumbing.

vi.mock('phaser', () => ({
  default: {
    Scene: class {},
    GameObjects: {
      Container: class {
        constructor(scene, x, y) { this.scene = scene; this.x = x; this.y = y; }
        add() {}
        setDepth() { return this; }
        setPosition() { return this; }
      },
    },
  },
}));

import { describe, it, expect, vi } from 'vitest';
import { Enemy } from './Enemy.js';   // named export — see Enemy.js:12
import { ENEMY_DEFS } from '../data/enemies.js';

function fakeEnemy(def, overrides = {}) {
  const emitted = [];
  const self = {
    def, armor: def.armor, hp: 10000, maxHp: 10000, dead: false,
    statusEffects: { vulnerable: { active: false, timer: 0, multiplier: 1 } },
    scene: { events: { emit: (e, p) => emitted.push([e, p]) }, game: {} },
    _redrawHpBar() {}, _triggerHitFlash() {}, _clearHitFlash() {},
    ...overrides,
  };
  return { self, emitted };
}

describe('Enemy.takeDamage', () => {
  it('emits the floored band when armour eats the shot', () => {
    const { self, emitted } = fakeEnemy(ENEMY_DEFS.brute);
    Enemy.prototype.takeDamage.call(self, 8, {
      source: { kind: 'tower', type: 'ice', tier: 1, branch: null },
    });
    const [, payload] = emitted.find(([e]) => e === 'damage-dealt');
    expect(payload.absorbedBand).toBe('floored');
  });

  it('emits none when the hit pierces', () => {
    // amount 25 vs. titan armor 20 is chosen so the two paths land in
    // DIFFERENT bands: pierce false -> after 5, absorbed 0.8 -> 'heavy';
    // pierce true -> after 25, absorbed 0 -> 'none'. If pierce ever stops
    // being forwarded into armourAbsorption, this assertion fails instead of
    // passing by coincidence.
    const { self, emitted } = fakeEnemy(ENEMY_DEFS.titan);
    Enemy.prototype.takeDamage.call(self, 25, {
      pierce: true,
      source: { kind: 'tower', type: 'sniper', tier: 1, branch: null },
    });
    const [, payload] = emitted.find(([e]) => e === 'damage-dealt');
    expect(payload.absorbedBand).toBe('none');
  });

  it('bands the hit identically whether or not Vulnerable is active', () => {
    // The spec excludes vulnerableMult from the metric: it is a transient
    // status, and a panel/number that re-banded while a debuff ticked would be
    // unreadable. armourAbsorption takes no such parameter, and this pins it.
    const plain = fakeEnemy(ENEMY_DEFS.brute);
    const vuln  = fakeEnemy(ENEMY_DEFS.brute, {
      statusEffects: { vulnerable: { active: true, timer: 5, multiplier: 2 } },
    });
    const shot = { source: { kind: 'tower', type: 'ice', tier: 1, branch: null } };
    Enemy.prototype.takeDamage.call(plain.self, 8, shot);
    Enemy.prototype.takeDamage.call(vuln.self,  8, shot);
    const band = (r) => r.emitted.find(([e]) => e === 'damage-dealt')[1].absorbedBand;
    expect(band(vuln)).toBe(band(plain));
    expect(band(plain)).toBe('floored');
  });

  it('emits none against an unarmoured enemy', () => {
    const { self, emitted } = fakeEnemy(ENEMY_DEFS.drone);
    Enemy.prototype.takeDamage.call(self, 15, {
      source: { kind: 'tower', type: 'archer', tier: 1, branch: null },
    });
    const [, payload] = emitted.find(([e]) => e === 'damage-dealt');
    expect(payload.absorbedBand).toBe('none');
  });

  it('bands a status DoT as none even though the arithmetic would floor it', () => {
    // Pyro's burn is 3 dps vs. a brute's armour 8: after=1, absorbed=7/8 ->
    // 'floored' by arithmetic alone. The tower panel has no line for a DoT,
    // so surfacing that band would put an unexplained shield marker over the
    // enemy every tick. If the source-kind check is dropped this fails.
    const { self, emitted } = fakeEnemy(ENEMY_DEFS.brute);
    Enemy.prototype.takeDamage.call(self, 3, {
      source: { kind: 'status', type: 'burn' },
    });
    const [, payload] = emitted.find(([e]) => e === 'damage-dealt');
    expect(payload.absorbedBand).toBe('none');
  });

  it('bands a hero attack as none even though the arithmetic would floor it', () => {
    const { self, emitted } = fakeEnemy(ENEMY_DEFS.brute);
    Enemy.prototype.takeDamage.call(self, 8, {
      source: { kind: 'hero', heroId: 'scout' },
    });
    const [, payload] = emitted.find(([e]) => e === 'damage-dealt');
    expect(payload.absorbedBand).toBe('none');
  });

  it('still bands a tower hit correctly alongside non-tower sources', () => {
    const { self, emitted } = fakeEnemy(ENEMY_DEFS.brute);
    Enemy.prototype.takeDamage.call(self, 8, {
      source: { kind: 'tower', type: 'ice', tier: 1, branch: null },
    });
    const [, payload] = emitted.find(([e]) => e === 'damage-dealt');
    expect(payload.absorbedBand).toBe('floored');
  });
});
