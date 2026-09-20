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
import { HEROES, HERO_REGEN_DELAY, HERO_REGEN_RATE } from '../data/heroes.js';
import { totalEnemyHpForMap } from '../data/waves.js';
import { heroXpThresholds } from '../systems/heroLeveling.js';

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
      return amount;   // Enemy.takeDamage returns the post-armour damage it applied
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

  it('update moves backward when targetProgress is less than pathProgress', () => {
    const pathPoints = [{ x: 0, y: 100 }, { x: 200, y: 100 }];
    const hero = new Hero(makeScene(), { x: 0, y: 0, pathPoints });
    hero.moveToProgress(1);
    hero.update(2, []);            // walk to the end (pathProgress === 1)
    expect(hero.pathProgress).toBe(1);
    hero.moveToProgress(0);        // click back at start
    hero.update(0.1, []);
    // backward step: 0.1s × MOVE_SPEED(130) / totalLength(200) = 0.065
    expect(hero.pathProgress).toBeCloseTo(1 - 0.065, 5);
    expect(hero.x).toBeCloseTo((1 - 0.065) * 200, 1);
    expect(hero.y).toBe(100);
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

  it('death resets _attackDamageMult to 1.0 and cancels the pending Immolate revert timer', () => {
    const hero = new Hero(makeScene(), { x: 0, y: 0 });
    const removeSpy = vi.fn();
    hero._attackDamageMult   = 1.5;
    hero._attackDmgRevertEvt = { remove: removeSpy };
    hero.takeDamage(9999);
    expect(hero.dead).toBe(true);
    expect(hero._attackDamageMult).toBe(1.0);
    expect(hero._attackDmgRevertEvt).toBeNull();
    expect(removeSpy).toHaveBeenCalledOnce();
    expect(removeSpy).toHaveBeenCalledWith(false);
  });
});

