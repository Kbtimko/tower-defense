// Structural rules the barracks table has to satisfy to be worth buying.
//
// A barracks was a net loss in the balance model (PR #53): a squad's total
// uptime was shorter than the time it took to come back, so the lane it was
// paid to hold was open more often than it was shut. These are the invariants
// behind that finding — they guard the shape of the table, not its exact
// numbers, so future retuning stays inside the rules rather than re-breaking
// them.
import { describe, it, expect } from 'vitest';
import { TOWER_DEFS } from './towers.js';
import { ENEMY_DEFS, ENEMY_MELEE_DAMAGE } from './enemies.js';

const SOLDIER_STATS = TOWER_DEFS.barracks.soldierStats;
const tiers = Object.entries(SOLDIER_STATS);

// How long a full squad can hold a lane against one attacker before the last
// soldier falls: every soldier's hp, spent at the rate an enemy deals it.
const squadUptime = s => (s.count * s.hp) / ENEMY_MELEE_DAMAGE;

describe('barracks squad uptime', () => {
  it.each(tiers)('%s holds the lane for at least as long as it takes to respawn', (_tier, stats) => {
    expect(squadUptime(stats)).toBeGreaterThanOrEqual(stats.respawnDuration);
  });

  it('gets no worse along the linear tier chain', () => {
    // tier4A and tier4B are siblings, not successors — 4B deliberately trades
    // raw hold time for more bodies and a faster respawn, so it is compared
    // against the tier it branches from rather than against 4A.
    const chain = ['tier1', 'tier2', 'tier3'].map(t => squadUptime(SOLDIER_STATS[t]));
    for (let i = 1; i < chain.length; i++) {
      expect(chain[i]).toBeGreaterThanOrEqual(chain[i - 1]);
    }
    for (const branch of ['tier4A', 'tier4B']) {
      expect(squadUptime(SOLDIER_STATS[branch])).toBeGreaterThanOrEqual(squadUptime(SOLDIER_STATS.tier3));
    }
  });
});

describe('barracks squad damage', () => {
  // A soldier attacks once per second and gets one attack in the moment it
  // engages, so it lands floor(lifetime) + 1 blows before dying.
  const squadDamage = s => {
    const lifetime = s.hp / ENEMY_MELEE_DAMAGE;
    return s.count * (Math.floor(lifetime) + 1) * s.damage;
  };

  it('a tier-1 squad can kill the basic enemy it blocks', () => {
    // Otherwise the barracks only ever delays a drone and never banks the gold
    // for the kill — which is what made it a losing purchase.
    expect(squadDamage(SOLDIER_STATS.tier1)).toBeGreaterThan(ENEMY_DEFS.drone.hp);
  });

  it.each(tiers)('%s out-damages what it costs to replace it', (_tier, stats) => {
    expect(squadDamage(stats)).toBeGreaterThan(0);
  });
});

describe('tier-4 branch identities', () => {
  it('Rapid Response really does halve the respawn time', () => {
    expect(SOLDIER_STATS.tier4B.respawnDuration).toBe(SOLDIER_STATS.tier3.respawnDuration / 2);
  });

  it('Rapid Response fields more soldiers than the tier it branches from', () => {
    expect(SOLDIER_STATS.tier4B.count).toBeGreaterThan(SOLDIER_STATS.tier3.count);
  });

  it('Vanguard is the only tier that blocks flyers', () => {
    const blockers = tiers.filter(([, s]) => s.canBlockFlyers).map(([t]) => t);
    expect(blockers).toEqual(['tier4A']);
  });
});

describe('ENEMY_MELEE_DAMAGE', () => {
  it('lives with the enemy stats it belongs to, as a tunable number', () => {
    expect(ENEMY_MELEE_DAMAGE).toBeGreaterThan(0);
  });

  it('leaves a tier-1 soldier alive long enough to swing more than once', () => {
    expect(SOLDIER_STATS.tier1.hp / ENEMY_MELEE_DAMAGE).toBeGreaterThan(1);
  });
});
