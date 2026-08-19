// Headless combat simulator.
//
// Runs a map's real waves against a modelled defence with no Phaser, no canvas
// and no renderer, so balance questions ("is map 7 winnable? how much slack?")
// can be answered in milliseconds instead of by hand-playing ten levels.
//
// Fidelity contract — this file deliberately reuses the game's own modules
// rather than re-deriving their behaviour:
//   * PathManager       — the same dense sampled curve enemies actually walk
//   * WaveManager       — the same spawn queue, intervals and per-wave HP scaling
//   * ENEMY_DEFS/TOWER_DEFS — the same stat tables
//   * computeDamage     — the same armour/weakness/vulnerable arithmetic
// The update order below mirrors GameScene.update: enemies move, then towers
// fire, then projectiles travel.
//
// Stated simplifications (all make the model PESSIMISTIC, so a map the
// simulator wins is winnable in practice):
//   * No hero, soldiers, sentries or abilities — towers only.
//   * No send-wave-early bonus, so gold income is the floor, not the ceiling.
//   * Tower tiers are honoured up to the map's maxTierAllowed, but Tier-4
//     branch choice is not modelled (branch A is assumed).
// A map the simulator LOSES is therefore not automatically broken; it means a
// plain tower-only defence is not sufficient, which is the signal worth
// looking at.
import { PathManager } from '../systems/PathManager.js';
import { WaveManager } from '../systems/WaveManager.js';
import { TOWER_DEFS } from '../data/towers.js';
import { computeDamage } from '../systems/damage.js';

const PROJECTILE_SPEED = 280;   // Projectile.js
const WAVE_CLEAR_BONUS = 38;    // GameScene.js
const DESIGN_WIDTH     = 1280;
const DESIGN_HEIGHT    = 720;

// Minimal stand-in for Phaser's event emitter — WaveManager only ever emits.
class Emitter {
  constructor() { this._handlers = {}; }
  on(evt, fn) { (this._handlers[evt] ??= []).push(fn); }
  emit(evt, payload) { for (const fn of this._handlers[evt] ?? []) fn(payload); }
}

function makeTower(type, x, y) {
  const def = TOWER_DEFS[type];
  return {
    type, x, y,
    range: def.range,
    damage: def.damage,
    fireRate: def.fireRate,
    splashRadius: def.splashRadius,
    pierce: def.pierce,
    slow: def.slow,
    level: 1,
    branch: null,
    cooldown: 0,
  };
}

