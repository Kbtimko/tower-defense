// The one tier-4 hit implementation. The live game and the headless balance
// simulator both resolve a projectile impact through this, so a tower ability
// cannot behave one way on screen and another in the sim. Pure: no Phaser,
// never mutates an enemy; slowed/boss state is read only via the accessors the
// caller passes in.
import { DEATH_CLASS } from '../data/fx.js';

// Tower-def keys that Tower.upgrade must carry through from a tier-4 def.
export const T4_EFFECT_KEYS = ['shots', 'chain', 'cluster', 'slowedMult', 'bossStun'];

export function isBossType(type) {
  return DEATH_CLASS[type] === 'boss';
}

// Extra volleys prefer the enemies furthest along the path, since those are the
// ones about to leak; padding with the primary keeps the shot count honest when
// there is nothing else in range.
export function shotTargets(shots, primary, inRange) {
  const count = Math.max(1, shots);
  const others = inRange
    .filter((e) => e !== primary)
    .map((e, i) => ({ e, i }))
    .sort((a, b) => b.e.waypointIndex - a.e.waypointIndex || a.i - b.i)
    .map(({ e }) => e);
  const out = [primary];
  for (let i = 1; i < count; i++) out.push(others[i - 1] ?? primary);
  return out;
}

export function clusterPoints({ targetX, targetY, cluster }) {
  const pts = [];
  for (let i = 0; i < cluster.shells; i++) {
    const a = (2 * Math.PI * i) / cluster.shells;
    pts.push({ x: targetX + Math.cos(a) * cluster.spread, y: targetY + Math.sin(a) * cluster.spread });
  }
  return pts;
}

export function resolveHit(proj, enemies, { isSlowed, isBoss }) {
  const { target, targetX, targetY, damage, splashRadius, chain, cluster } = proj;
  const live = enemies.filter((e) => !e.dead);
  const raw = [];

  if (splashRadius > 0) {
    for (const e of live) {
      if (Math.hypot(e.x - targetX, e.y - targetY) <= splashRadius) {
        raw.push({ enemy: e, amount: damage, isAoe: true, chainFrom: null });
      }
    }
  } else if (target && !target.dead) {
    raw.push({ enemy: target, amount: damage, isAoe: false, chainFrom: null });
    if (chain) {
      const hit = new Set([target]);
      let prev = target;
      let amt = damage;
      // `targets` counts the primary, so a chain of 3 is the primary plus 2 jumps.
      for (let links = 1; links < chain.targets; links++) {
        let best = null;
        let bestD = Infinity;
        for (const e of live) {
          if (hit.has(e)) continue;
          const d = Math.hypot(e.x - prev.x, e.y - prev.y);
          if (d <= chain.jumpRadius && d < bestD) { best = e; bestD = d; }
        }
        if (!best) break;
        amt *= chain.falloff;
        raw.push({ enemy: best, amount: amt, isAoe: false, chainFrom: prev });
        hit.add(best);
        prev = best;
      }
    }
  } else {
    // Fizzle: the target died in flight, so there is nothing to chain from or
    // to scatter bomblets around.
    return [];
  }

  if (cluster) {
    for (const p of clusterPoints(proj)) {
      for (const e of live) {
        if (Math.hypot(e.x - p.x, e.y - p.y) <= cluster.radius) {
          raw.push({ enemy: e, amount: damage * cluster.damageFrac, isAoe: true, chainFrom: null });
        }
      }
    }
  }

  return raw.map((r) => ({
    enemy: r.enemy,
    amount: r.amount,
    isAoe: r.isAoe,
    hitMult: proj.slowedMult > 1 && isSlowed(r.enemy) ? proj.slowedMult : 1,
    slow: proj.slowFactor > 0 ? { duration: proj.slowDuration, factor: proj.slowFactor } : null,
    stun: proj.bossStun > 0 && isBoss(r.enemy) ? { duration: proj.bossStun } : null,
    chainFrom: r.chainFrom ?? null,
  }));
}
