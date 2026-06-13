# Barracks / Soldier System — Rebuild Design

**Date:** 2026-05-13
**Branch:** feature/phase-3-tower-system (already exists)
**Context:** The Barracks/Soldier system was implemented in Phase 3 but lost in a git restore. This spec covers the rebuild. The branch picker and tier-4 upgrade fix are included because they touch the same UIScene function as the Barracks panel.

---

## 1. Scope decisions

| Decision | Choice | Reason |
|---|---|---|
| TowerPlacementManager | **Skip** | Not needed for soldier mechanic; can be added later as standalone refactor |
| `soldierStats` shape | **Restore original** | Flat combat stats on Barracks def are semantically wrong; `soldierStats` keeps soldier data self-contained |
| Branch picker | **Include** | UIScene `_onPanelOpen` must be touched for Barracks panel; doing both in one pass avoids editing it twice |
| Blocking architecture | **GameScene orchestrates (Option B)** | Enemy stays clean with no dependency on the towers array |

---

## 2. Data layer

### `src/data/towers.js`

Restore `soldierStats` as a nested object on the `barracks` def. Flat combat fields (`damage: 0, fireRate: 0`) stay to satisfy the existing tower test suite (which validates those fields on every def). `Barracks.js` ignores them and reads exclusively from `soldierStats`.

```js
barracks: {
  name: 'Barracks', icon: '⚔️', cost: 100, color: 0x4caf50,
  range: 130,
  damage: 0, fireRate: 0, splashRadius: 0, pierce: false, slow: 0,
  soldierStats: {
    tier1:  { count: 3, hp: 15, damage: 20, respawnDuration: 3,   canBlockFlyers: false },
    tier2:  { count: 3, hp: 25, damage: 35, respawnDuration: 3,   canBlockFlyers: false },
    tier3:  { count: 3, hp: 40, damage: 55, respawnDuration: 3,   canBlockFlyers: false },
    tier4A: { count: 3, hp: 80, damage: 80, respawnDuration: 3,   canBlockFlyers: true  },
    tier4B: { count: 4, hp: 40, damage: 55, respawnDuration: 1.5, canBlockFlyers: false },
  },
  tier2: { cost: 65, label: 'Drill Sergeant' },
  tier3: { cost: 95, label: 'Elite Guard' },
  tier4A: { cost: 140, label: 'Vanguard',        passiveEffect: 'Soldiers block flying enemies too' },
  tier4B: { cost: 140, label: 'Rapid Response',  passiveEffect: '4 soldiers; respawn time halved' },
  ability: { label: 'Reinforce', cooldown: 15, description: '+2 soldiers for 15s' },
}
```

### `src/systems/PathManager.js` — two new methods (TDD)

- `getPathPoints()` — returns `this.path`. Used by Soldier to translate a 0–1 progress value to world coordinates.
- `getNearestPathProgress(x, y)` — given world coords, returns the 0–1 progress value of the nearest point on the path. Used by Barracks initial placement and the reposition click handler.

Four new tests in `PathManager.test.js` cover both methods (written first, then implemented).

---

## 3. Entity layer

### `src/entities/Tower.js` — fix `upgrade()` for tier 4

Replace `'tier' + tier` with `tier === 4 && branch ? 'tier4' + branch : 'tier' + tier`. This makes T4A/T4B keys resolve correctly for all six towers. One-line fix.

### `src/entities/Soldier.js` — new

Extends `Phaser.GameObjects.Container`. Owned by a `Barracks` instance. Sits at a fixed position on the path.

**Properties:** `hp`, `maxHp`, `damage`, `attackRate` (1/s), `attackTimer`, `pathProgress` (0–1), `dead`, `respawnTimer`, `respawnDuration`, `canBlockFlyers`

**Child graphics:**
- `_body` — small green humanoid (circle head + rect torso)
- `_hpBar` — two-rect HP bar above body, only drawn when damaged