describe('Hero — leveling', () => {
  const MAP = 0;
  const thresholds = heroXpThresholds(totalEnemyHpForMap(MAP));
  const newHero = (scene, mods) => new Hero(scene, { x: 0, y: 0, mapId: MAP }, mods);

  it('starts at level 1 with no damage dealt', () => {
    const hero = newHero(makeScene());
    expect(hero.level).toBe(1);
    expect(hero.damageDealt).toBe(0);
  });

  it('levels on damage dealt, not on kills', () => {
    // Kill-count is why this changed: the hero can hold a titan from full to
    // 10% and score nothing because a tower lands the blow.
    const hero = newHero(makeScene());
    for (let i = 0; i < 200; i++) hero._registerKill();
    expect(hero.killCount).toBe(200);
    expect(hero.level).toBe(1);
  });

  it('reaches each level as post-armour damage crosses its threshold', () => {
    const hero = newHero(makeScene());
    hero._registerDamage(thresholds[0] - 1);
    expect(hero.level).toBe(1);
    hero._registerDamage(1);
    expect(hero.level).toBe(2);
    hero._registerDamage(thresholds[3] - thresholds[0]);
    expect(hero.level).toBe(5);
  });

  it('caps at the def maxLevel of 5', () => {
    const hero = newHero(makeScene());
    hero._registerDamage(1e9);
    expect(hero.level).toBe(5);
  });

  it('emits hero:level-up on scene events when leveling', () => {
    const scene = makeScene();
    const hero  = newHero(scene);
    hero._registerDamage(thresholds[0]);
    expect(scene.events.emitted.some(e => e.event === 'hero:level-up' && e.data.level === 2)).toBe(true);
  });

  it('does not emit level-up again once at max level', () => {
    const scene = makeScene();
    const hero  = newHero(scene);
    hero._registerDamage(1e9);
    hero._registerDamage(1e9);
    const l5 = scene.events.emitted.filter(e => e.event === 'hero:level-up' && e.data.level === 5);
    expect(l5.length).toBe(1);
  });

  it('ignores a non-numeric or zero damage report', () => {
    const hero = newHero(makeScene());
    hero._registerDamage(undefined);
    hero._registerDamage(0);
    expect(hero.damageDealt).toBe(0);
    expect(hero.level).toBe(1);
  });

  it('scales attack damage by 1.2x per level, off the base stat', () => {
    const scene = makeScene();
    const hero  = newHero(scene);
    const enemy = makeEnemy(0, 0, 1e9);
    hero._attackTimer = 0;
    hero.update(0, [enemy]);
    expect(enemy._calls[0].amount).toBeCloseTo(HEROES.rael.stats.attackDamage);

    hero._registerDamage(thresholds[3]);   // level 5
    hero._attackTimer = 0;
    hero.update(0, [enemy]);
    expect(enemy._calls[1].amount).toBeCloseTo(HEROES.rael.stats.attackDamage * 1.8);
  });

  it('raises max hp by the same 1.2x per level', () => {
    const hero = newHero(makeScene());
    expect(hero.maxHp).toBe(HEROES.rael.stats.maxHp);
    hero._registerDamage(thresholds[3]);
    expect(hero.maxHp).toBeCloseTo(HEROES.rael.stats.maxHp * 1.8);
  });

  it('raises CURRENT hp by exactly the max hp gained — never a full heal', () => {
    const hero = newHero(makeScene());
    hero.takeDamage(100);                  // 150 -> 50
    const before = hero.hp, beforeMax = hero.maxHp;
    hero._registerDamage(thresholds[0]);   // level 2: +20% of base 150 = +30
    expect(hero.maxHp - beforeMax).toBeCloseTo(HEROES.rael.stats.maxHp * 0.2);
    expect(hero.hp - before).toBeCloseTo(hero.maxHp - beforeMax);
    expect(hero.hp).toBeLessThan(hero.maxHp);
  });

  it('never lets the hp raise push current hp past max', () => {
    const hero = newHero(makeScene());
    hero._registerDamage(thresholds[0]);
    expect(hero.hp).toBe(hero.maxHp);
  });

  it('starts a veteran/elite hero with its head-start level AND those stats', () => {
    // heroStartLevel 3 is the Elite Commander meta upgrade.
    const hero = newHero(makeScene(), { heroStartLevel: 3 });
    expect(hero.level).toBe(3);
    expect(hero.maxHp).toBeCloseTo(HEROES.rael.stats.maxHp * 1.4);
    expect(hero.hp).toBe(hero.maxHp);
  });

  it('never demotes a head-started hero as it deals its first damage', () => {
    const hero = newHero(makeScene(), { heroStartLevel: 3 });
    hero._registerDamage(1);
    expect(hero.level).toBe(3);
  });

  it('adds heroMaxHpBonus after the level multiplier, so it stays flat', () => {
    const hero = newHero(makeScene(), { heroMaxHpBonus: 50 });
    expect(hero.maxHp).toBe(HEROES.rael.stats.maxHp + 50);
    hero._registerDamage(thresholds[3]);
    expect(hero.maxHp).toBeCloseTo(HEROES.rael.stats.maxHp * 1.8 + 50);
  });

  it('scores the POST-armour damage the enemy reports, not the raw attack stat', () => {
    // Enemy.takeDamage returns what it actually applied after flat armour
    // subtraction. A hero that banked its own attackDamage instead would level
    // roughly 18x too fast against a titan.
    const scene = makeScene();
    const hero  = newHero(scene);
    const armoured = makeEnemy(0, 0, 1e9);
    armoured.takeDamage = (amount, opts) => {
      armoured._calls.push({ amount, opts });
      return 1;                            // max(1, 18 - 20) against a titan
    };
    hero._attackTimer = 0;
    hero.update(0, [armoured]);
    expect(hero.damageDealt).toBe(1);
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
    expect(hero._timers.e).toBe(45);
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

const makeHero = () => new Hero(makeScene(), { x: 0, y: 0 });

describe('Hero — auto-attack source', () => {
  it('passes {source: {kind: "hero"}} to enemy.takeDamage', () => {
    const hero = new Hero(makeScene(), { x: 0, y: 0 });
    const enemy = makeEnemy(10, 10); // well within ATTACK_RANGE
    hero._attackTimer = 0; // force the attack to fire this tick
    hero.update(0.016, [enemy]);
    expect(enemy._calls.length).toBe(1);
    expect(enemy._calls[0].opts).toEqual({ source: { kind: 'hero', heroId: 'rael' } });
  });

  it('does not call takeDamage when no enemies are in range', () => {
    const hero = new Hero(makeScene(), { x: 0, y: 0 });
    const enemy = makeEnemy(10000, 10000); // far away
    hero._attackTimer = 0;
    hero.update(0.016, [enemy]);
    expect(enemy._calls.length).toBe(0);
  });
});

describe('Hero data-driven refactor — new surface', () => {
  it('throws on unknown heroId', () => {
    const scene = makeScene();
    expect(() => new Hero(scene, { x:0, y:0, heroId:'nope' })).toThrow();
  });

  it('fireAbility("q") returns null when hero is dead', () => {
    const hero = makeHero();
    hero.dead = true;
    expect(hero.fireAbility('q')).toBeNull();
  });

  it('fireAbility("q") returns null when on cooldown', () => {
    const hero = makeHero();
    hero.fireAbility('q');
    expect(hero.fireAbility('q')).toBeNull();
  });

  it('fireAbility("q") starts the slot cooldown to the ability cooldown value', () => {
    const hero = makeHero();
    hero.fireAbility('q');
    expect(hero._timers.q).toBe(30);
  });

  it('fireAbility("w") respects the ability unlock level', () => {
    const hero = makeHero();
    hero.level = 1;
    expect(hero.fireAbility('w', { x:0, y:0 })).toBeNull();
    hero.level = 2;
    expect(hero.fireAbility('w', { x:0, y:0 })).not.toBeNull();
  });

  it('moveToProgress sets _facingX based on direction along the path', () => {
    const pathPoints = [{ x: 0, y: 0 }, { x: 200, y: 0 }];
    const hero = new Hero(makeScene(), { x: 0, y: 0, pathPoints });
    hero.moveToProgress(0.7);
    expect(hero._facingX).toBe(1);
    // Walk to where we just aimed, then aim backward
    hero.update(2, []);
    hero.moveToProgress(0.2);
    expect(hero._facingX).toBe(-1);
  });

  it('cloaked clears on _cloakTimer expiry, resets moveSpeedMult to 1.0', () => {
    const hero = makeHero();
    hero.cloaked = true;
    hero._cloakTimer = 4;
    hero._moveSpeedMult = 2.0;
    hero.update(4.1, []);
    expect(hero.cloaked).toBe(false);
    expect(hero._moveSpeedMult).toBe(1.0);
  });

  it('attack damage is scaled by _attackDamageMult', () => {
    const hero = makeHero();
    hero._attackDamageMult = 1.5;
    let received = 0;
    const enemy = { x: hero.x, y: hero.y, dead: false, takeDamage(dmg) { received = dmg; } };
    hero._attackTimer = 0;
    hero.update(0.01, [enemy]);
    expect(received).toBe(18 * 1.5);
  });

  it('onHit callback fires after a successful auto-attack landing', () => {
    const hero = makeHero();
    let onHitCalled = 0;
    hero.def.onHit = () => { onHitCalled++; };
    const enemy = { x: hero.x, y: hero.y, dead: false, takeDamage() {} };
    hero._attackTimer = 0;
    hero.update(0.01, [enemy]);
    expect(onHitCalled).toBe(1);
  });
});

describe('Hero — out-of-combat regeneration', () => {
  it('does not regenerate while the hero is still in combat', () => {
    const hero = new Hero(makeScene(), { x: 0, y: 0 });
    hero.takeDamage(50);
    hero.update(HERO_REGEN_DELAY - 0.1, []);
    expect(hero.hp).toBe(100);
  });

  it('heals HERO_REGEN_RATE hp per second once the delay has elapsed', () => {
    const hero = new Hero(makeScene(), { x: 0, y: 0 });
    hero.takeDamage(50);
    hero.update(HERO_REGEN_DELAY - 0.1, []);
    hero.update(0.2, []);
    expect(hero.hp).toBeCloseTo(100 + HERO_REGEN_RATE * 0.2, 5);
  });

  it('a fresh hit restarts the out-of-combat delay', () => {
    const hero = new Hero(makeScene(), { x: 0, y: 0 });
    hero.takeDamage(50);
    hero.update(HERO_REGEN_DELAY - 0.1, []);
    hero.takeDamage(10);
    hero.update(0.2, []);
    expect(hero.hp).toBe(90);
  });

  it('clamps regeneration at maxHp', () => {
    const hero = new Hero(makeScene(), { x: 0, y: 0 });
    hero.takeDamage(1);
    hero.update(HERO_REGEN_DELAY, []);
    hero.update(HERO_REGEN_DELAY, []);
    expect(hero.hp).toBe(hero.maxHp);
  });

  it('does not regenerate while dead', () => {
    const hero = new Hero(makeScene(), { x: 0, y: 0 });
    hero.takeDamage(200);
    hero.update(10, []);                 // respawnTime is 20s — still dead
    expect(hero.dead).toBe(true);
    expect(hero.hp).toBe(0);
  });

  it('redraws the hp bar on the tick regen changes hp, so the bar cannot lie', () => {
    const hero = new Hero(makeScene(), { x: 0, y: 0 });
    hero.takeDamage(50);
    const redraw = vi.spyOn(hero, '_redrawHpBar');
    hero.update(HERO_REGEN_DELAY - 0.1, []);
    expect(redraw).not.toHaveBeenCalled();
    hero.update(0.2, []);
    expect(redraw).toHaveBeenCalled();
  });
});

describe('Hero.xpProgress', () => {
  // Exact integer, unlike the thresholds derived from it: heroXpThresholds
  // multiplies by fractions like 0.07, which loses precision (0.07 * 8800 ===
  // 616.0000000000001). Always derive a threshold via heroXpThresholds(...)
  // rather than writing its rounded decimal as a literal.
  const MAP0_TOTAL_HP = 8800;   // totalEnemyHpForMap(0); thresholds ~616/1144/1848/2640

  it('reports an empty bar for a hero that has dealt no damage', () => {
    const h = new Hero(makeScene(), { x: 0, y: 0 });
    const p = h.xpProgress();
    expect(p.level).toBe(1);
    expect(p.progress).toBe(0);
    expect(p.atMax).toBe(false);
  });

  it('advances as the hero registers damage', () => {
    const h = new Hero(makeScene(), { x: 0, y: 0 });
    const before = h.xpProgress().progress;
    h._registerDamage(MAP0_TOTAL_HP * 0.03);   // inside the level-1 window (0 -> 616)
    const after = h.xpProgress().progress;
    expect(after).toBeGreaterThan(before);
    expect(after).toBeLessThan(1);
  });

  it('empties again once a level is earned', () => {
    const h = new Hero(makeScene(), { x: 0, y: 0 });
    const [toLevel2] = heroXpThresholds(MAP0_TOTAL_HP);   // exact float, not a rounded literal
    h._registerDamage(toLevel2);
    expect(h.level).toBe(2);
    expect(h.xpProgress().progress).toBe(0);
  });

  it('flags atMax once the hero tops out', () => {
    const h = new Hero(makeScene(), { x: 0, y: 0 });
    h._registerDamage(MAP0_TOTAL_HP);
    expect(h.xpProgress().atMax).toBe(true);
    expect(h.xpProgress().progress).toBe(1);
  });

  // The <hero>_veteran / <hero>_elite meta upgrades start a hero above level 1
  // with damageDealt still 0, which is below its own window's floor.
  it('clamps to empty for a hero given a head-start level', () => {
    const h = new Hero(makeScene(), { x: 0, y: 0 }, { heroStartLevel: 3 });
    expect(h.level).toBe(3);
    const p = h.xpProgress();
    expect(p.progress).toBe(0);
    expect(p.current).toBe(0);
  });

  // damageDealt is run-scoped, not life-scoped.
  it('keeps its progress across a death and respawn', () => {
    const h = new Hero(makeScene(), { x: 0, y: 0 });
    h._registerDamage(300);                    // partway into the level-1 window
    const before = h.xpProgress();
    h.hp = 0;
    h.dead = true;
    h.respawn();
    const after = h.xpProgress();
    expect(after.progress).toBeCloseTo(before.progress);
    expect(after.level).toBe(before.level);
  });
});
