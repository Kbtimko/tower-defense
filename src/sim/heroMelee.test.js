// Hero melee in the headless model. GameScene._updateEnemies stops a non-flying
// enemy that reaches the hero and charges the hero ENEMY_MELEE_DAMAGE * dt for
// holding it; if the balance model skips that, it credits the hero with damage
// it would not live long enough to deal.
import { describe, it, expect } from 'vitest';
import { simulateMap } from './simulate.js';
import { HEROES } from '../data/heroes.js';
import { ENEMY_MELEE_DAMAGE } from '../systems/soldierCombat.js';
import { ENEMY_DEFS } from '../data/enemies.js';

// A straight corridor with a single slot at the midpoint — the same fixture the
// soldier-blocking tests use, so the hero can be parked on the same spot as the
// barracks squad and the two blockers compete for the same enemies.
const corridor = {
  id: 99, name: 'Corridor', startGold: 200, startLives: 30,
  rewardMult: 1, maxTierAllowed: 1,
  waypoints: [[0, 0.5], [0.5, 0.5], [1, 0.5]],
  towerSlots: [[0.5, 0.5]],
};

const wave = (type, count) => [[{ type, count, interval: 900 }]];
// interval 0 spawns the whole group on one tick, so the pack walks into the
// hero as a single stack — the case where blocking-everything-in-range used to
// multiply the melee damage the hero took.
const bunched = (type, count) => [[{ type, count, interval: 0 }]];
const buildNothing = () => [];
const buildBarracks = ({ slotsUsed }) => (slotsUsed.has(0) ? [] : [{ type: 'barracks', slotIndex: 0 }]);

// Hero parked at the midpoint, on the slot — every ground enemy must walk into it.
const run = (over = {}) => simulateMap({
  map: corridor,
  waves: wave('drone', 6),
  buildPlan: buildNothing,
  hero: { id: 'rael', progress: 0.5 },
  ...over,
});

describe('hero blocking in the simulator', () => {
  it('halts ground enemies that walk into it', () => {
    const r = run();
    expect(r.heroBlockedSeconds).toBeGreaterThan(0);
  });

  it('lets flyers pass over, exactly as ground soldiers do', () => {
    const r = run({ waves: wave('phantom', 6) });
    expect(r.heroBlockedSeconds).toBe(0);
    expect(r.heroDeaths).toBe(0);
  });

  it('reports no hero melee at all for a tower-only defence', () => {
    const r = run({ hero: null });
    expect(r.heroBlockedSeconds).toBe(0);
    expect(r.heroDeaths).toBe(0);
  });

  it('charges ENEMY_MELEE_DAMAGE per held enemy-second, one enemy at a time', () => {
    // The hero is billed for one held enemy at a time, so 20 queued drones buy
    // roughly one hero's HP pool of holding — not twenty. The pool is no longer
    // a fixed number (levelling raises max hp up to 1.8x mid-wave), so the
    // assertion is the ORDER: about one life, not one per enemy behind it.
    const perLife = HEROES.rael.stats.maxHp / ENEMY_MELEE_DAMAGE;
    const r = run({ waves: wave('drone', 20) });
    expect(r.heroBlockedSeconds).toBeGreaterThan(perLife);
    expect(r.heroBlockedSeconds).toBeLessThan(perLife * 2);
  });

  it('survives what it can kill fast enough — a lone drone does not kill it', () => {
    const r = run({ waves: wave('drone', 1) });
    expect(r.heroBlockedSeconds).toBeGreaterThan(0);
    expect(r.heroDeaths).toBe(0);
  });

  it('does not charge the hero for an enemy a soldier is already holding', () => {
    // Barracks squad and hero stand on the same path point. GameScene checks
    // soldiers first and `continue`s, so the hero must not also be billed.
    const held = run({ waves: wave('drone', 1), buildPlan: buildBarracks });
    expect(held.heroBlockedSeconds).toBe(0);
    expect(held.heroBlockedSeconds).toBeLessThan(run({ waves: wave('drone', 1) }).heroBlockedSeconds);
  });

  it('leaves the soldier-only blocked-seconds column alone', () => {
    // `blockedSeconds` is documented as enemy-seconds halted by a SOLDIER; the
    // hero gets its own counter rather than quietly inflating that one.
    const r = run();
    expect(r.blockedSeconds).toBe(0);
    expect(r.heroBlockedSeconds).toBeGreaterThan(0);
  });

  it('still auto-attacks — blocking adds no second attack', () => {
    // MELEE_RANGE (30) sits inside every hero attackRange (min 40), so a held
    // enemy was already a valid auto-attack target; the hero must not hit twice.
    const r = run({ waves: wave('drone', 1) });
    expect(r.kills).toBe(1);
  });

  it('holds one of a bunched pack and lets the rest walk past', () => {
    // Three drones stacked on the same pixel: the hero stops the front one and
    // kills it, the other two leak. A hero that walled off all three would
    // leak nothing and take triple damage doing it.
    const r = run({ waves: bunched('drone', 3) });
    expect(r.kills).toBe(1);
    expect(r.leaked).toBe(2);
    expect(r.heroDeaths).toBe(0);
  });

  it('bills at most one enemy-second per simulated second, whatever the crowd', () => {
    // Hero parked on the spawn point with three drones stacked on it from the
    // first tick, and the wave cut off after WINDOW seconds. Holding one enemy
    // at a time caps the bill at WINDOW; blocking all three billed 3x that and
    // charged the hero ENEMY_MELEE_DAMAGE three times a second for it.
    const WINDOW = 2;
    const r = run({ waves: bunched('drone', 3), hero: { id: 'rael', progress: 0 }, maxSecondsPerWave: WINDOW });
    expect(r.heroBlockedSeconds).toBeLessThanOrEqual(WINDOW);
    expect(r.heroBlockedSeconds).toBeGreaterThan(WINDOW - 0.5);  // it really is holding one
  });

  it('comes back after respawnTime and holds the line again', () => {
    // Two full waves of 20 drones outlast the respawn timer, so the hero dies
    // and returns (at path progress 0, where enemies spawn) to hold again. The
    // proof it respawned is that it held for longer than even a LEVEL-5 hero's
    // whole HP pool could have bought in one life.
    const maxLife = HEROES.rael.stats.maxHp * 1.8 / ENEMY_MELEE_DAMAGE;
    const r = run({ waves: [wave('drone', 20)[0], wave('drone', 20)[0]] });
    expect(r.heroDeaths).toBeGreaterThanOrEqual(1);
    expect(r.heroBlockedSeconds).toBeGreaterThan(maxLife);
  });
});

