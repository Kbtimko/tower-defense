# Hero Roster — Design Spec

**Date:** 2026-05-30
**Backlog item:** #1 — Additional heroes with different skills
**Working title:** Roster of Last Light

---

## 1. Summary

Expand from a single hero (Commander Rael) to a roster of four selectable heroes. Each hero has a distinct archetype, stats, ability kit, and weakness-matrix matchups. Players choose their hero on `MapSelectScene` before each run. Three new heroes — **Engineer Dax**, **Scout Vex**, and **Pyromancer Mira** — unlock progressively by clearing campaign maps. The current Command Doctrine upgrade branch is restructured into four symmetric per-hero sub-branches. The `Hero` entity becomes data-driven, reading from a `HEROES` registry so future heroes are a one-config-entry addition.

---

## 2. Decisions

| Question | Decision |
|---|---|
| Where does selection happen? | MapSelectScene featured panel (between map blurb and Play button) |
| Unlock model | Rael available from start; Engineer / Scout / Pyromancer unlock after clearing Maps 3 / 5 / 7 (zero-indexed `unlockMapAfter: 2 / 4 / 6`) with ≥1 star |
| Roster scope | 4 heroes; modular data registry so future heroes are one-entry additions |
| Archetypes | Rael (generalist bruiser), Engineer Dax (support/builder), Scout Vex (ranged DPS / anti-air), Pyromancer Mira (AoE / burn / anti-swarm) |
| Upgrade tree | Per-hero branches replace the single Command branch — 4 symmetric 4-node sub-branches (`hp` / `rapid_redeploy` / `veteran` / `elite`) |
| Stat variance | Per-archetype stats (HP, range, move, damage, rate, respawn); shared Q/W/E layout, shared 25/75 kill curve, shared path-restricted movement |
| Visuals | Phaser primitives — per-hero color, silhouette, portrait char (matches Rael's existing style) |
| Architecture | Approach A — data registry. Single `Hero.js` class driven by `HEROES[heroId]` definition; ability impls are pure functions imported into the registry |
| Sentry kills count for Engineer? | **No** — sentry damage routes through `Enemy.takeDamage` but does not increment `Hero.killCount`. Leveling stays tied to personal kills, consistent across heroes |

---

## 3. Architecture & file map

| File | Action | Purpose |
|---|---|---|
| `src/data/heroes.js` | **new** | `HEROES` registry: 4 entries with stats, ability defs, draw fn, matchups, unlock metadata, upgrade-branch id |
| `src/data/heroAbilities.js` | **new** | 12 pure ability-impl functions (3 per hero) + Pyromancer's `onHit` callback. Each ability takes `(hero, scene, target?)` and returns the existing ability-result shape (or `null` on cooldown / dead) |
| `src/entities/Hero.js` | **refactor** | Drop hardcoded constants and `HERO_STATS` singleton; read `this.def = HEROES[heroId]` and drive everything from there. Add `fireAbility(slot, target?)` dispatcher and optional `def.onHit(hero, enemy)` callback after auto-attack lands. Preserve existing behavior (path-restricted move, attack, level, respawn) |
| `src/entities/SentryTurret.js` | **new** | Lightweight temporary turret entity for Engineer's W. ~80–100 LOC. Owns its position, lifespan, range, and fires via existing Projectile system. Owned by GameScene's `_sentries` list, not by `TowerPlacementManager` |
| `src/systems/AreaEffectsManager.js` | **new** | Generic active-effect system for Pyromancer's auras and ground pools. Effects can be static `(x, y)` or `followsTarget` (e.g., hero). Each tick: damage enemies in radius, optional `slow` status, despawn at duration end |
| `src/data/upgrades.js` | **restructure** | Replace flat `command` branch with four hero sub-branches (`rael_*`, `engineer_*`, `scout_*`, `pyro_*`). Each hero gets 4 symmetric nodes. Non-Rael nodes carry `heroUnlock` field |
| `src/systems/UpgradeManager.js` | **modify** | `getModifiers(heroId)` only applies the active hero's branch's stat-bonuses (plus shared logistics/arsenal). `canPurchase` respects `heroUnlock` gate. `getNodeState` returns new `'locked-hero'` state |
| `src/systems/SaveManager.js` | **modify** | Add `selectedHeroId: 'rael'` to envelope; bump `VERSION` to 3; migrate v2 → v3 (rename `cmd_*` → `rael_*`, default `selectedHeroId` to `'rael'`). Add `getSelectedHero()`, `setSelectedHero(id)`, `isHeroUnlocked(heroId)` |
| `src/data/weaknessMatrix.js` | **modify** | Remove `HERO_MULTIPLIERS` constant. `getWeaknessMultiplier({kind:'hero', heroId})` reads `HEROES[heroId].matchups`. `describeEnemyMatchups` walks every hero. `kind:'status'` source returns `1.0` (no double-dip on burn DoT) |
| `src/data/sourceBuilders.js` | **modify** | `heroSource(heroId)`, `heroAbilitySource(heroId, abilityId)`, new `burnSource()` |
| `src/scenes/MapSelectScene.js` | **modify** | Add `_renderHeroPicker()` (4 cards with portrait/name/lock state). Click sets `saveMgr.setSelectedHero(id)`. Pass `heroId` in `scene.start('GameScene', { mapId, heroId })`. Defensive: if persisted `selectedHeroId` is locked at mount time, reset to `'rael'` |
| `src/scenes/GameScene.js` | **modify** | Read `data.heroId`; pass to `Hero` constructor and to `UpgradeManager.getModifiers(heroId)`. Replace `_onAbility` switch with `this.hero.fireAbility(slot)` dispatcher. Emit `hero:hud-init` after Hero construction. New: `_updateSentries(dt)` and wire `AreaEffectsManager` |
| `src/scenes/UIScene.js` | **modify** | Subscribe to `hero:hud-init` — populate portrait char/color, level prefix, ability button icons + tooltips from `HEROES[heroId]`. Cache `_heroDef` for later `_onHeroLevelUp` use. Existing per-slot level-up unlock logic stays generic |
| `src/scenes/InspectController.js` | **modify** | `_renderHeroPanel` reads `hero.def` instead of `HERO_STATS` singleton. Header dynamic. `displayName` helper supports `hero:<id>` tokens for matchup chips |
| `src/ui/UpgradeTreeOverlay.js` | **modify** | Render 6 branches (4 hero + logistics + arsenal). Locked-hero nodes show grayed with 🔒 + "Clear Map N to unlock <Hero>" tooltip. Exact layout (4 hero tabs vs all-in-one scroll) resolved during plan-writing after re-reading the overlay file |
| `src/entities/Enemy.js` | **modify** | Add three new statuses: `burn` (DoT), `vulnerable` (incoming-damage multiplier), and (separately) `cloaked` becomes a flag on `Hero` (not `Enemy`) — enemy targeting skips `cloaked` units |
| `index.html` | **modify** | Add `#hero-picker` markup inside the featured panel + CSS for hero cards. Existing `#hero-section` markup unchanged — UIScene populates content dynamically |

**Estimated change size:** ~1500–1800 LOC added/changed, ~50–70 new tests. Significant, but one coherent feature → one PR.

---

## 4. Hero registry schema

`src/data/heroes.js`:

```js
import {
  raelOvercharge, raelAirstrike, raelEmp,
  engRepair, engDeployTurret, engPowerSurge,
  scoutMark, scoutVolley, scoutPhase,
  pyroFlameWave, pyroImmolate, pyroFirefield, pyroBurnOnHit,
} from './heroAbilities.js';

export const HERO_ORDER = ['rael', 'engineer', 'scout', 'pyro'];

export const HEROES = {
  rael: {
    id:              'rael',
    displayName:     'Commander Rael',
    shortName:       'Rael',
    portraitChar:    'R',
    bodyColor:       0x1a2a4a,
    strokeColor:     0x4fc3f7,
    unlockMapAfter:  null,                            // available from start
    upgradeBranchId: 'rael',
    stats: {
      maxHp: 150, moveSpeed: 130, attackRange: 40,
      attackRate: 1.5, attackDamage: 18, respawnTime: 20,
      maxLevel: 3,
      abilityUnlockLevels: { q: 1, w: 2, e: 3 },
    },
    abilities: {
      q: { id:'overcharge', label:'Overcharge', icon:'⚡', cooldown:30, aim:false, run: raelOvercharge,
           tooltip:'+50% tower fire rate for 6s' },
      w: { id:'airstrike',  label:'Airstrike',  icon:'🎯', cooldown:25, aim:true,  run: raelAirstrike,
           tooltip:'Click ground — 70px AoE, 80 damage' },
      e: { id:'emp_pulse',  label:'EMP Pulse',  icon:'💥', cooldown:45, aim:false, run: raelEmp,
           tooltip:'Stun all enemies for 3s' },
    },
    onHit:    null,
    matchups: { phantom: 1.5 },                       // preserved from current HERO_MULTIPLIERS
    draw(g) {
      g.fillStyle(0x1a2a4a, 1); g.fillCircle(0,-10,6); g.fillRect(-4,-4,8,10);
      g.lineStyle(2, 0x4fc3f7, 1); g.strokeCircle(0,-10,6); g.strokeRect(-4,-4,8,10);
    },
  },
  engineer: { /* see §5 */ },
  scout:    { /* see §5 */ },
  pyro:     { /* see §5 */ },
};
```

### Registry contract (enforced by `heroes.test.js`)

- Every id in `HERO_ORDER` has a `HEROES[id]` entry.
- Each entry has every required field: `id`, `displayName`, `shortName`, `portraitChar`, `bodyColor`, `strokeColor`, `unlockMapAfter`, `upgradeBranchId`, `stats`, `abilities`, `draw`, `onHit` (may be `null`), `matchups` (may be `{}`).
- Each `abilities.{q,w,e}` has `id`, `label`, `icon`, `cooldown`, `aim` (boolean), `run` (function), `tooltip`.
- `stats` has every key Hero.js reads: `maxHp`, `moveSpeed`, `attackRange`, `attackRate`, `attackDamage`, `respawnTime`, `maxLevel`, `abilityUnlockLevels.{q,w,e}`.
- `unlockMapAfter` is `null` or an integer in `[0, 9]`.
- `upgradeBranchId` matches a `branch` value in `upgrades.js`.

### Why this shape

- `stats` is self-contained — easy to read/edit during balancing.
- `abilities` keyed by slot mirrors the HUD layout. `aim:true` triggers GameScene aim mode; `aim:false` fires immediately.
- `run` returning `null` = no-op (on cooldown or dead). Returning anything else = ability fired (Hero increments the slot's cooldown timer to `cooldown`).
- `draw(g)` lives next to its data — no separate sprite registry.
- `onHit` is the only optional callback. `null` for Rael/Engineer/Scout, populated for Pyromancer.

---

## 5. The four heroes

All four share: Q/W/E slot layout, 25-kills → L2 / 75-kills → L3 curve, path-restricted movement (existing infrastructure), ability unlocks at L1/L2/L3 respectively.

### 5.1 Commander Rael — Generalist Bruiser *(existing — no behavior change)*

| Field | Value |
|---|---|
| Visual | Blue cyan-outlined humanoid (current `_drawBody`) |
| `portraitChar` | `R` |
| `bodyColor` / `strokeColor` | `0x1a2a4a` / `0x4fc3f7` |
| Stats | HP 150 · range 40 · move 130 · damage 18 · rate 1.5 · respawn 20s |
| Q — Overcharge (30s) | +50% fire rate on **all** towers for 6s (global) |
| W — Airstrike (25s, aim) | 70px AoE at clicked point, 80 damage (pierce) |
| E — EMP Pulse (45s) | Stun all living enemies for 3s |
| `onHit` | none |
| `matchups` | `{ phantom: 1.5 }` |
| `unlockMapAfter` | `null` (available from start) |
| `upgradeBranchId` | `rael` |

### 5.2 Engineer Dax — Support / Builder, anti-armor

| Field | Value |
|---|---|
| Visual | Orange/copper humanoid: hexagonal hardhat head (small hexagon), rectangular torso with a small backpack rect, copper outline |
| `portraitChar` | `E` |
| `bodyColor` / `strokeColor` | `0x4a2e1a` / `0xff9933` |
| Stats | HP 95 · range 60 · move 110 · damage 12 · rate 1.2 · respawn 20s |
| Q — Repair (20s) | Heal self +60 HP (capped at `maxHp`). Heal all soldiers within 100px to full HP. No aim |
| W — Deploy Turret (35s) | Spawn one `SentryTurret` at hero's current position (path-clamped). Turret: 80 HP, 100px range, 15 damage, 1.0 atk/s, 12s lifespan. Replaces previously-active sentry. No aim. Sentry kills do **not** count toward Engineer's killCount |
| E — Power Surge (50s) | All towers within 200px of hero get +100% fire rate for 8s (local burst-buff vs Rael's global +50%) |
| `onHit` | none |
| `matchups` | `{ brute: 1.25, colossus: 1.5, titan: 1.5 }` |
| `unlockMapAfter` | `2` (clear Map 3, zero-indexed) |
| `upgradeBranchId` | `engineer` |

### 5.3 Scout Vex — Ranged DPS, anti-air

| Field | Value |
|---|---|
| Visual | Green humanoid: smaller circle head, slim triangular torso, dark green outline — visibly smaller/leaner than Rael |
| `portraitChar` | `S` |
| `bodyColor` / `strokeColor` | `0x1e3a1e` / `0x3fb950` |
| Stats | HP 80 · range 140 · move 150 · damage 14 · rate 2.0 · respawn 18s |
| Q — Mark Target (20s, aim) | Click an enemy; that enemy gains `vulnerable` status for 6s → takes **2×** damage from all sources |
| W — Volley (30s) | Fires arrows at up to 8 enemies within 180px of hero; each takes 25 damage. Visual: 8 brief arrow lines from hero → each target |
| E — Phase Sprint (45s) | Hero becomes untargetable (`cloaked = true`) AND gains +100% move speed for 4s. Self-only |
| `onHit` | none |
| `matchups` | `{ drone: 1.5, phantom: 1.75, titan: 0.75 }` |
| `unlockMapAfter` | `4` (clear Map 5) |
| `upgradeBranchId` | `scout` |

### 5.4 Pyromancer Mira — AoE / Burn, anti-swarm

| Field | Value |
|---|---|
| Visual | Red/crimson humanoid: circle head with small flame tuft on top, wider torso, red outline. While `Immolate` active, faint orange aura ring rendered around hero |
| `portraitChar` | `P` |
| `bodyColor` / `strokeColor` | `0x4a1e1a` / `0xe74c3c` |
| Stats | HP 130 · range 45 · move 115 · damage 14 · rate 1.0 · respawn 22s |
| Q — Flame Wave (20s) | 90° cone in front of hero (facing = `_facingX`, default `+1`), 100px length, 30 damage + applies `burn` (5 dmg/s for 4s) to all enemies in arc |
| W — Immolate (30s) | For 8s: aura attached to hero deals 10 dmg/s to enemies within 60px; hero auto-attack damage ×1.5 during |
| E — Firefield (50s, aim) | Click ground; 100px-radius fire pool for 6s, 15 dmg/s + applies `slow` (factor 0.7) to enemies inside |
| `onHit` | `pyroBurnOnHit` — applies `burn` (3 dmg/s for 2s) on every auto-attack landing |
| `matchups` | `{ drone: 1.5, skitter: 2.0, brute: 1.25, titan: 0.5 }` |
| `unlockMapAfter` | `6` (clear Map 7) |
| `upgradeBranchId` | `pyro` |

### 5.5 Hero facing

Hero gets `_facingX` (1 or −1), default `+1`. Updated whenever `moveToProgress(target)` is called: `_facingX = target >= pathProgress ? 1 : -1`. Used by Pyromancer's Flame Wave cone direction. No visual flip required for v1.

---

## 6. New mechanical systems

### 6.1 New `Enemy` statuses

```js
statusEffects = {
  slow:       { active: false, timer: 0, factor: 1 },
  stun:       { active: false, timer: 0 },
  burn:       { active: false, timer: 0, dps: 0, tickAccum: 0 },
  vulnerable: { active: false, timer: 0, multiplier: 1 },
};
```

`Enemy.applyStatus(spec)`:
- `{type:'burn', duration, dps}` — set/refresh; if reapplied with higher `dps`, take the higher; otherwise refresh duration only (lets Pyro Q's stronger 5-dps burn override Pyro auto-attack's 3-dps burn).
- `{type:'vulnerable', duration, multiplier}` — set/refresh; `multiplier` replaces (don't stack).

`Enemy.update(dt)`:
- Tick burn `timer` down. Accumulate `tickAccum += dt`; while `tickAccum ≥ 1`, deduct 1 and call `this.takeDamage(dps, { source: burnSource() })`. Burn source returns 1.0 from weakness matrix → no double-dip.
- Tick vulnerable `timer` down; clear `active` at 0.

`Enemy.takeDamage(amount, opts)`:
- Existing weakness-multiplier path stays exactly as-is.
- After weakness multiplier applies, if `statusEffects.vulnerable.active`, multiply by `vulnerable.multiplier`. Order: `final = base × weakness × vulnerable`. So Mark Target stacks correctly with weakness matchups (Scout Q on a brute, then cannon shot → cannon weakness 1.5 × vulnerable 2.0 = ×3.0).

`Enemy._redrawBody()`:
- `burn` active → small orange glow ring or warm tint
- `vulnerable` active → faint red exclamation outline / dot

### 6.2 `cloaked` flag on `Hero`

```js
// Hero state additions
this.cloaked       = false;
this._cloakTimer   = 0;
```

- Scout's Phase Sprint sets `cloaked = true`, `_cloakTimer = 4`. Hero `update(dt)` ticks down; at 0 clears `cloaked`.
- Enemy target acquisition (wherever it currently scans towers/soldiers/hero for nearest threat — confirmed at implementation time) skips entities where `target.cloaked === true`.
- Cloak is one-way: hero auto-attacks still work while cloaked.
- Move-speed boost during Phase Sprint: hero `update(dt)` reads `this._moveSpeedMult` (default 1.0). Scout E sets `_moveSpeedMult = 2.0` for 4s, then resets to 1.0.

### 6.3 `SentryTurret` entity (Engineer W)

New file `src/entities/SentryTurret.js`. Lightweight; not registered with `TowerPlacementManager`. Owned by GameScene `_sentries` array.

```js
export class SentryTurret extends Phaser.GameObjects.Container {
  constructor(scene, { x, y, ownerHeroId }) {
    super(scene, x, y);
    this.range      = 100;
    this.damage     = 15;
    this.rate       = 1.0;                 // shots/s
    this.lifespan   = 12;                  // seconds
    this._cooldown  = 0;
    this._body      = scene.add.graphics();
    this.add(this._body);
    this._drawBody();
    scene.add.existing(this);
    this.setDepth(3);
  }

  _drawBody() {
    // gray octagon body + small barrel pointing horizontally + orange outline
  }

  update(dt, enemies) {
    this.lifespan -= dt;
    if (this.lifespan <= 0) { this.destroy(); return false; }   // remove from list
    this._cooldown -= dt;
    if (this._cooldown <= 0) {
      const target = this._nearestEnemyInRange(enemies);
      if (target) {
        // Mirror GameScene's tower-fire pattern: construct a Projectile directly and
        // push into scene.projectiles. Sentry presents itself as an archer-tier-1
        // source so weakness matrix lookups work uniformly.
        this.scene.projectiles.push(new Projectile(this.scene, {
          x: this.x, y: this.y, target,
          damage: this.damage, splashRadius: 0, pierce: false, slowFactor: 0,
          color: 0xff9933,                  // engineer orange
          towerType: 'archer', tier: 1, branch: null,
        }));
        this._cooldown = 1 / this.rate;
      }
    }
    return true;
  }

  _nearestEnemyInRange(enemies) {
    let best = null, bestD = Infinity;
    for (const e of enemies) {
      if (e.dead) continue;
      const d = Math.hypot(e.x - this.x, e.y - this.y);
      if (d <= this.range && d < bestD) { best = e; bestD = d; }
    }
    return best;
  }
}
```

GameScene integration:
- `this._sentries = []` in `create()`.
- In `update`: `this._sentries = this._sentries.filter(s => s.update(dt, this.enemies));`
- Engineer's W ability fn calls `engineerDeployTurret(hero, scene)` which destroys any existing sentry then pushes a new one at `hero.x, hero.y`.
- `shutdown()` destroys all remaining sentries.

Sentry damage routes through `Enemy.takeDamage` with archer-tier-1 source tag → benefits from existing tower-vs-enemy weakness matrix entries. Sentry kills do **not** call `Hero._registerKill()` — leveling stays personal.

### 6.4 `AreaEffectsManager`

New file `src/systems/AreaEffectsManager.js`. Generic so future area-effect abilities slot in.

```js
export class AreaEffectsManager {
  constructor(scene) {
    this.scene = scene;
    this._effects = [];
  }

  /**
   * spec = {
   *   type: 'aura' | 'pool',
   *   followsTarget?: { x, y } — if set, effect centre tracks target each frame
   *   x?, y?: static centre when followsTarget absent
   *   radius: number,
   *   duration: number (seconds),
   *   dps: number,
   *   slowFactor?: number (applies 'slow' status to enemies inside, refreshed each tick),
   *   sourceTag: object — passed as Enemy.takeDamage opts.source,
   *   drawFn(g, effect): void — renders the visual ring once on add
   * }
   */
  add(spec) {
    const eff = { ...spec, _remaining: spec.duration, _tickAccum: 0,
                  _g: this.scene.add.graphics().setDepth(2) };
    eff.drawFn(eff._g, eff);
    this._effects.push(eff);
    return eff;
  }

  update(dt, enemies) {
    for (let i = this._effects.length - 1; i >= 0; i--) {
      const eff = this._effects[i];
      eff._remaining -= dt;
      if (eff._remaining <= 0) { eff._g.destroy(); this._effects.splice(i, 1); continue; }
      if (eff.followsTarget) eff._g.setPosition(eff.followsTarget.x, eff.followsTarget.y);
      eff._tickAccum += dt;
      while (eff._tickAccum >= 1) {
        eff._tickAccum -= 1;
        const cx = eff.followsTarget ? eff.followsTarget.x : eff.x;
        const cy = eff.followsTarget ? eff.followsTarget.y : eff.y;
        for (const e of enemies) {
          if (e.dead) continue;
          if (Math.hypot(e.x - cx, e.y - cy) <= eff.radius) {
            e.takeDamage(eff.dps, { source: eff.sourceTag });
            if (eff.slowFactor != null) {
              e.applyStatus({ type: 'slow', duration: 1.2, factor: eff.slowFactor });
            }
          }
        }
      }
    }
  }

  destroyAll() { for (const e of this._effects) e._g.destroy(); this._effects = []; }
}
```

GameScene wiring: `this._areaEffects = new AreaEffectsManager(this)` in `create()`; `this._areaEffects.update(dt, this.enemies)` per frame; `destroyAll()` in `shutdown()`.

Pyromancer ability usages:
- W Immolate: `{ followsTarget: hero, radius: 60, dps: 10, duration: 8, sourceTag: heroAbilitySource('pyro','immolate'), drawFn: drawImmolateAura }`
- E Firefield: `{ x, y, radius: 100, dps: 15, slowFactor: 0.7, duration: 6, sourceTag: heroAbilitySource('pyro','firefield'), drawFn: drawFirefield }`

### 6.5 Cone math (Pyro Q Flame Wave)

Inlined in `pyroFlameWave` ability impl:

```js
function enemiesInCone(enemies, originX, originY, facingX, length, halfAngleRad) {
  const hits = [];
  for (const e of enemies) {
    if (e.dead) continue;
    const dx = e.x - originX, dy = e.y - originY;
    const dist = Math.hypot(dx, dy);
    if (dist > length) continue;
    const angleToEnemy = Math.atan2(dy, dx);
    const facingAngle  = facingX >= 0 ? 0 : Math.PI;
    let diff = Math.abs(angleToEnemy - facingAngle);
    if (diff > Math.PI) diff = 2 * Math.PI - diff;
    if (diff <= halfAngleRad) hits.push(e);
  }
  return hits;
}
```

90° cone → `halfAngleRad = Math.PI / 4`. Visual: a brief orange triangular flash via a `Graphics` object, destroyed after ~250ms via `scene.time.delayedCall`.

### 6.6 `onHit` callback in Hero auto-attack

`Hero.update(dt, enemies)` — after the existing damage application:

```js
nearest.takeDamage(damage, { source: heroSource(this.heroId) });
if (this.def.onHit) this.def.onHit(this, nearest);
if (nearest.dead) this._registerKill();
```

`pyroBurnOnHit(hero, enemy)` calls `enemy.applyStatus({ type:'burn', duration:2, dps:3 })`. Other heroes' `onHit` is `null` → guarded by the `if`.

### 6.7 Hero auto-attack damage multiplier (for Pyro Immolate +50%)

Hero state addition:

```js
this._attackDamageMult = 1.0;
```

Pyro W Immolate sets `hero._attackDamageMult = 1.5` and registers a `scene.time.delayedCall(8000, () => { hero._attackDamageMult = 1.0; })`. Auto-attack uses `damage * this._attackDamageMult`.

---

## 7. Save format & migration

### 7.1 Envelope shape (v3)

```js
{
  version:        3,
  maps:           [10 ints],
  upgrades:       [string ids],
  stats:          { kills, gamesPlayed, victories, defeats, bestWave },
  settings:       { masterVol, sfxVol, musicVol, muted },
  selectedHeroId: 'rael',                              // NEW
}
```

### 7.2 New SaveManager API

```js
getSelectedHero()              // returns selectedHeroId, defaults to 'rael' if unknown/missing
setSelectedHero(id)            // no-op if id not in HEROES; otherwise stores + saves
isHeroUnlocked(heroId)         // true if HEROES[heroId].unlockMapAfter == null
                               //   OR getStars(unlockMapAfter) > 0
```

### 7.3 Migration

```js
function migrateV2toV3(env) {
  const RENAME = {
    'cmd_battle_hardened': 'rael_hp',
    'cmd_veteran':         'rael_veteran',
    'cmd_rapid_redeploy':  'rael_rapid_redeploy',
    'cmd_elite':           'rael_elite',
  };
  return {
    ...env,
    version: 3,
    upgrades: (env.upgrades || []).map(id => RENAME[id] ?? id),
    selectedHeroId: env.selectedHeroId ?? 'rael',
  };
}
```

`_load()` updated: v1 (legacy bare-array) → v2 (existing migration) → v3 (new migration), single load pass. Future-version warn path stays unchanged.

### 7.4 Migration test matrix

| Saved version | Has `cmd_*` upgrades? | Has `selectedHeroId`? | Expected result |
|---|---|---|---|
| v1 (bare array) | no | no | v3 envelope, `selectedHeroId='rael'`, no upgrades |
| v2 | yes | no | v3 envelope, `cmd_*` → `rael_*`, `selectedHeroId='rael'` |
| v2 | no | no | v3 envelope, empty upgrades, `selectedHeroId='rael'` |
| v3 | n/a | yes (valid id) | passthrough |
| v3 | n/a | yes but `'unknown'` | `getSelectedHero()` returns `'rael'` defensively |
| v4+ (future) | n/a | n/a | console.warn, load as-is (existing path preserved) |

---

## 8. Upgrade tree restructure

### 8.1 Final node list (`src/data/upgrades.js`)

All four heroes get parallel 4-node sub-branches (hp / rapid_redeploy / veteran / elite).

```js
export const UPGRADES = [
  // ─── Rael ───
  { id: 'rael_hp',             branch: 'rael',     name: 'Battle-Hardened',
    effect: 'Rael +50 max HP',           cost: 2, requires: null },
  { id: 'rael_rapid_redeploy', branch: 'rael',     name: 'Rapid Redeployment',
    effect: 'Rael respawn −6s',          cost: 3, requires: 'rael_hp' },
  { id: 'rael_veteran',        branch: 'rael',     name: 'Veteran Commander',
    effect: 'Rael starts at L2',         cost: 4, requires: 'rael_hp' },
  { id: 'rael_elite',          branch: 'rael',     name: 'Elite Commander',
    effect: 'Rael starts at L3',         cost: 6, requires: 'rael_veteran', starThreshold: 15 },

  // ─── Engineer (hero-gated) ───
  { id: 'engineer_hp',             branch: 'engineer', name: 'Reinforced Plating',
    effect: 'Engineer +40 max HP',       cost: 2, requires: null,                  heroUnlock: 'engineer' },
  { id: 'engineer_rapid_redeploy', branch: 'engineer', name: 'Field Recovery',
    effect: 'Engineer respawn −6s',      cost: 3, requires: 'engineer_hp',         heroUnlock: 'engineer' },
  { id: 'engineer_veteran',        branch: 'engineer', name: 'Field-Tested',
    effect: 'Engineer starts at L2',     cost: 4, requires: 'engineer_hp',         heroUnlock: 'engineer' },
  { id: 'engineer_elite',          branch: 'engineer', name: 'Master Engineer',
    effect: 'Engineer starts at L3',     cost: 6, requires: 'engineer_veteran',    heroUnlock: 'engineer', starThreshold: 15 },

  // ─── Scout (hero-gated) ───
  { id: 'scout_hp',             branch: 'scout',    name: 'Lightweight Armor',
    effect: 'Scout +30 max HP',          cost: 2, requires: null,                  heroUnlock: 'scout' },
  { id: 'scout_rapid_redeploy', branch: 'scout',    name: 'Quick Recovery',
    effect: 'Scout respawn −6s',         cost: 3, requires: 'scout_hp',            heroUnlock: 'scout' },
  { id: 'scout_veteran',        branch: 'scout',    name: 'Pathfinder',
    effect: 'Scout starts at L2',        cost: 4, requires: 'scout_hp',            heroUnlock: 'scout' },
  { id: 'scout_elite',          branch: 'scout',    name: 'Master Scout',
    effect: 'Scout starts at L3',        cost: 6, requires: 'scout_veteran',       heroUnlock: 'scout', starThreshold: 15 },

  // ─── Pyromancer (hero-gated) ───
  { id: 'pyro_hp',             branch: 'pyro',     name: 'Heat Resistance',
    effect: 'Pyromancer +35 max HP',     cost: 2, requires: null,                  heroUnlock: 'pyro' },
  { id: 'pyro_rapid_redeploy', branch: 'pyro',     name: 'Reignition',
    effect: 'Pyromancer respawn −6s',    cost: 3, requires: 'pyro_hp',             heroUnlock: 'pyro' },
  { id: 'pyro_veteran',        branch: 'pyro',     name: 'Pyrokinetic',
    effect: 'Pyromancer starts at L2',   cost: 4, requires: 'pyro_hp',             heroUnlock: 'pyro' },
  { id: 'pyro_elite',          branch: 'pyro',     name: 'Master Pyromancer',
    effect: 'Pyromancer starts at L3',   cost: 6, requires: 'pyro_veteran',        heroUnlock: 'pyro', starThreshold: 15 },

  // ─── Logistics (unchanged) ───
  { id: 'log_supply_cache',  branch: 'logistics', name: 'Supply Cache',
    effect: '+40 starting gold',         cost: 2, requires: null },
  { id: 'log_deep_reserves', branch: 'logistics', name: 'Deep Reserves',
    effect: '+80 starting gold',         cost: 3, requires: 'log_supply_cache' },
  { id: 'log_bounty',        branch: 'logistics', name: 'Bounty Protocol',
    effect: '+20% gold from kills',      cost: 4, requires: 'log_supply_cache' },
  { id: 'log_garrison',      branch: 'logistics', name: 'Garrison Command',
    effect: '+2 starting lives',         cost: 4, requires: 'log_bounty', starThreshold: 15 },

  // ─── Arsenal (unchanged) ───
  { id: 'ars_munitions',  branch: 'arsenal', name: 'Munitions Discount',
    effect: 'Towers cost 10% less',      cost: 3, requires: null },
  { id: 'ars_optics',     branch: 'arsenal', name: 'Targeting Optics',
    effect: 'All towers +8% range',      cost: 3, requires: 'ars_munitions' },
  { id: 'ars_recruits',   branch: 'arsenal', name: 'Hardened Recruits',
    effect: 'Soldiers +30 max HP',       cost: 3, requires: 'ars_munitions' },
  { id: 'ars_overcharge', branch: 'arsenal', name: 'Overcharged Rounds',
    effect: 'All towers +6% damage',     cost: 5, requires: 'ars_optics', starThreshold: 15 },
  { id: 'ars_drills',     branch: 'arsenal', name: 'Combat Drills',
    effect: 'Soldiers respawn 25% faster', cost: 3, requires: 'ars_recruits' },
];
```

**Totals:** 16 hero nodes + 4 logistics + 5 arsenal = **25 nodes**. All-buy cost = 90 stars (4 × 15 hero subtotals + 13 logistics + 17 arsenal) vs 30-star economy → strong specialization required (consistent with existing design tension).

### 8.2 `UpgradeManager` changes

```js
getModifiers(heroId) {
  const owned = this._owned();
  const has   = id => owned.has(id);
  const mods  = {
    heroMaxHpBonus: 0, heroStartLevel: 1, heroRespawnDelta: 0,
    startGoldBonus: 0, killGoldMult: 1.0, startLivesBonus: 0,
    towerCostMult: 1.0, towerRangeMult: 1.0, towerDamageMult: 1.0,
    soldierMaxHpBonus: 0, soldierRespawnMult: 1.0,
  };

  // Shared (always)
  if (has('log_supply_cache'))    mods.startGoldBonus    += 40;
  if (has('log_deep_reserves'))   mods.startGoldBonus    += 80;
  if (has('log_bounty'))          mods.killGoldMult       = 1.2;
  if (has('log_garrison'))        mods.startLivesBonus    = 2;
  if (has('ars_munitions'))       mods.towerCostMult      = 0.9;
  if (has('ars_optics'))          mods.towerRangeMult     = 1.08;
  if (has('ars_overcharge'))      mods.towerDamageMult    = 1.06;
  if (has('ars_recruits'))        mods.soldierMaxHpBonus  = 30;
  if (has('ars_drills'))          mods.soldierRespawnMult = 0.75;

  // Per-hero — ONLY the active hero's branch applies
  const HERO_HP_BONUS = { rael: 50, engineer: 40, scout: 30, pyro: 35 };
  if (has(`${heroId}_hp`))             mods.heroMaxHpBonus   = HERO_HP_BONUS[heroId];
  if (has(`${heroId}_rapid_redeploy`)) mods.heroRespawnDelta = -6;
  if (has(`${heroId}_veteran`))        mods.heroStartLevel   = 2;
  if (has(`${heroId}_elite`))          mods.heroStartLevel   = 3;
  return mods;
}

canPurchase(id) {
  // existing checks (prereq, starThreshold, available stars)
  // PLUS:
  const node = BY_ID.get(id);
  if (node?.heroUnlock && !this._save.isHeroUnlocked(node.heroUnlock)) return false;
  return /* existing return */;
}

getNodeState(id) {
  // existing states: 'purchased', 'locked-prereq', 'locked-threshold', 'affordable', 'unaffordable'
  // PLUS new state 'locked-hero' when node.heroUnlock && !isHeroUnlocked(node.heroUnlock)
}
```

`GameScene.create()` call-site change: `getModifiers()` → `getModifiers(data.heroId ?? 'rael')`.

Refund logic unchanged — existing transitive dependent cleanup works without modification.

### 8.3 `UpgradeTreeOverlay`

Now renders 6 branches (4 hero + 2 shared). Locked-hero nodes show grayed with 🔒 + tooltip `Clear Map ${unlockMapAfter + 1} to unlock <Hero displayName>`. Exact layout (4 hero tabs vs full-scroll vertical list) is a small UI question — resolved during plan-writing after re-reading `src/ui/UpgradeTreeOverlay.js`.

---

## 9. HUD / UI

### 9.1 MapSelectScene hero picker

Inserted inside the existing featured-map right panel, between the tier badge and the Play button.

**Markup** (added to `index.html` inside the featured panel):

```html
<div id="hero-picker">
  <div class="hero-picker-label">Commander:</div>
  <div class="hero-picker-cards" id="hero-picker-cards"></div>
</div>
```

**`MapSelectScene._renderHeroPicker()` behavior:**
- For each hero in `HERO_ORDER`:
  - Card div: portrait circle (background = `bodyColor`, border = `strokeColor`, char = `portraitChar`), short name below.
  - If `saveMgr.isHeroUnlocked(id)`: clickable, hover highlight, `.active` if `id === saveMgr.getSelectedHero()`.
  - Else: grayed, lock icon replaces portrait char, tooltip `Clear Map ${unlockMapAfter + 1} to unlock`, not clickable.
- Click handler: `saveMgr.setSelectedHero(id)` → re-render picker (active class flips).
- Defensive: if persisted `selectedHeroId` is locked at mount time (corrupted save), reset to `'rael'` and re-save.

**`MapSelectScene._bindPlay()` change:** include heroId in scene-start data:

```js
this.scene.start('GameScene', {
  mapId:  this._selectedId,
  heroId: this._saveMgr.getSelectedHero(),
});
```

**CSS** (additive in `<style>`):

```css
#hero-picker { margin: 14px 0; }
.hero-picker-label { font-size:11px; color:#aaa; margin-bottom:6px; letter-spacing:1px; }
.hero-picker-cards { display:flex; gap:10px; }
.hero-card { display:flex; flex-direction:column; align-items:center; padding:8px;
             border:2px solid #333; border-radius:6px; cursor:pointer; width:62px; }
.hero-card.locked { opacity:0.5; cursor:not-allowed; }
.hero-card.active { border-color: var(--hero-stroke, #4fc3f7); background:#1a2a3a; }
.hero-card-portrait { width:36px; height:36px; border-radius:50%; display:flex;
                      align-items:center; justify-content:center; font-weight:bold;
                      font-size:16px; margin-bottom:4px; }
.hero-card-name { font-size:10px; color:#ddd; }
.hero-card.locked .hero-card-portrait { background:#222; border:2px solid #444; color:#666; }
```

Card portrait background/border colors set via inline style: `style="background:#1a2a4a;border:2px solid #4fc3f7;"` (converted from Phaser hex int via a small `toCssColor` helper).

### 9.2 UIScene — dynamic bottom-bar hero HUD

`#hero-section` markup in `index.html` is structurally unchanged (portrait div, level label, HP bar, 3 ability buttons). UIScene populates content from `HEROES[heroId]` on `hero:hud-init`.

`GameScene` emits at the end of `create()`:
```js
this.game.events.emit('hero:hud-init', { heroId, def: HEROES[heroId] });
```

`UIScene._onHeroHudInit({ heroId, def })`:
```js
this._heroDef = def;                                  // cache for level-up handler

const portrait = document.getElementById('hero-portrait');
portrait.textContent       = def.portraitChar;
portrait.style.background  = toCssColor(def.bodyColor);
portrait.style.borderColor = toCssColor(def.strokeColor);

document.getElementById('hero-level').textContent = `${def.shortName} L1`;
document.getElementById('hero-hp-fill').style.background = toCssColor(def.strokeColor);

for (const slot of ['q','w','e']) {
  const a = def.abilities[slot];
  const btn = document.getElementById(`ability-${slot}`);
  btn.querySelector('.ability-key').textContent  = slot.toUpperCase();
  btn.querySelector('.ability-name').textContent = a.icon;
  btn.title = `${a.label} — ${a.tooltip}`;
  btn.classList.add('locked');
  btn.disabled = true;
}
```

After `hero:hud-init`, `GameScene` emits `hero:level-up` with the hero's starting level (factoring in `heroStartLevel` upgrades). The existing `_onHeroLevelUp` handler removes `.locked` and enables buttons whose `unlockLvl <= level` — generic across heroes, no change needed beyond rewriting the displayed label to read from `this._heroDef.shortName`.

`UIScene.shutdown()` adds `'hero:hud-init'` to the listener-cleanup list.

### 9.3 InspectController

```js
_renderHeroPanel(hero) {
  const def = hero.def;
  document.getElementById('hi-header').textContent = `🛡️ ${def.displayName}`;
  document.getElementById('hi-level').textContent  =
    `Level: ${hero.level} / ${def.stats.maxLevel} · Kills: ${hero.killCount}`;
  document.getElementById('hi-attack').textContent =
    `Attack: ${def.stats.attackDamage} dmg @ ${def.stats.attackRange} range`;
  // ...HP bar, abilities loop (over def.abilities), matchups (def.matchups)
}
```

`displayName` helper (for matchup chips) supports hero tokens:
```js
const displayName = (t) => t.startsWith('hero:')
  ? HEROES[t.slice(5)].shortName
  : (TOWER_DEFS[t]?.name ?? t);
```

### 9.4 Weakness matrix surfaces

`describeEnemyMatchups(enemyType)` updated to walk every hero in `HERO_ORDER`:

```js
for (const heroId of HERO_ORDER) {
  const m = getWeaknessMultiplier({ kind:'hero', heroId }, enemyType);
  if (m >= EFFECTIVE_THRESHOLD) vulnerableTo.push(`hero:${heroId}`);
  else if (m <= WEAK_THRESHOLD)  resists.push(`hero:${heroId}`);
}
```

Enemy peek/pin panels now show entries like `Vulnerable to: Mage, Mira, Vex` — useful guidance for which hero to pick next run.

`getWeaknessMultiplier`:
```js
if (source.kind === 'hero')   return HEROES[source.heroId]?.matchups?.[enemyType] ?? 1.0;
if (source.kind === 'status') return 1.0;
// tower/sentry path unchanged
```

### 9.5 Source builders

```js
export function heroSource(heroId)                  { return { kind:'hero', heroId }; }
export function heroAbilitySource(heroId, ability)  { return { kind:'hero', heroId, ability }; }
export function burnSource()                        { return { kind:'status', type:'burn' }; }
```

Replaces existing `heroSource()` (no-arg) and `heroAirstrikeSource()`. Call sites updated:
- `Hero.update` → `heroSource(this.heroId)`
- `GameScene._triggerAirstrike` → `heroAbilitySource(this.hero.heroId, 'airstrike')`
- Pyro Q/W/E impls → `heroAbilitySource(hero.heroId, 'flame_wave' | 'immolate' | 'firefield')`
- Sentry uses its own archer-tier-1 tag (unchanged shape)

---

## 10. Testing strategy

Project convention (per auto-memory): any test importing an entity that imports Phaser must `vi.mock` Phaser at the top of the file.

### 10.1 New test files

| File | Coverage |
|---|---|
| `src/data/heroes.test.js` | Registry contract (§4): every required key present per entry, ability sub-objects complete, `unlockMapAfter` in valid range, `upgradeBranchId` exists in upgrades.js |
| `src/data/heroAbilities.test.js` | Each of 12 ability impls + `pyroBurnOnHit` called against mocked hero + scene + (where applicable) target. Asserts return shape, side effects, no-op on cooldown / dead |
| `src/entities/SentryTurret.test.js` | Construction, picks nearest in-range enemy, fires via `scene._spawnProjectile`, despawns at 0 lifespan (returns false), no shot when no enemy in range |
| `src/systems/AreaEffectsManager.test.js` | Static effect: ticks damage at 1s intervals to enemies in radius, despawns at duration end, cleans up graphics. `followsTarget`: centre tracks target each frame. `slowFactor`: slow status applied |
| `src/scenes/MapSelectScene.heroPicker.test.js` | `_renderHeroPicker()` directly — card count = 4, lock states correct, click flips active state and calls `setSelectedHero`, locked-card click is a no-op |

### 10.2 Extended existing test files

| File | Additions |
|---|---|
| `src/entities/Hero.test.js` | Parameterise over `heroId` (4 heroes). New: `fireAbility(slot)` dispatcher (null on cooldown/dead, increments timer); `onHit` callback fires after auto-attack landing; `_facingX` updates on movement; `_attackDamageMult` multiplies damage |
| `src/systems/SaveManager.test.js` | All cases from §7.4 migration matrix. `isHeroUnlocked` for each hero given various clear states. `setSelectedHero` rejects unknown ids defensively |
| `src/systems/UpgradeManager.test.js` | `canPurchase` respects `heroUnlock` gate. `getNodeState` returns `'locked-hero'`. `getModifiers(heroId)` only applies active hero's branch (e.g., owning `engineer_hp` while selecting Rael → `heroMaxHpBonus === 0`; same with Engineer selected → `=== 40`) |
| `src/data/weaknessMatrix.test.js` | Hero matchups read from `HEROES[heroId].matchups` (e.g., `pyro` × `skitter` = 2.0). `kind:'status'` source returns 1.0. `describeEnemyMatchups('drone')` includes `hero:pyro` and `hero:scout` in `vulnerableTo` |
| `src/data/sourceBuilders.test.js` | New `heroSource(heroId)`, `heroAbilitySource(heroId, ability)`, `burnSource()` shapes |
| `src/data/upgrades.test.js` | Total node count matches expected, every hero branch has 4 expected suffix nodes, every non-Rael hero node has `heroUnlock`, prereq chains valid |
| `src/entities/Enemy.test.js` | `burn` damages over time at 1s ticks, `vulnerable` multiplies incoming damage after weakness multiplier, re-applying same status refreshes without stacking; higher-dps burn replaces lower-dps |
| `src/scenes/GameScene.startWave.test.js` (or new `GameScene.heroSelection.test.js`) | `init({ heroId })` instantiates correct hero, passes `getModifiers(heroId)` |
| `src/scenes/InspectController.test.js` | Hero panel renders dynamic displayName, matchups list pulls from `def.matchups`, ability cooldowns read from hero's per-slot timer |

### 10.3 Estimated counts

~50–70 new tests; suite grows from 348 to ~410–420. Run time should stay under 5s.

### 10.4 Manual verification gate (CLAUDE.md step 7)

Before opening PR: play one short run with each of 4 heroes on an early map. Check per hero:
- Correct spawn visual (color, silhouette, portrait char on bottom bar)
- Ability buttons show correct icons + tooltips
- Each ability fires and produces the expected effect (Engineer turret persists 12s, Scout cone visible, Pyro burn DoT ticks, etc.)
- Inspect panel shows correct stats/matchups
- Hero picker on MapSelect respects unlock state
- Reload mid-session preserves selected hero
- Locked hero card on MapSelect is non-interactive with correct tooltip

---

## 11. Out of scope (future backlog candidates)

Explicitly **not** in this PR:

1. Hero-specific portrait art / sprite assets — Phaser primitives only.
2. Hero unlock cinematic / StoryManager beat when a hero first unlocks.
3. Per-hero ability VFX polish via ParticleSpawner (basic graphics shapes for v1).
4. Per-hero ability sound effects — existing `hero-*` SFX reused across all heroes.
5. Hero level-up taunts / barks — no audio callouts beyond existing button-unlock flash.
6. Hero swap mid-run — locked to chosen hero for the duration of a run.
7. Multi-hero runs — exactly one hero per run.
8. Sentry kills counting for Engineer's `killCount` (explicitly excluded).
9. Hero stat tuning passes — first-pass values; balance iteration is a separate small-PR cycle.
10. Hero portrait coloring in non-MapSelect surfaces (game-over screen, victory toast, meta-bar) — MapSelect picker + bottom-bar HUD + inspect panel only.
11. Localization of display names — strings inline in `heroes.js`.
12. Hero loadouts / ability swapping — abilities are fixed per hero.

---

## 12. File checklist

| File | Change |
|---|---|
| `src/data/heroes.js` | **new** — `HEROES` registry + `HERO_ORDER` |
| `src/data/heroAbilities.js` | **new** — 12 ability impls + `pyroBurnOnHit` |
| `src/data/heroes.test.js` | **new** — registry contract |
| `src/data/heroAbilities.test.js` | **new** — per-ability behavior |
| `src/entities/Hero.js` | **refactor** — data-driven, `fireAbility`, `onHit`, `_facingX`, `_attackDamageMult`, `cloaked` |
| `src/entities/Hero.test.js` | **modify** — parameterise + new tests |
| `src/entities/SentryTurret.js` | **new** |
| `src/entities/SentryTurret.test.js` | **new** |
| `src/entities/Enemy.js` | **modify** — `burn` + `vulnerable` statuses |
| `src/entities/Enemy.test.js` | **modify** — new status tests |
| `src/systems/AreaEffectsManager.js` | **new** |
| `src/systems/AreaEffectsManager.test.js` | **new** |
| `src/systems/SaveManager.js` | **modify** — v3 envelope + migration + new API |
| `src/systems/SaveManager.test.js` | **modify** — migration matrix |
| `src/systems/UpgradeManager.js` | **modify** — heroId-scoped modifiers + heroUnlock gate |
| `src/systems/UpgradeManager.test.js` | **modify** — new behavior |
| `src/data/upgrades.js` | **restructure** — 25 nodes across 6 branches |
| `src/data/upgrades.test.js` | **modify** — new structure assertions |
| `src/data/weaknessMatrix.js` | **modify** — registry-sourced matchups |
| `src/data/weaknessMatrix.test.js` | **modify** — per-hero matchup cases |
| `src/data/sourceBuilders.js` | **modify** — heroId-aware + `burnSource` |
| `src/data/sourceBuilders.test.js` | **modify** — new shapes |
| `src/scenes/MapSelectScene.js` | **modify** — hero picker, pass heroId on play |
| `src/scenes/MapSelectScene.heroPicker.test.js` | **new** |
| `src/scenes/GameScene.js` | **modify** — read heroId, dispatch via `fireAbility`, sentry + area-effects wiring |
| `src/scenes/GameScene.startWave.test.js` (or new) | **modify** / **new** — heroId data path |
| `src/scenes/UIScene.js` | **modify** — `_onHeroHudInit`, cache `_heroDef`, dynamic label |
| `src/scenes/InspectController.js` | **modify** — read `hero.def`, support `hero:<id>` tokens |
| `src/scenes/InspectController.test.js` | **modify** — dynamic hero panel |
| `src/ui/UpgradeTreeOverlay.js` | **modify** — 6 branches + locked-hero visual state |
| `index.html` | **modify** — hero-picker markup + CSS; `#hero-section` markup unchanged |
