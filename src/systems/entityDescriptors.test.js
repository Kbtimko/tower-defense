import { describe, it, expect } from 'vitest';
import { describeEnemy, describeTower, describeHero, describeAbility } from './entityDescriptors.js';
import { ENEMY_DEFS } from '../data/enemies.js';
import { TOWER_DEFS } from '../data/towers.js';
import { HEROES, HERO_ORDER } from '../data/heroes.js';

describe('describeEnemy', () => {
  it('carries the stat block for a known enemy', () => {
    const d = describeEnemy('brute');
    expect(d.name).toBe('Veth Brute');
    expect(d.icon).toBe(ENEMY_DEFS.brute.icon);
    expect(d.hp).toBe(ENEMY_DEFS.brute.hp);
    expect(d.armor).toBe(ENEMY_DEFS.brute.armor);
    expect(d.speed).toBe(ENEMY_DEFS.brute.speed);
    expect(d.flying).toBe(ENEMY_DEFS.brute.flying);
    expect(d.reward).toBe(ENEMY_DEFS.brute.reward);
  });

  it('reports which towers beat it and which bounce off, as display-ready entries in order', () => {
    const d = describeEnemy('brute');
    expect(d.vulnerableTo).toEqual([
      { kind: 'tower', type: 'cannon',   name: TOWER_DEFS.cannon.name,   icon: TOWER_DEFS.cannon.icon },
      { kind: 'tower', type: 'sniper',   name: TOWER_DEFS.sniper.name,   icon: TOWER_DEFS.sniper.icon },
      { kind: 'tower', type: 'barracks', name: TOWER_DEFS.barracks.name, icon: TOWER_DEFS.barracks.icon },
      { kind: 'hero',  type: 'engineer', name: HEROES.engineer.shortName, icon: HEROES.engineer.portraitChar },
      { kind: 'hero',  type: 'pyro',     name: HEROES.pyro.shortName,     icon: HEROES.pyro.portraitChar },
    ]);
    expect(d.resists).toEqual([
      { kind: 'tower', type: 'archer', name: TOWER_DEFS.archer.name, icon: TOWER_DEFS.archer.icon },
    ]);
  });

  it('marks the phantom as flying', () => {
    expect(describeEnemy('phantom').flying).toBe(true);
  });

  it('returns null for an unknown type', () => {
    expect(describeEnemy('nope')).toBeNull();
  });

  // ENEMY_DEFS[type] reaches Object.prototype for unowned keys; a garbage
  // descriptor (or a throw further down the pipeline) must not slip through.
  it('does not resolve prototype-chain properties as enemies', () => {
    expect(describeEnemy('toString')).toBeNull();
    expect(describeEnemy('constructor')).toBeNull();
    expect(describeEnemy('hasOwnProperty')).toBeNull();
  });

  // Derived from the data, so a new enemy cannot silently go undescribed.
  it('describes every enemy in ENEMY_DEFS', () => {
    for (const type of Object.keys(ENEMY_DEFS)) {
      const d = describeEnemy(type);
      expect(d, `missing descriptor for ${type}`).not.toBeNull();
      expect(typeof d.name).toBe('string');
      expect(Array.isArray(d.vulnerableTo)).toBe(true);
    }
  });
});

