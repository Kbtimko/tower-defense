// Hero melee in the headless model. GameScene._updateEnemies stops a non-flying
// enemy that reaches the hero and charges the hero ENEMY_MELEE_DAMAGE * dt for
// holding it; if the balance model skips that, it credits the hero with damage
// it would not live long enough to deal.
import { describe, it, expect } from 'vitest';
import { simulateMap } from './simulate.js';
import { HEROES } from '../data/heroes.js';
import { ENEMY_MELEE_DAMAGE } from '../systems/soldierCombat.js';

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

  it('charges exactly ENEMY_MELEE_DAMAGE per held enemy-second, until it dies', () => {
    // The hero is billed for one held enemy at a time, so one life buys exactly
    // maxHp / ENEMY_MELEE_DAMAGE seconds of holding no matter how many enemies
    // are queued up behind it. Landing on the number also proves the hero stops
    // being billed the moment it dies.
    const perLife = HEROES.rael.stats.maxHp / ENEMY_MELEE_DAMAGE;
    const r = run({ waves: wave('drone', 20) });
    expect(r.heroDeaths).toBe(1);
    expect(r.heroBlockedSeconds).toBeCloseTo(perLife, 1);
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
    // A second wave outlasts the respawn timer, so the hero returns (at path
    // progress 0, where enemies spawn) and buys another full life of holding.
    // Both waves need the full 20 drones: holding one enemy at a time, a life
    // is 12.5 enemy-seconds, which a short wave no longer spends.
    const perLife = HEROES.rael.stats.maxHp / ENEMY_MELEE_DAMAGE;
    const r = run({ waves: [wave('drone', 20)[0], wave('drone', 20)[0]] });
    expect(r.heroDeaths).toBe(2);
    expect(r.heroBlockedSeconds).toBeCloseTo(2 * perLife, 1);
  });
});
