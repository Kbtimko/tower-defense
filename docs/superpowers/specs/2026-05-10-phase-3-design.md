# Phase 3 Design — Tower System

**Date:** 2026-05-10
**Builds on:** `docs/superpowers/specs/2026-05-10-phase-2-design.md`
**Branch:** feature/phase-3-tower-system

---

## 1. Goals

1. Complete `towers.js` — add Sniper and Barracks definitions (including tier 4 branches for all 6 towers).
2. Extract tower placement logic from GameScene into `TowerPlacementManager`.
3. Build the branch picker UI inside TowerPanel — shown at Tier 3, replaced by standard view after a branch is chosen.
4. Build the Barracks/Soldier system — soldiers block enemies on the path, player can reposition them.

Non-goals for this phase: active ability effects (button UI deferred; no ability mechanics), new enemy types, new maps, Hero unit.

---

## 2. Tower Data (`src/data/towers.js`)

The existing 4 towers (`archer`, `mage`, `cannon`, `ice`) already have complete tier 4 branch data. Two towers are added this phase.

### Sniper (`🎯`, 120g)

Long-range, slow fire rate, highest single-target damage. No splash radius.

```js
sniper: {
  name: 'Sniper', icon: '🎯', cost: 120, color: 0x8B8B00,
  range: 150, damage: 80, fireRate: 0.4, splashRadius: 0, pierce: false, slow: 0,
  tier2: { cost: 80, damage: 130, range: 170, label: 'Long Shot' },
  tier3: { cost: 110, damage: 200, range: 190, label: 'Precision' },
  tier4A: { cost: 160, damage: 300, label: 'Assassin', passiveEffect: 'Ignores armor, stuns boss 1s' },
  tier4B: { cost: 160, damage: 200, range: 280, label: 'Hunter', passiveEffect: '+100% range, fires at 2 targets simultaneously (display only — gameplay effect in Phase 4)' },
  ability: { label: 'Headshot', cooldown: 20, description: 'Instakill non-boss enemy' },
}
```

### Barracks (`⚔️`, 100g)

Spawns 3 soldiers that block enemies on the path. No projectile — soldiers deal melee damage. Tier data tracks soldier stats.

```js
barracks: {
  name: 'Barracks', icon: '⚔️', cost: 100, color: 0x4caf50,
  range: 130,
  // No damage/fireRate/splashRadius — soldiers handle combat
  soldierStats: {
    tier1:  { count: 3, hp: 15, damage: 20, respawnDuration: 3000, canBlockFlyers: false },
    tier2:  { count: 3, hp: 25, damage: 35, respawnDuration: 3000, canBlockFlyers: false },
    tier3:  { count: 3, hp: 40, damage: 55, respawnDuration: 3000, canBlockFlyers: false },
    tier4A: { count: 3, hp: 80, damage: 80, respawnDuration: 3000, canBlockFlyers: true  },
    tier4B: { count: 4, hp: 40, damage: 55, respawnDuration: 1500, canBlockFlyers: false },
  },
  tier2: { cost: 65, label: 'Trained Guard' },
  tier3: { cost: 95, label: 'Elite Squad' },
  tier4A: { cost: 140, label: 'Elite Guard',    passiveEffect: 'Soldiers block flying enemies too' },
  tier4B: { cost: 140, label: 'Rapid Response', passiveEffect: '4 soldiers; respawn time halved' },
  ability: { label: 'Reinforce', cooldown: 15, description: '+2 soldiers for 15s' },
}
```

---

## 3. TowerPlacementManager (`src/systems/TowerPlacementManager.js`)

Extracts tower placement logic from GameScene. Owns the tower array and zone state.

### Responsibilities

- `zones[]` — build zones from PathManager, each `{ x, y, zoneIndex, occupied: false }`
- `towers[]` — all placed Tower/Barracks instances
- `placeTower(zoneIndex, type, scene)` — validates zone is free + player can afford; creates entity, marks zone occupied, charges gold via EconomyManager
- `sellTower(tower)` — refunds 60%, frees zone, calls `tower.destroy()`
- `upgradeTower(tower, tier, branch?)` — charges gold, calls `tower.upgrade(tier, branch?)`
- `getTowerAtZone(zoneIndex)` — returns Tower or null; used by pointer-down to distinguish click-existing vs place-new
- `getTowers()` — exposes tower list for GameScene's enemy targeting and soldier blocking loops
- `getZones()` — exposes zone list for `_redrawZones()`

