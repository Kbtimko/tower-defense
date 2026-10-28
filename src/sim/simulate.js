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
//   * soldierCombat     — the same block test, melee trade and respawn timers
//   * heroLeveling      — the same XP thresholds and per-level stat scaling
// The update order below mirrors GameScene.update: enemies move (or, if a
// soldier blocks them, trade melee and stay put), then towers fire, then
// projectiles travel, then soldiers tick.
//
// Stated simplifications (all make the model PESSIMISTIC, so a map the
// simulator wins is winnable in practice):
//   * The hero auto-attacks and melee-blocks, but never uses abilities
//     (Overcharge, Airstrike, EMP are all real damage/utility this model leaves
//     on the table). Rally Point, which heals soldiers, is part of what is left
//     out. It also never repositions: a player pulls a hurt hero out of melee to
//     regenerate and walks it back after a death, where this model leaves it
//     standing in the enemy's way at path progress 0 until the wave ends.
//   * Soldiers block, trade melee and respawn, but the player never repositions
//     them: they stand where GameScene puts them on placement, on the path point
//     nearest the barracks. A player who walks a squad onto a chokepoint gets
//     more out of a barracks than this model does.
//   * No sentries.
//   * No early wave calls, so no send-wave-early bonus: gold income is the
//     floor, not the ceiling. In 'countdown' mode (the shipped game) the next
//     wave sends only when the countdown reaches zero.
//   * The player dismisses every between-wave banner instantly, so the model
//     never gets the countdown hold a real player gets while reading one (that
//     hold only adds player time).
//   * Tower tiers are honoured up to the map's maxTierAllowed, but Tier-4
//     branch choice is not modelled (branch A is assumed) — so Rapid Response
//     (4 soldiers, half respawn) never appears.
//   * No meta upgrades, so soldierMaxHpBonus / soldierRespawnMult are absent.
// One simplification runs the other way (OPTIMISTIC): in 'countdown' mode, a
// countdown waited out on an empty board gives soldiers and the hero extra
// regen and respawn time that a player who calls waves early would not get.
// A map the simulator LOSES is therefore not automatically broken; it means a
// defence built to this policy is not sufficient, which is the signal worth
// looking at.
import { PathManager } from '../systems/PathManager.js';
import { WaveManager } from '../systems/WaveManager.js';
import { TOWER_DEFS } from '../data/towers.js';
import { computeDamage } from '../systems/damage.js';
import { pointAtProgress } from '../systems/pathGeometry.js';
import { HEROES } from '../data/heroes.js';
import { heroSource, soldierSource } from '../data/sourceBuilders.js';
import {
  ENEMY_MELEE_DAMAGE, SOLDIER_ATTACK_RATE,
  findBlockingSoldier, damageSoldier, tickSoldier, heroBlocksEnemy,
  soldierMaxHp, soldierRespawnDuration,
} from '../systems/soldierCombat.js';
import { makeHeroUnit, damageHeroUnit, tickHeroUnit, registerHeroUnitDamage } from './heroUnit.js';
import { heroAttackDamage } from '../systems/heroLeveling.js';
import { totalEnemyHp } from '../data/waves.js';
import { countdownMsFor, shouldStartCountdown, WaveCountdown } from '../systems/waveCountdown.js';

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
    soldierStats: def.soldierStats?.tier1 ?? null,
    soldiers: [],
    soldierPathProgress: 0,
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