export function simulateMap({
  map,
  waves,
  buildPlan,                  // (ctx) => [{ type, slotIndex }] chosen between waves
  dt = 1 / 30,
  maxSecondsPerWave = 240,
  width = DESIGN_WIDTH,
  height = DESIGN_HEIGHT,
  killGoldMult = 1,
}) {
  const pathMgr = new PathManager(map.waypoints, map.towerSlots, width, height);
  const path = pathMgr.path;
  const start = path[0];
  const rewardMult = map.rewardMult ?? 1;

  const emitter = new Emitter();
  const waveMgr = new WaveManager(waves, emitter);

  let gold = map.startGold;
  let lives = map.startLives;
  const towers = [];
  const slotsUsed = new Set();
  let enemies = [];
  let projectiles = [];
  let kills = 0;
  let leaked = 0;

  emitter.on('enemy:spawn', ({ def, scaleFactor }) => {
    enemies.push({
      def,
      hp: def.hp * scaleFactor,
      maxHp: def.hp * scaleFactor,
      armor: def.armor,
      reward: def.reward,
      x: start.x, y: start.y,
      waypointIndex: 0,
      dead: false,
      slow: { active: false, timer: 0, factor: 1 },
    });
  });

  const killReward = reward => Math.round(reward * killGoldMult * rewardMult);

  const waveLog = [];

  for (let w = 0; w < waves.length; w++) {
    // ── Build phase: spend gold before the wave starts ──────────────────────
    const purchases = buildPlan({
      gold, towers, slotsUsed, buildZones: pathMgr.buildZones, path, waveNumber: w + 1, map,
    }) ?? [];
    for (const p of purchases) {
      if (p.upgrade) {
        // Upgrade an existing tower one tier (mirrors Tower.upgrade).
        const t = towers[p.towerIndex];
        if (!t) continue;
        const nextTier = t.level + 1;
        const key = nextTier === 4 ? 'tier4A' : `tier${nextTier}`;
        const tierDef = TOWER_DEFS[t.type][key];
        if (!tierDef || nextTier > (map.maxTierAllowed ?? 4) || tierDef.cost > gold) continue;
        gold -= tierDef.cost;
        t.level = nextTier;
        if (tierDef.damage       !== undefined) t.damage       = tierDef.damage;
        if (tierDef.range        !== undefined) t.range        = tierDef.range;
        if (tierDef.splashRadius !== undefined) t.splashRadius = tierDef.splashRadius;
        if (tierDef.slow         !== undefined) t.slow         = tierDef.slow;
        if (tierDef.fireRate     !== undefined) t.fireRate     = tierDef.fireRate;
        if (tierDef.pierce       !== undefined) t.pierce       = tierDef.pierce;
        if (nextTier === 4)                     t.branch       = 'A';
        continue;
      }
      const cost = TOWER_DEFS[p.type].cost;
      const zone = pathMgr.buildZones[p.slotIndex];
      if (cost > gold || !zone || slotsUsed.has(p.slotIndex)) continue;
      gold -= cost;
      slotsUsed.add(p.slotIndex);
      towers.push(makeTower(p.type, zone.cx, zone.cy));
    }

    const goldAtWaveStart = gold;
    const livesAtWaveStart = lives;
    waveMgr.startWave();

    // ── Combat phase ───────────────────────────────────────────────────────
    let elapsed = 0;
    while (elapsed < maxSecondsPerWave) {
      waveMgr.update(dt * 1000);

      // Enemies move (GameScene._updateEnemies)
      for (const e of enemies) {
        if (e.slow.active) {
          e.slow.timer -= dt;
          if (e.slow.timer <= 0) e.slow = { active: false, timer: 0, factor: 1 };
        }
        const speed = e.slow.active ? e.def.speed * e.slow.factor : e.def.speed;
        let rem = speed * dt;
        while (rem > 0 && e.waypointIndex < path.length - 1) {
          const tgt = path[e.waypointIndex + 1];
          const dx = tgt.x - e.x, dy = tgt.y - e.y;
          const dist = Math.hypot(dx, dy);
          if (dist <= rem) {
            e.x = tgt.x; e.y = tgt.y; e.waypointIndex++; rem -= dist;
          } else {
            e.x += (dx / dist) * rem; e.y += (dy / dist) * rem; rem = 0;
          }
        }
        if (e.waypointIndex >= path.length - 1) {
          e.dead = true;
          leaked++;
          lives--;
        }
      }
      enemies = enemies.filter(e => !e.dead);

      // Towers fire at the furthest-along enemy in range (GameScene._updateTowers)
      for (const t of towers) {
        if (!t.fireRate) continue;
        t.cooldown = Math.max(0, t.cooldown - dt);
        if (t.cooldown > 0) continue;
        let best = null, bestProg = -1;
        for (const e of enemies) {
          if (Math.hypot(e.x - t.x, e.y - t.y) <= t.range && e.waypointIndex > bestProg) {
            best = e; bestProg = e.waypointIndex;
          }
        }
        if (best) {
          projectiles.push({
            x: t.x, y: t.y, target: best, targetX: best.x, targetY: best.y,
            damage: t.damage, splashRadius: t.splashRadius, pierce: t.pierce,
            slowFactor: t.slow, towerType: t.type, tier: t.level, branch: t.branch,
            dead: false,
          });
          t.cooldown = 1 / t.fireRate;
        }
      }

      // Projectiles travel and hit (GameScene._updateProjectiles / _onProjectileHit)
      for (const p of projectiles) {
        if (p.target && !p.target.dead) { p.targetX = p.target.x; p.targetY = p.target.y; }
        const dx = p.targetX - p.x, dy = p.targetY - p.y;
        const dist = Math.hypot(dx, dy);
        if (dist < 10) {
          const source = { kind: 'tower', type: p.towerType, tier: p.tier, branch: p.branch };
          const hits = p.splashRadius > 0
            ? enemies.filter(e => Math.hypot(e.x - p.targetX, e.y - p.targetY) <= p.splashRadius)
            : (p.target && !p.target.dead ? [p.target] : []);
          for (const e of hits) {
            e.hp -= computeDamage({
              amount: p.damage, armor: e.armor, pierce: p.pierce,
              source, enemyType: e.def.type,
            });
            if (e.hp <= 0 && !e.dead) {
              e.dead = true; kills++; gold += killReward(e.reward);
            } else if (p.splashRadius === 0 && p.slowFactor > 0) {
              e.slow = { active: true, timer: 2, factor: p.slowFactor };
            }
          }
          p.dead = true;
        } else {
          const step = Math.min(PROJECTILE_SPEED * dt, dist);
          p.x += (dx / dist) * step; p.y += (dy / dist) * step;
        }
      }
      projectiles = projectiles.filter(p => !p.dead);
      enemies = enemies.filter(e => !e.dead);

      elapsed += dt;
      if (lives <= 0) break;
      if (!waveMgr.hasQueuedEnemies && enemies.length === 0) break;
    }

    if (lives > 0) gold += Math.round(WAVE_CLEAR_BONUS * rewardMult);

    waveLog.push({
      wave: w + 1,
      goldAtWaveStart,
      goldAfter: gold,
      towersBuilt: towers.length,
      livesLost: livesAtWaveStart - lives,
      livesRemaining: lives,
      timedOut: elapsed >= maxSecondsPerWave,
    });

    if (lives <= 0) {
      return {
        map: map.id, name: map.name, won: false,
        wavesSurvived: w, totalWaves: waves.length,
        livesRemaining: 0, livesLost: map.startLives,
        goldFinal: gold, towersBuilt: towers.length, kills, leaked, waveLog,
      };
    }
  }

  return {
    map: map.id, name: map.name, won: true,
    wavesSurvived: waves.length, totalWaves: waves.length,
    livesRemaining: lives, livesLost: map.startLives - lives,
    goldFinal: gold, towersBuilt: towers.length, kills, leaked, waveLog,
  };
}