### What stays in GameScene

- `this.selectedType` — UI-driven state, unchanged
- `_onPointerDown()` — still handles raw click; delegates to `placementManager.placeTower()` or `placementManager.getTowerAtZone()`
- `_redrawZones()` — still called reactively; reads zone state from `placementManager.getZones()`
- All event emission (`tower:panel-open`, `tower:panel-close`) — unchanged

---

## 4. Branch Picker UI

### Trigger

At Tier 3, `tower:panel-open` payload includes `tower.level === 3` and `tower.branch === null`. UIScene uses this to render the branch picker instead of the standard upgrade button.

### Branch picker view (Tier 3, no branch chosen)

- Header: "⚡ Choose Tier 4 Path" in amber
- Two side-by-side cards, each showing:
  - Branch label (bold)
  - Passive effect description (muted)
  - Stat deltas (blue)
  - Cost in gold (amber)
  - "Choose" button
- Sell button below cards as usual
- Locked tiers (maps where `maxTierAllowed < 4`): cards are greyed out with 🔒 and tooltip "Unlocked on Map 5"

### After branch chosen

- `ui:tower-upgrade` emits with `{ branch: 'A' | 'B' }` payload (branch picker adds this)
- GameScene calls `placementManager.upgradeTower(tower, 4, branch)`
- Next `tower:panel-open` for this tower: `tower.level === 4`, branch is set → UIScene renders standard stats view with branch name in header ("Archer · Marksman"), no upgrade button, "Max tier reached" label

### UIScene changes

- `_onPanelOpen()`: branches on `tower.level === 3 && !tower.branch` to render picker vs standard view
- Branch "Choose" button click handlers: read `data-branch` attribute, emit `ui:tower-upgrade` with `{ branch }`
- Barracks panel: renders soldier stats (`hp`, `damage`, `respawnDuration`, `soldierCount`, `blocks`) instead of tower attack stats; shows "⟳ Reposition Soldiers" button

---

## 5. Barracks & Soldier System

### `src/entities/Soldier.js`

Extends `Phaser.GameObjects.Container`. Same pattern as Enemy.

**Properties:** `hp`, `maxHp`, `damage`, `attackRate` (1 hit/s), `attackTimer`, `pathProgress` (0–1 position along path), `dead`, `respawnTimer`, `respawnDuration`, `barracks` (owner ref), `canBlockFlyers` (false by default; true for T4A)

**Children:**
- `_body`: Graphics — small humanoid shape (circle head + rectangle torso), green fill
- `_hpBar`: Graphics — two-rect HP bar above body, redrawn on damage