// Mirrors Barracks.spawnSoldiers: every soldier in a squad stands on the same
// spot — the path point nearest the barracks, as GameScene assigns on placement
// — so only one blocks at a time and the rest are queued replacements.
function spawnSoldiers(tower, path) {
  const stats = tower.soldierStats;
  const { x, y } = pointAtProgress(path, tower.soldierPathProgress);
  tower.soldiers = [];
  for (let i = 0; i < stats.count; i++) {
    const maxHp = soldierMaxHp(stats);
    tower.soldiers.push({
      x, y,
      hp: maxHp, maxHp,
      damage: stats.damage,
      respawnDuration: soldierRespawnDuration(stats),
      canBlockFlyers: stats.canBlockFlyers,
      attackTimer: 0,
      respawnTimer: 0,
      dead: false,
      barracks: tower,          // soldierSource() reads its tier and branch
    });
  }
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
  // The hero is always present in a real run and, unlike towers, costs no gold.
  // It blocks ground enemies and takes melee for it, so it can die and respawn
  // here exactly as in GameScene. Position is a player choice; total exposure is
  // roughly position-independent for a stationary hero, so mid-path is a fair
  // default. Pass hero: null to model a tower-only defence.
  hero = { id: 'rael', progress: 0.5 },
  // Uniform scaling on all outgoing damage. Not a game mechanic — a probe. By
  // solving for the smallest value that wins a map, we turn "this model loses"
  // into "the systems this model omits must be worth about this much".
  damageMult = 1,
  // 'countdown' (the shipped game, #51): the next wave sends a countdown after
  // the previous wave's last spawn, so waves can overlap. 'onClear' (legacy):
  // the next wave sends the tick the board clears — the pre-#51 model, kept so
  // calibration can compare against it.
  waveTiming = 'countdown',
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
  let blockedSeconds = 0;   // enemy-seconds spent halted by a soldier
  let soldierDeaths = 0;
  let heroBlockedSeconds = 0;  // enemy-seconds spent halted by the hero
  let heroDeaths = 0;
  // Post-armour damage the hero's auto-attack actually landed. Armour is flat
  // subtraction, so this is nothing like attackDamage x swings on an armoured
  // enemy — and it is the quantity hero levelling is paced against.
  let heroDamageDealt = 0;

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

  // Hero setup (mirrors Hero.update's auto-attack: nearest enemy in range) plus
  // the melee state it needs to be blocked-and-hit rather than invulnerable.
  const heroDef  = hero ? HEROES[hero.id] : null;
  const heroUnit = heroDef
    ? makeHeroUnit(heroDef, pointAtProgress(path, hero.progress ?? 0.5), totalEnemyHp(waves))
    : null;
  const heroSrc = heroDef ? heroSource(hero.id) : null;
  // Hero.respawn puts the hero back at path progress 0, not where it fell.
  const heroRespawnPoint = pointAtProgress(path, 0);
  let heroAttackTimer = 0;

  if (waveTiming !== 'countdown' && waveTiming !== 'onClear') {
    throw new Error(`simulateMap: unknown waveTiming '${waveTiming}'`);
  }

  const waveLog = [];
  const clearBonus = Math.round(WAVE_CLEAR_BONUS * rewardMult);
  const countdown = waveTiming === 'countdown' ? new WaveCountdown() : null;
  let soldiers = [];
  let sends = 0;          // waves sent so far — the legacy loop's wave counter
  let open = null;        // the latest send's log row, closed at the next send
  let sinceSend = 0;      // seconds since the latest send: the legacy per-wave clock
  let ticks = 0;
  let overlapSends = 0;   // sends made with enemies still on the board
  let boardClears = 0;    // clear bonuses paid for an empty board
  let timeouts = 0;       // advances forced by the maxSecondsPerWave safety valve

  // ── Build phase: spend gold before each send ─────────────────────────────
  function build() {
    const purchases = buildPlan({
      gold, towers, slotsUsed, buildZones: pathMgr.buildZones, path, waveNumber: sends + 1, map, waves,
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
        // Barracks gain nothing from the tier stat block; their upgrade lands on
        // the soldiers (Barracks.upgrade + _rebuildSoldiers, which respawns the
        // squad at full strength with the new stats).
        if (t.type === 'barracks') {
          t.soldierStats = TOWER_DEFS.barracks.soldierStats[key] ?? t.soldierStats;
          spawnSoldiers(t, path);
        }
        continue;
      }
      const cost = TOWER_DEFS[p.type].cost;
      const zone = pathMgr.buildZones[p.slotIndex];
      if (cost > gold || !zone || slotsUsed.has(p.slotIndex)) continue;
      gold -= cost;
      slotsUsed.add(p.slotIndex);
      const tower = makeTower(p.type, zone.cx, zone.cy);
      if (tower.soldierStats) {
        tower.soldierPathProgress = pathMgr.getNearestPathProgress(zone.cx, zone.cy);
        spawnSoldiers(tower, path);
      }
      towers.push(tower);
    }

    // Towers only change at a send, so the roster is fixed until the next one.
    soldiers = towers.flatMap(t => t.soldiers);
  }

  // One row per send, covering "this send to the next" — under 'onClear' that
  // is exactly the legacy per-wave row.
  function closeLog() {
    waveLog.push({
      wave: open.wave,
      goldAtWaveStart: open.goldAtWaveStart,
      goldAfter: gold,
      towersBuilt: towers.length,
      livesLost: open.livesAtSend - lives,
      livesRemaining: lives,
      heroDamageDealt,          // cumulative, so the levelling curve can be paced
      heroLevel: heroUnit?.level ?? 0,
      timedOut: sinceSend >= maxSecondsPerWave,
      sentAtMs: open.sentAtMs,
      spawnsDoneAtMs: open.spawnsDoneAtMs,
      rewardAliveAtSpawnsDone: open.rewardAliveAtSpawnsDone,
      overlapped: open.overlapped,
    });
    open = null;
  }

  // GameScene._startWave: build, then start the next wave. Cancelling the
  // countdown is what keeps it from re-arming for the wave just sent.
  function send() {
    if (open) closeLog();
    build();
    countdown?.cancel();
    if (enemies.length > 0) overlapSends++;
    open = {
      wave: sends + 1,
      goldAtWaveStart: gold,
      livesAtSend: lives,
      sentAtMs: ticks * dt * 1000,
      overlapped: enemies.length,
      spawnsDoneAtMs: null,
      rewardAliveAtSpawnsDone: null,
    };
    waveMgr.startWave();
    sends++;
    sinceSend = 0;
  }

  function result(won) {
    closeLog();
    return {
      map: map.id, name: map.name, won,
      wavesSurvived: won ? waves.length : sends - 1, totalWaves: waves.length,
      livesRemaining: won ? lives : 0, livesLost: won ? map.startLives - lives : map.startLives,
      goldFinal: gold, towersBuilt: towers.length, kills, leaked,
      blockedSeconds: Number(blockedSeconds.toFixed(2)), soldierDeaths,
      heroBlockedSeconds: Number(heroBlockedSeconds.toFixed(2)), heroDeaths,
      heroDamageDealt, heroLevel: heroUnit?.level ?? 0,
      overlapSends, boardClears, timeouts, waveLog,
    };
  }

  // ── One continuous combat loop; waves are sent into it ──────────────────
  send();
  for (;;) {
    waveMgr.update(dt * 1000);

    // Enemies move (GameScene._updateEnemies)
    // One hero, one held enemy per tick — the same frame-local flag
    // GameScene._updateEnemies carries, so the model bills the hero for at
    // most dt per tick instead of dt per enemy standing on it.
    let heroHolding = false;
    for (const e of enemies) {
      if (e.slow.active) {
        e.slow.timer -= dt;
        if (e.slow.timer <= 0) e.slow = { active: false, timer: 0, factor: 1 };
      }
      // Blocking (GameScene._updateEnemies): a blocked enemy skips the whole
      // movement loop and trades melee instead, so it sits inside tower range
      // for as long as a soldier survives in front of it.
      const blocker = soldiers.length > 0 ? findBlockingSoldier(e, soldiers) : null;
      if (blocker) {
        blockedSeconds += dt;
        if (damageSoldier(blocker, ENEMY_MELEE_DAMAGE * dt)) soldierDeaths++;
        if (blocker.attackTimer <= 0) {
          e.hp -= computeDamage({
            amount: blocker.damage * damageMult, armor: e.armor,
            source: soldierSource(blocker), enemyType: e.def.type,
          });
          blocker.attackTimer = 1 / SOLDIER_ATTACK_RATE;
          if (e.hp <= 0 && !e.dead) {
            e.dead = true; kills++; gold += killReward(e.reward);
          }
        }
        continue;
      }
      // Hero blocking, checked after soldiers exactly as GameScene does: a
      // soldier already holding this enemy wins, so the hero is not charged
      // for it as well. The hero does not strike back from here — its
      // auto-attack below already covers everything inside MELEE_RANGE.
      if (!heroHolding && heroBlocksEnemy(heroUnit, e)) {
        heroHolding = true;
        heroBlockedSeconds += dt;
        if (damageHeroUnit(heroUnit, ENEMY_MELEE_DAMAGE * dt)) heroDeaths++;
        continue;
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
            amount: p.damage * damageMult, armor: e.armor, pierce: p.pierce,
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

    // Soldier cooldowns and respawns (GameScene._updateSoldiers)
    for (const s of soldiers) tickSoldier(s, dt);

    // Hero regen / respawn, then auto-attack (GameScene._updateHero ->
    // Hero.update, which returns early while dead so neither the regen nor
    // the attack cooldown advances).
    if (heroDef) {
      if (tickHeroUnit(heroUnit, dt, heroRespawnPoint)) {
        heroAttackTimer = 1 / heroDef.stats.attackRate;  // Hero.respawn
      }
      if (!heroUnit.dead) {
        heroAttackTimer -= dt;
        if (heroAttackTimer <= 0) {
          const range = heroDef.stats.attackRange;
          let nearest = null, nearestDist = Infinity;
          for (const e of enemies) {
            if (e.dead) continue;
            const d = Math.hypot(e.x - heroUnit.x, e.y - heroUnit.y);
            if (d <= range && d < nearestDist) { nearest = e; nearestDist = d; }
          }
          if (nearest) {
            const dealt = computeDamage({
              amount: heroAttackDamage(heroDef.stats, heroUnit.level) * damageMult,
              armor: nearest.armor,
              source: heroSrc,
              enemyType: nearest.def.type,
            });
            nearest.hp -= dealt;
            heroDamageDealt += dealt;
            registerHeroUnitDamage(heroUnit, dealt);
            if (nearest.hp <= 0 && !nearest.dead) {
              nearest.dead = true; kills++; gold += killReward(nearest.reward);
            }
            heroAttackTimer = 1 / heroDef.stats.attackRate;
          }
        }
      }
    }

    enemies = enemies.filter(e => !e.dead);

    sinceSend += dt;
    ticks++;
    if (lives <= 0) return result(false);

    // Spawns done: the frame the countdown starts. Calibration reads the reward
    // still alive here — what the pre-#51 early-call bonus paid on.
    if (open.spawnsDoneAtMs === null && !waveMgr.hasQueuedEnemies) {
      open.spawnsDoneAtMs = ticks * dt * 1000;
      open.rewardAliveAtSpawnsDone = enemies.reduce((sum, e) => sum + e.def.reward, 0);
    }

    // Board clear (GameScene._checkWaveComplete): one bonus per empty board,
    // however many overlapping waves it took to get there.
    if (waveMgr.active && !waveMgr.hasQueuedEnemies && enemies.length === 0) {
      waveMgr.active = false;
      gold += clearBonus;
      boardClears++;
      if (sends === waves.length) return result(true);
      if (waveTiming === 'onClear') { send(); continue; }
    }

    // Countdown (GameScene._updateCountdown, which runs after the clear check).
    // Not ticked on its start frame, so the full length counts from the last
    // spawn. The modelled player never calls early: it sends only at zero.
    if (countdown) {
      if (shouldStartCountdown({
        spawnsDone: !waveMgr.hasQueuedEnemies, done: waveMgr.done,
        currentWave: waveMgr.currentWave, startedFor: countdown.startedFor,
      })) {
        countdown.start(countdownMsFor(map), waveMgr.currentWave);
      } else {
        countdown.tick(dt * 1000);
      }
      if (countdown.shouldAutoSend(true)) { send(); continue; }
    }

    // Timeout: the legacy safety valve, kept as it was — pay the clear bonus
    // anyway and move on; enemies still alive carry into the next wave, and a
    // timed-out final wave still counts as won.
    if (sinceSend >= maxSecondsPerWave) {
      timeouts++;
      gold += clearBonus;
      if (sends === waves.length) return result(true);
      send();
    }
  }
}