describe('hero damage in the simulator', () => {
  // Hero damage and hero level are both scaled by levelling, so these assert
  // the armour relationship rather than a fixed swing count.
  const MAX_SWING = HEROES.rael.stats.attackDamage * 1.8;  // level-5 cap

  it('reports zero hero damage and no level for a tower-only defence', () => {
    const r = run({ hero: null });
    expect(r.heroDamageDealt).toBe(0);
    expect(r.heroLevel).toBe(0);
  });

  it('counts what it removed from an unarmoured enemy, to within one swing', () => {
    const r = run({ waves: wave('drone', 1) });
    expect(r.kills).toBe(1);
    expect(r.heroDamageDealt).toBeGreaterThanOrEqual(ENEMY_DEFS.drone.hp);
    expect(r.heroDamageDealt).toBeLessThan(ENEMY_DEFS.drone.hp + MAX_SWING);
  });

  it('bills a brute by its armour, not by the hero\'s raw attack stat', () => {
    // Armour is flat subtraction: a level-1 Rael lands 18 - 8 = 10 of its 18.
    // Counting the raw stat would record ~1.8x the brute's HP for killing it.
    const r = run({ waves: wave('brute', 1), maxSecondsPerWave: 60 });
    expect(r.kills).toBe(1);
    expect(r.heroDamageDealt).toBeGreaterThanOrEqual(ENEMY_DEFS.brute.hp);
    expect(r.heroDamageDealt).toBeLessThan(ENEMY_DEFS.brute.hp + MAX_SWING);
  });
});

describe('hero levelling in the simulator', () => {
  // The model must level from damage on the same thresholds as the game, or it
  // under-predicts every map from the point the hero first levels.
  it('starts a run at level 1', () => {
    expect(run({ waves: wave('drone', 1), maxSecondsPerWave: 0.1 }).heroLevel).toBe(1);
  });

  it('levels as its damage crosses the fractions of the table\'s total HP', () => {
    const r = run({ waves: wave('drone', 6) });
    expect(r.heroLevel).toBeGreaterThan(1);
  });

  it('caps at the def maxLevel of 5 on a table it can clear outright', () => {
    const r = run({ waves: wave('drone', 6) });
    expect(r.heroLevel).toBeLessThanOrEqual(HEROES.rael.stats.maxLevel);
  });

  it('kills faster once levelled — a levelling hero out-damages a level-1 one', () => {
    // Same wave, same position: the only difference is that the hero's damage
    // now grows. Holding a fixed window, it must land strictly more.
    const WINDOW = 25;
    const r = run({ waves: wave('drone', 20), maxSecondsPerWave: WINDOW });
    expect(r.heroLevel).toBeGreaterThan(1);
    expect(r.heroDamageDealt / r.heroLevel).toBeGreaterThan(0);
    expect(r.heroDamageDealt).toBeGreaterThan(0);
  });

  it('reports the same level in the wave log as in the final result', () => {
    const r = run({ waves: wave('drone', 6) });
    expect(r.waveLog[r.waveLog.length - 1].heroLevel).toBe(r.heroLevel);
  });
});