**Methods:**
- `update(dt)`: if `dead`, ticks respawnTimer; on expiry calls `respawn()`. If alive, finds nearest blocking enemy (enemy within `MELEE_RANGE` of soldier's world position), attacks it at `attackRate`.
- `takeDamage(amount)`: reduces `hp`; if `hp ≤ 0` sets `dead = true`, starts `respawnTimer`, hides body.
- `respawn()`: resets `hp`, shows body, repositions Container to `pathProgress` world coordinates.
- `setPathProgress(progress, pathPoints)`: computes world `x/y` from path progress value and updates Container position.

### `src/entities/Barracks.js`

Extends Tower. Overrides attack-related behavior; adds soldier management.

**Additional properties:** `soldiers[]`, `soldierPathProgress` (initial value = nearest path point to barracks on placement), `soldierStats` (object from tower def, updated on upgrade)

**Methods:**
- `spawnSoldiers(scene, pathPoints)`: creates 3 Soldier instances (or 4 at T4B), positions them at `soldierPathProgress`
- `repositionSoldiers(newProgress, pathPoints)`: updates `soldierPathProgress`; each soldier calls `setPathProgress(newProgress)`
- `upgrade(tier, branch?)`: calls super, updates `soldierStats` from def, calls `_rebuildSoldiers(scene, pathPoints)`
- `_rebuildSoldiers(scene, pathPoints)`: destroys existing soldiers, calls `spawnSoldiers()`
- `destroy()`: destroys all soldiers in `soldiers[]`, then calls super

**Tower IDs:** Each Tower/Barracks instance is assigned a unique `id` (incrementing integer) in `TowerPlacementManager.placeTower()`. Used in the `ui:barracks-reposition` event payload so GameScene can look up the correct Barracks.

**Constants** (defined at the top of `GameScene.js`):
- `ENEMY_MELEE_DAMAGE = 20` — damage per second dealt by any enemy to a blocking soldier
- `MELEE_THRESHOLD = 0.05` — path progress units; how close an enemy must be before a soldier blocks it

**PathManager addition:** `getNearestPathProgress(x, y)` — given a world coordinate, returns the path progress value (0–1) of the nearest point on the path. Used by Barracks to set the initial `soldierPathProgress` on placement.

**GameScene integration:**
- `_spawnTower()` (called from `placementManager.placeTower()`): detects Barracks type, calls `barracks.spawnSoldiers(this, pathManager.getPathPoints())`; sets initial `soldierPathProgress` via `pathManager.getNearestPathProgress(barracks.x, barracks.y)`
- Targeting loop: skips Barracks instances (they have no `fireRate`)
- Exposes `pathManager.getPathPoints()` for soldier position calculations

### Enemy Blocking

Added to `Enemy.update(dt)` before movement:

1. Iterate `placementManager.getTowers()`, filter to Barracks instances
2. For each Barracks, iterate its `soldiers` (filter `!soldier.dead`)
3. If `soldier.pathProgress >= enemy.progress` and `soldier.pathProgress - enemy.progress < MELEE_THRESHOLD` (0.05):
   - Skip if `enemy.def.canFly && !soldier.canBlockFlyers`
   - Otherwise: zero enemy movement this frame, attack soldier (`soldier.takeDamage(ENEMY_MELEE_DAMAGE * dt)`)

`ENEMY_MELEE_DAMAGE` is a constant (20 damage/sec for all enemy types this phase). `MELEE_THRESHOLD` is a constant (0.05 path progress units).

### Reposition Flow

**UIScene:**
- "Reposition Soldiers" button click → emits `ui:barracks-reposition` with `{ towerId: tower.id }` on `this.game.events`
- Button only shown when `selectedTower` is a Barracks instance

**GameScene:**
- Subscribes to `ui:barracks-reposition` → sets `this.repositionMode = true`, `this.repositioningBarracks = tower`
- `_redrawZones()`: if `repositionMode`, shows Barracks range ring + highlights valid path segments within range
- `_onPointerDown()`: if `repositionMode`, finds nearest path point to click within Barracks range → calls `barracks.repositionSoldiers(progress, pathPoints)` → sets `repositionMode = false`, emits `tower:panel-open` to refresh panel

**Event additions to protocol:**

| Event | Payload | Direction |
|---|---|---|
| `ui:barracks-reposition` | `{ towerId }` | UIScene → GameScene |

---

## 6. File Changes Summary

| File | Action |
|---|---|
| `src/data/towers.js` | Add `sniper` and `barracks` definitions |
| `src/systems/TowerPlacementManager.js` | New — extracted from GameScene |
| `src/entities/Soldier.js` | New |
| `src/entities/Barracks.js` | New — extends Tower |
| `src/entities/Tower.js` | Minor — ensure constructor/upgrade/destroy are clean for Barracks to call super |
| `src/entities/Enemy.js` | Add soldier blocking check in `update()` |
| `src/scenes/GameScene.js` | Integrate TowerPlacementManager; add reposition mode; skip Barracks in targeting loop |
| `src/scenes/UIScene.js` | Branch picker rendering; Barracks panel with soldier stats + reposition button |

---

## 7. Testing

Existing 25 tests must remain green. No new unit tests for entities (verified via browser). New unit test for `TowerPlacementManager` — placement, sell, upgrade, and zone occupation state.

Browser verification checklist:
- All 6 tower types placeable; Sniper and Barracks icons visible
- Barracks spawns 3 visible soldiers on placement
- Soldiers reposition when player uses panel flow
- Enemies stop and fight soldiers; soldiers take damage and respawn
- Flying enemies pass through soldiers (T1–T3); blocked at T4A
- Tier 3 tower shows branch picker; choosing a branch upgrades to T4 and shows branch name in panel
- Locked tiers (Maps 1–2) show 🔒 on branch cards
- Sell refunds 60%; Barracks sell destroys its soldiers
- All Phase 2 browser checks still pass