**Methods:**
- `setPathProgress(progress, pathPoints)` — translates 0–1 float to world x/y by walking path segments. Called on spawn and on reposition.
- `takeDamage(amount)` — reduces hp, redraws hp bar; if hp ≤ 0, hides body and starts `respawnTimer`
- `respawn()` — resets hp, shows body, redraws bar
- `update(dt)` — ticks `attackTimer`; if dead, ticks `respawnTimer` and calls `respawn()` on expiry

Soldier does **not** call `_dealDamage` — GameScene owns that call.

### `src/entities/Barracks.js` — new, extends Tower

**Constructor:** calls `super()`, initializes `soldiers = []`, `soldierPathProgress = 0.5`, `soldierStats = def.soldierStats.tier1`

**Methods:**
- `spawnSoldiers(scene, pathPoints)` — creates `soldierStats.count` Soldier instances at `soldierPathProgress`
- `repositionSoldiers(newProgress, pathPoints)` — updates `soldierPathProgress`, calls `setPathProgress` on each soldier
- `upgrade(tier, branch)` — calls `super.upgrade()`, resolves tier key (`tier4A`/`tier4B` or `tier1`–`tier3`), updates `soldierStats`
- `_rebuildSoldiers(scene, pathPoints)` — destroys all soldiers, calls `spawnSoldiers`; called after every upgrade
- `destroy()` — destroys all soldiers then calls `super.destroy()`

---

## 4. Game loop integration (`GameScene`)

### Constants (module-level)

```js
const ENEMY_MELEE_DAMAGE = 20; // damage/sec all enemy types deal to soldiers
const MELEE_RANGE        = 30; // pixels — enemy halts when this close to a live soldier
```

### Tower placement dispatch

`_onPointerDown` creates `new Barracks(...)` instead of `new Tower(...)` when `type === 'barracks'`. After placement, sets `soldierPathProgress` via `pathMgr.getNearestPathProgress(barracks.x, barracks.y)` then calls `barracks.spawnSoldiers(this, pathMgr.getPathPoints())`.

### Targeting loop skip

`_updateTowers` adds `if (!tower.fireRate) continue` — Barracks has `fireRate: 0` so it is silently skipped.

### Soldier update loop

New `_updateSoldiers(dt)` — iterates all towers, filters for `type === 'barracks'`, calls `soldier.update(dt)` on each. Called from `update()` after `_updateProjectiles`.

### Blocking check

New `_checkSoldierBlock(enemy)` — scans all Barracks towers for a live soldier within `MELEE_RANGE` of the enemy. Flying enemies skip soldiers where `!soldier.canBlockFlyers`. Returns the blocking soldier or `null`.

Called inside `_updateEnemies` after `enemy.update(dt)`, before movement code:

```js
const blocker = this._checkSoldierBlock(enemy);
if (blocker) {
  blocker.takeDamage(ENEMY_MELEE_DAMAGE * dt);
  if (blocker.attackTimer <= 0) {
    this._dealDamage(enemy, blocker.damage, false);
    blocker.attackTimer = 1 / blocker.attackRate;
  }
  continue;
}
```

### Upgrade wiring

`_upgradeSelectedTower` accepts a `branch` parameter (passed from UIScene). After any Barracks upgrade calls `tower._rebuildSoldiers(this, pathMgr.getPathPoints())`. `ui:tower-upgrade` listener updated to `({ branch } = {}) => this._upgradeSelectedTower(branch ?? null)`.

### Sell wiring

No extra handling — `Barracks.destroy()` cleans up soldiers, and `Tower.sell()` calls `destroy()`.

### Reposition mode

New scene fields: `repositionMode = false`, `repositioningBarracks = null`.

On `ui:barracks-reposition`: sets both fields, calls `_redrawZones()`.

`_redrawZones` overlay when `repositionMode`: draws Barracks range ring in cyan; fill-circles each path point within range.

`_onPointerDown` checks `repositionMode` first:
- Click on path within Barracks range → `barracks.repositionSoldiers(progress, pathPoints)` where `progress = pathMgr.getNearestPathProgress(x, y)`
- Click out of range → toast "Click on the path within Barracks range!"
- Either way: exit reposition mode, re-emit `tower:panel-open` to refresh panel