describe('describeTower', () => {
  it('carries base stats', () => {
    const d = describeTower('archer');
    expect(d.name).toBe('Archer');
    expect(d.icon).toBe(TOWER_DEFS.archer.icon);
    expect(d.cost).toBe(TOWER_DEFS.archer.cost);
    expect(d.range).toBe(TOWER_DEFS.archer.range);
    expect(d.damage).toBe(TOWER_DEFS.archer.damage);
    expect(d.fireRate).toBe(TOWER_DEFS.archer.fireRate);
    expect(d.pierce).toBe(TOWER_DEFS.archer.pierce);
    expect(d.slow).toBe(TOWER_DEFS.archer.slow);
    expect(d.splashRadius).toBe(TOWER_DEFS.archer.splashRadius);
  });

  it('exposes the tower ability', () => {
    const d = describeTower('archer');
    expect(d.ability).toEqual(TOWER_DEFS.archer.ability);
  });

  it('lists the tier ladder in order with labels and costs', () => {
    const d = describeTower('archer');
    expect(d.tiers.map(t => t.key)).toEqual(['tier2', 'tier3', 'tier4A', 'tier4B']);
    expect(d.tiers[0].label).toBe('Eagle Eye');
    expect(d.tiers[0].cost).toBe(TOWER_DEFS.archer.tier2.cost);
    expect(d.tiers[3].passiveEffect).toBe('+50% range, armor piercing');
  });

  // The barracks is the shape-breaker: damage 0, no per-tier damage/range,
  // and soldier stats instead. It must not render a blank damage row.
  it('exposes soldier stats for the barracks and flags it as non-damaging', () => {
    const d = describeTower('barracks');
    expect(d.dealsDirectDamage).toBe(false);
    expect(d.soldierStats.tier1.count).toBe(TOWER_DEFS.barracks.soldierStats.tier1.count);
    expect(d.soldierStats.tier4A.canBlockFlyers).toBe(true);
    expect(d.tiers.map(t => t.label))
      .toEqual(['Drill Sergeant', 'Elite Guard', 'Vanguard', 'Rapid Response']);
  });

  // Barracks tiers carry no damage/range/splashRadius/fireRate/slow in the
  // source data; the module's `?? null` normalization is the whole reason a
  // consumer can render this row without a blank damage column.
  it('normalizes missing per-tier fields to null for the barracks', () => {
    const d = describeTower('barracks');
    expect(d.tiers[0]).toEqual({
      key: 'tier2',
      label: 'Drill Sergeant',
      cost: TOWER_DEFS.barracks.tier2.cost,
      damage: null,
      range: null,
      splashRadius: null,
      fireRate: null,
      slow: null,
      passiveEffect: null,
    });
  });

  it('flags damaging towers as damaging', () => {
    expect(describeTower('sniper').dealsDirectDamage).toBe(true);
  });

  // Tier-1, unbranched only — see the why-comment at the describeMatchups
  // call in entityDescriptors.js: TIER4_OVERRIDES can invert these.
  it('reports base-tier matchups as display-ready entries', () => {
    const d = describeTower('cannon');
    expect(d.effectiveAtBase).toEqual([
      { kind: 'enemy', type: 'brute',    name: ENEMY_DEFS.brute.name,    icon: ENEMY_DEFS.brute.icon },
      { kind: 'enemy', type: 'colossus', name: ENEMY_DEFS.colossus.name, icon: ENEMY_DEFS.colossus.icon },
      { kind: 'enemy', type: 'titan',    name: ENEMY_DEFS.titan.name,    icon: ENEMY_DEFS.titan.icon },
    ]);
    expect(d.weakAtBase).toEqual([
      { kind: 'enemy', type: 'drone',   name: ENEMY_DEFS.drone.name,   icon: ENEMY_DEFS.drone.icon },
      { kind: 'enemy', type: 'skitter', name: ENEMY_DEFS.skitter.name, icon: ENEMY_DEFS.skitter.icon },
      { kind: 'enemy', type: 'phantom', name: ENEMY_DEFS.phantom.name, icon: ENEMY_DEFS.phantom.icon },
    ]);
  });

  it('returns null for an unknown type', () => {
    expect(describeTower('nope')).toBeNull();
  });

  // TOWER_DEFS[type] reaches Object.prototype for unowned keys; 'constructor'
  // in particular used to throw inside the TIER_KEYS.map (def[key] undefined).
  it('does not resolve prototype-chain properties as towers', () => {
    expect(describeTower('toString')).toBeNull();
    expect(describeTower('constructor')).toBeNull();
    expect(describeTower('hasOwnProperty')).toBeNull();
  });

  it('does not alias soldierStats to the live balance table', () => {
    const original = TOWER_DEFS.barracks.soldierStats.tier1.hp;
    const d = describeTower('barracks');
    d.soldierStats.tier1.hp = original + 1000;
    expect(TOWER_DEFS.barracks.soldierStats.tier1.hp).toBe(original);
  });

  it('does not alias ability to the live balance table', () => {
    const original = TOWER_DEFS.archer.ability.cooldown;
    const d = describeTower('archer');
    d.ability.cooldown = original + 1000;
    expect(TOWER_DEFS.archer.ability.cooldown).toBe(original);
  });

  it('describes every tower in TOWER_DEFS', () => {
    for (const type of Object.keys(TOWER_DEFS)) {
      const d = describeTower(type);
      expect(d, `missing descriptor for ${type}`).not.toBeNull();
      expect(d.tiers.length).toBe(4);
    }
  });
});

describe('describeHero', () => {
  it('carries identity, role and stats', () => {
    const d = describeHero('scout');
    expect(d.displayName).toBe('Scout Vex');
    expect(d.role).toBe('Ranged DPS / anti-air');
    expect(d.stats.maxHp).toBe(HEROES.scout.stats.maxHp);
    expect(d.unlockMapAfter).toBe(HEROES.scout.unlockMapAfter);
  });

  it('lists three abilities in q/w/e order, in static form', () => {
    const d = describeHero('rael');
    expect(d.abilities.map(a => a.slot)).toEqual(['q', 'w', 'e']);
    expect(d.abilities[0].label).toBe('Overcharge');
    expect(d.abilities[0].unlockLevel).toBe(HEROES.rael.stats.abilityUnlockLevels.q);
    expect(d.abilities[2].unlockLevel).toBe(HEROES.rael.stats.abilityUnlockLevels.e);
    // Static form: no live state on a codex entry.
    expect(d.abilities[0].state).toBeUndefined();
  });

  it('reports hero matchups as display-ready entries', () => {
    const d = describeHero('engineer');
    expect(d.effectiveAgainst).toEqual(
      expect.arrayContaining([
        { kind: 'enemy', type: 'titan', name: ENEMY_DEFS.titan.name, icon: ENEMY_DEFS.titan.icon },
      ])
    );
    expect(d.matchups).toBeUndefined();
  });

  it('returns null for an unknown hero', () => {
    expect(describeHero('nope')).toBeNull();
  });

  // HEROES[id] reaches Object.prototype for unowned keys; a garbage
  // descriptor (or a throw further down the pipeline) must not slip through.
  it('does not resolve prototype-chain properties as heroes', () => {
    expect(describeHero('toString')).toBeNull();
    expect(describeHero('constructor')).toBeNull();
    expect(describeHero('hasOwnProperty')).toBeNull();
  });

  it('describes every hero in HERO_ORDER', () => {
    for (const id of HERO_ORDER) {
      const d = describeHero(id);
      expect(d, `missing descriptor for ${id}`).not.toBeNull();
      expect(d.abilities.length).toBe(3);
    }
  });

  it('does not alias abilityUnlockLevels to the live balance table', () => {
    const original = HEROES.rael.stats.abilityUnlockLevels.q;
    const d = describeHero('rael');
    d.stats.abilityUnlockLevels.q = original + 100;
    expect(HEROES.rael.stats.abilityUnlockLevels.q).toBe(original);
  });
});

