import { describe, it, expect, vi } from 'vitest';

vi.mock('phaser', () => ({
  default: {
    Scene: class { constructor(key) { this._key = key; } },
    GameObjects: { Container: class { constructor(scene, x, y) { this.scene = scene; this.x = x; this.y = y; } add() {} setDepth() { return this; } } },
  },
}));

import GameScene from './GameScene.js';
import { HIT_STOP } from '../data/fx.js';
import { ENEMY_DEFS } from '../data/enemies.js';
import { deathClass } from '../systems/hitFx.js';

const typeOf = (cls) => Object.keys(ENEMY_DEFS).find((t) => deathClass(t) === cls);

function makeScene({ ambient = true, userPaused = false, over = false, won = false, since = HIT_STOP.cooldown } = {}) {
  const s = Object.create(GameScene.prototype);
  s.over = over; s.won = won; s._userPaused = userPaused;
  s._hitStopTimer = 0; s._sinceHitStop = since;
  s.game = { registry: { get: (k) => (k === 'ambientMotion' ? ambient : undefined) } };
  s.particleSpawner = { spawnDeath: vi.fn() };
  s.tweens = { add: vi.fn() };
  return s;
}
const enemy = (type, extra = {}) => ({
  x: 5, y: 6, maxHp: 100, dead: true, destroy: vi.fn(),
  def: { type, color: 0xabcdef }, ...extra,
});

describe('GameScene hit-stop', () => {
  it('a heavy hit starts the timer and resets the cooldown', () => {
    const s = makeScene();
    s._onDamageDealt({ target: enemy('x', { dead: false }), amount: 30 });
    expect(s._hitStopTimer).toBe(HIT_STOP.duration);
    expect(s._sinceHitStop).toBe(0);
  });

  it('a light hit does not', () => {
    const s = makeScene();
    s._onDamageDealt({ target: enemy('x', { dead: false }), amount: 5 });
    expect(s._hitStopTimer).toBe(0);
  });

  it('respects the cooldown, pause, reduced motion and game over', () => {
    for (const opts of [{ since: 0.1 }, { userPaused: true }, { ambient: false }, { over: true }, { won: true }]) {
      const s = makeScene(opts);
      s._onDamageDealt({ target: enemy('x', { dead: false }), amount: 99 });
      expect(s._hitStopTimer).toBe(0);
    }
  });

  it('ignores targets that are not enemies (hero, soldiers)', () => {
    const s = makeScene();
    s._onDamageDealt({ target: { maxHp: 10, dead: false }, amount: 99 });
    s._onDamageDealt({ target: undefined, amount: 99 });
    expect(s._hitStopTimer).toBe(0);
  });

  it('update skips the simulation by real delta while stopped, then resumes', () => {
    const s = makeScene();
    s._hitStopTimer = 0.05;
    s.speed = 3;
    s.waveMgr = { update: vi.fn() };
    s._ambient = { update: vi.fn() };
    s.update(0, 30);
    expect(s._hitStopTimer).toBeCloseTo(0.02, 6); // 30ms real, not x3
    expect(s.waveMgr.update).not.toHaveBeenCalled();
    expect(s._ambient.update).not.toHaveBeenCalled();
  });

  it('update advances the cooldown clock by real delta when running', () => {
    const s = makeScene({ since: 0 });
    s.speed = 2;
    s.waveMgr = { update: vi.fn() };
    s._updateEnemies = s._updateTowers = s._updateProjectiles = s._updateSoldiers = vi.fn();
    s._updateHero = s._updateSentries = s._updateParticles = s._checkWaveComplete = vi.fn();
    s._drawPath = s._drawZones = s._drawParticles = vi.fn();
    s._areaEffects = { update: vi.fn() };
    s.gfx = { clear: vi.fn() };
    s.update(0, 100);
    expect(s._sinceHitStop).toBeCloseTo(0.1, 6);
    expect(s.waveMgr.update).toHaveBeenCalled();
  });
});

describe('GameScene._fadeOutDeadEnemy death effects', () => {
  it('spawns the death FX for a killed enemy with its class and colour', () => {
    const s = makeScene();
    const type = typeOf('small');
    s._fadeOutDeadEnemy(enemy(type));
    expect(s.particleSpawner.spawnDeath).toHaveBeenCalledOnce();
    expect(s.particleSpawner.spawnDeath).toHaveBeenCalledWith('small', 5, 6, 0xabcdef);
  });

  it('never spawns death FX or hit-stops for a leaked enemy, and still fades it', () => {
    const s = makeScene();
    const e = enemy(typeOf('boss'), { leaked: true });
    s._fadeOutDeadEnemy(e);
    expect(s.particleSpawner.spawnDeath).not.toHaveBeenCalled();
    expect(s._hitStopTimer).toBe(0);
    expect(s.tweens.add).toHaveBeenCalledOnce();
  });

  it('a large or boss kill triggers hit-stop; a small kill does not', () => {
    for (const cls of ['large', 'boss']) {
      const s = makeScene();
      s._fadeOutDeadEnemy(enemy(typeOf(cls)));
      expect(s._hitStopTimer).toBe(HIT_STOP.duration);
    }
    const s = makeScene();
    s._fadeOutDeadEnemy(enemy(typeOf('small')));
    expect(s._hitStopTimer).toBe(0);
  });
});

describe('GameScene damage-dealt wiring', () => {
  it('registers and removes the same handler with the same context', () => {
    const on = vi.fn(); const off = vi.fn();
    const s = Object.create(GameScene.prototype);
    s.events = { on, off };
    s._wireSceneEvents();
    s._unwireSceneEvents();
    const reg = on.mock.calls.find((c) => c[0] === 'damage-dealt');
    const unreg = off.mock.calls.find((c) => c[0] === 'damage-dealt');
    expect(reg).toBeTruthy();
    expect(unreg).toEqual(reg);
  });
});