---

## 5. UI layer (`UIScene`)

### `_onPanelOpen` restructure

Stores `this._openTower = tower` at top (used in reposition handler; no ID needed since GameScene uses `this.selectedTower` directly).

First, branch on `tower.type === 'barracks'` to swap the stats block only:
- **Barracks:** hide `panel-std-stats`, show `panel-barracks-stats`, populate five soldier stat spans (count, hp, damage, respawnDuration, blocks "Ground + Air" or "Ground"), show `panel-reposition-btn`
- **Standard:** show `panel-std-stats`, hide `panel-barracks-stats`, hide `panel-reposition-btn`

Then, for **all tower types** (including Barracks), apply the shared upgrade/branch-picker logic:
- `tower.level === 3 && !tower.branch` → show branch picker, hide upgrade button
- Otherwise → `_setUpgradeButton(btn, tower, def, map)` (handles maxed, locked, and available states)

### New helper methods

`_setUpgradeButton(btn, tower, def, map)` — three states: maxed (level 4 text), locked by map (🔒 text, disabled), or available (cost + label). Extracted from inline logic.

`_renderBranchPicker(container, def, map)` — builds two branch cards via `createElement`/`appendChild` (not `innerHTML`). Each card: label, passive effect, cost, "Choose" button. If `map.maxTierAllowed < 4`, cards greyed, buttons disabled with title "Unlocked on Map 5". "Choose" click emits `ui:tower-upgrade` with `{ branch: 'A' | 'B' }`.

### Reposition button wiring

`panel-reposition-btn` click emits `ui:barracks-reposition` (no payload needed). GameScene handles it using `this.selectedTower` directly.

UIScene subscribes to `ui:barracks-reposition` to hide the tower panel when reposition mode begins.

Both listener and button cleaned up in `shutdown()`.

### `_onPanelClose` cleanup

Resets: `panel-branch-picker` hidden + `replaceChildren()`; `panel-std-stats` visible; `panel-barracks-stats` and `panel-reposition-btn` hidden.

---

## 6. File change summary

| File | Change |
|---|---|
| `src/data/towers.js` | Restore `soldierStats`, fix `range`/`color`, fix tier labels |
| `src/systems/PathManager.js` | Add `getPathPoints`, `getNearestPathProgress` |
| `src/systems/PathManager.test.js` | 4 new tests (TDD) |
| `src/entities/Tower.js` | Fix `upgrade()` tier4 key resolution |
| `src/entities/Soldier.js` | New |
| `src/entities/Barracks.js` | New — extends Tower |
| `src/scenes/GameScene.js` | Barracks dispatch, targeting skip, blocking loop, soldier update, reposition mode |
| `src/scenes/UIScene.js` | Branch picker, Barracks panel, reposition button, `_openTowerId` |

---

## 7. Testing

Existing tests must remain green. New unit tests (TDD) only for `PathManager` additions — 4 tests. All entity and UI behaviour verified in browser.

**Browser verification checklist:**
- Barracks places; 3 green soldiers appear on path near placement point
- Enemies stop at soldiers, exchange attacks; HP bars shrink
- Soldier dies (disappears), respawns after 3s; enemies resume while dead
- T1→T2→T3 upgrade rebuilds soldiers with updated stats shown in panel
- T3 shows branch picker with two cards; locked on maps with `maxTierAllowed < 4`
- T4A (Vanguard): 3 soldiers with 80hp; flying enemies pass through (no flyers yet — verify `canBlockFlyers: true` is set on soldierStats)
- T4B (Rapid Response): 4 soldiers; respawn 1.5s
- Reposition flow: panel → button → cyan overlay → click path → soldiers move → panel refreshes
- Sell destroys soldiers and frees zone
- All other towers (Archer, Mage, Cannon, Ice, Sniper) unaffected; existing Phase 2 checks pass