describe('describeAbility', () => {
  const rael = HEROES.rael;

  it('is available when the hero is unlocked, level is high enough, no cooldown', () => {
    const a = describeAbility(rael, 'q', { level: 1, heroUnlocked: true, cooldownRemaining: 0 });
    expect(a.state).toBe('available');
    expect(a.hotkey).toBe('Q');
    expect(a.cooldown).toBe(rael.abilities.q.cooldown);
    expect(a.effect).toBe(rael.abilities.q.tooltip);
    expect(a.lockReason).toBeNull();
  });

  it('reports remaining cooldown', () => {
    const a = describeAbility(rael, 'q', { level: 3, heroUnlocked: true, cooldownRemaining: 7 });
    expect(a.state).toBe('cooldown');
    expect(a.cooldownRemaining).toBe(7);
  });

  it('is locked by level below its unlock level, and says which level', () => {
    const a = describeAbility(rael, 'e', { level: 2, heroUnlocked: true, cooldownRemaining: 0 });
    expect(a.state).toBe('locked_level');
    expect(a.unlockLevel).toBe(rael.stats.abilityUnlockLevels.e);
    expect(a.lockReason).toBe(`Unlocks at level ${rael.stats.abilityUnlockLevels.e}`);
  });

  // Hero lock outranks level lock: in Hero Command a locked hero shows the
  // map to clear, not a level the player cannot reach yet anyway. Slot 'e'
  // (unlockLevel 3) at level 1 puts BOTH locks in play — that's what actually
  // pins the ordering; slot 'q' (unlockLevel 1) would pass regardless.
  it('is locked by the hero itself when the hero is not unlocked, even if the level lock would also apply', () => {
    const a = describeAbility(HEROES.scout, 'e', { level: 1, heroUnlocked: false, cooldownRemaining: 0 });
    expect(a.state).toBe('locked_hero');
    expect(a.lockReason).toBe('Clear Map 5 to unlock Scout Vex');
  });

  it('does not invent a map number when the hero has no unlock map', () => {
    const a = describeAbility(HEROES.rael, 'q', { level: 1, heroUnlocked: false, cooldownRemaining: 0 });
    expect(HEROES.rael.unlockMapAfter).toBeNull();
    expect(a.state).toBe('locked_hero');
    expect(a.lockReason).toBe(`${HEROES.rael.displayName} is locked`);
  });

  it('defaults to available-at-level-1 when no options are given', () => {
    expect(describeAbility(rael, 'q').state).toBe('available');
  });

  it('reads unlock levels from the hero data, not a hardcoded map', () => {
    for (const id of HERO_ORDER) {
      const def = HEROES[id];
      for (const slot of ['q', 'w', 'e']) {
        const a = describeAbility(def, slot, { level: 1, heroUnlocked: true, cooldownRemaining: 0 });
        expect(a.unlockLevel).toBe(def.stats.abilityUnlockLevels[slot]);
      }
    }
  });

  it('returns null for an unknown ability slot', () => {
    expect(describeAbility(rael, 'r', { level: 1, heroUnlocked: true, cooldownRemaining: 0 })).toBeNull();
  });

  // def.abilities[slot] reaches Object.prototype for unowned keys ('toString'
  // etc.), which would otherwise pass the guard and produce a garbage
  // descriptor (hotkey 'TOSTRING', every real field undefined).
  it('does not resolve prototype-chain properties as ability slots', () => {
    expect(describeAbility(rael, 'toString')).toBeNull();
    expect(describeAbility(rael, 'constructor')).toBeNull();
    expect(describeAbility(rael, 'hasOwnProperty')).toBeNull();
  });

  it('returns null when def itself is missing or malformed', () => {
    expect(describeAbility(null, 'q')).toBeNull();
    expect(describeAbility({}, 'q')).toBeNull();
  });
});
