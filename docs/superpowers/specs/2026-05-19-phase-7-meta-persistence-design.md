# Phase 7 — Meta & Persistence Design

**Date:** 2026-05-19
**Status:** Approved (brainstorm)
**Branch target:** `feature/phase-3-tower-system` (current integration branch)

## 1. Goal

Phase 7 delivers two composable pieces:

1. **Persistence hardening** — replace the bare-array save (`ProgressManager`) with a versioned save envelope, migrate existing saves, and add lifetime stats tracking.
2. **Meta-progression** — a permanent upgrade tree ("Command Doctrine") funded by spending earned stars, accessed from `MapSelectScene`.

The versioned envelope is a prerequisite for storing purchased upgrades safely, so hardening lands first within the same phase.

## 2. Scope

**In scope:**
- Versioned save envelope + migration from the legacy `lastlight_progress` array.
- `SaveManager` (replaces `ProgressManager`) — pure persistence.
- `data/upgrades.js` — the 13-node upgrade catalog.
- `UpgradeManager` — upgrade domain logic (purchase, refund cascade, modifiers).
- Upgrade tree DOM overlay, opened from `MapSelectScene`.
- Total-stars bar + "Upgrades" button + lifetime stats panel on `MapSelectScene`.
- `GameScene` wiring: apply upgrade modifiers at match start; commit stats at match end.

**Out of scope (deferred):**
- Settings persistence — audio lands in Phase 8, nothing to persist yet.
- Per-map records (fastest clear, best wave per map).
- Achievements.

## 3. Save Schema

### 3.1 Envelope

localStorage key: **`lastlight_save`** (new). Legacy key `lastlight_progress` is read once for migration, then deleted.

```json
{
  "version": 1,
  "maps":     [0,0,0,0,0,0,0,0,0,0],
  "upgrades": ["cmd_battle_hardened", "log_supply_cache"],
  "stats":    { "kills": 0, "gamesPlayed": 0, "victories": 0, "defeats": 0, "bestWave": 0 }
}
```

- `version` — integer schema version. Current = `1`.
- `maps` — 10-element array, best star rating per map (`0`–`3`). Same semantics as today.
- `upgrades` — array of purchased upgrade ids.
- `stats` — lifetime counters. Total stars is **not** stored (derived via `getTotalStars()`).

### 3.2 Migration

On `SaveManager` construction:

1. Read `lastlight_save`. If present and valid (object, `version === 1`, `maps` is a 10-element array) — use it.
2. Else read legacy `lastlight_progress`. If present and valid (a 10-element array) — build a v1 envelope: `maps` = the array, `upgrades` = `[]`, `stats` = all zeros. Write `lastlight_save`, then `localStorage.removeItem('lastlight_progress')`.
3. Else (no data, or corrupt JSON in either key) — start a fresh v1 envelope with `maps` all-zero, `upgrades` `[]`, `stats` all-zero.

All reads are wrapped in `try/catch`; corrupt data falls back to step 3 (consistent with the existing `ProgressManager._load` behavior).

## 4. SaveManager

`src/systems/SaveManager.js` — **replaces** `src/systems/ProgressManager.js`. Pure persistence; no game rules.

```
class SaveManager
  constructor()                       // load + migrate envelope

  // map stars (ported from ProgressManager)
  getStars(mapId): 0..3
  setStars(mapId, stars)              // only writes if stars > current; persists
  isUnlocked(mapId): boolean          // mapId 0 always true; else getStars(mapId-1) > 0
  getTotalStars(): number             // sum of maps

  // upgrades
  getPurchasedUpgrades(): string[]    // returns a copy
  setPurchasedUpgrades(ids: string[]) // replaces set; persists

  // stats
  getStats(): { kills, gamesPlayed, victories, defeats, bestWave }  // returns a copy
  setStats(stats)                     // replaces; persists
```

`unlockNext()` is removed — it was already a documented no-op in `ProgressManager`.

`ProgressManager.js` and `ProgressManager.test.js` are deleted. Callers updated: `MapSelectScene.js`, `GameScene.js` (`new ProgressManager()` → `new SaveManager()`; `this.progressMgr` → `this.saveMgr`).

## 5. Upgrade Catalog

`src/data/upgrades.js` — plain config, no logic. Exports `UPGRADES`, an array of node objects:

```
{ id, branch, name, effect, cost, requires, starThreshold? }
```

- `id` — unique string, prefixed by branch (`cmd_`, `log_`, `ars_`).
- `branch` — `'command' | 'logistics' | 'arsenal'`.
- `name` — display name.
- `effect` — short display string.
- `cost` — stars to purchase.
- `requires` — id of the prerequisite node, or `null` for branch roots.
- `starThreshold` — optional integer; total stars *earned* required before the node can be purchased.

### 5.1 The 13 nodes

**Command branch** (hero — Commander Rael):

| id | name | effect | cost | requires | starThreshold |
|---|---|---|---|---|---|
| `cmd_battle_hardened` | Battle-Hardened | Hero +50 max HP | 2 | `null` | — |
| `cmd_veteran` | Veteran Commander | Hero starts at Level 2 | 4 | `cmd_battle_hardened` | — |
| `cmd_rapid_redeploy` | Rapid Redeployment | Hero respawn −6s | 3 | `cmd_battle_hardened` | — |
| `cmd_elite` | Elite Commander | Hero starts at Level 3 | 6 | `cmd_veteran` | 15 |

**Logistics branch** (economy):

| id | name | effect | cost | requires | starThreshold |
|---|---|---|---|---|---|
| `log_supply_cache` | Supply Cache | +40 starting gold | 2 | `null` | — |
| `log_deep_reserves` | Deep Reserves | +80 starting gold | 3 | `log_supply_cache` | — |
| `log_bounty` | Bounty Protocol | +20% gold from kills | 4 | `log_supply_cache` | — |
| `log_garrison` | Garrison Command | +2 starting lives | 4 | `log_bounty` | 15 |

**Arsenal branch** (towers & soldiers):

| id | name | effect | cost | requires | starThreshold |
|---|---|---|---|---|---|
| `ars_munitions` | Munitions Discount | Towers cost 10% less | 3 | `null` | — |
| `ars_optics` | Targeting Optics | All towers +8% range | 3 | `ars_munitions` | — |
| `ars_recruits` | Hardened Recruits | Soldiers +30 max HP | 3 | `ars_munitions` | — |
| `ars_overcharge` | Overcharged Rounds | All towers +6% damage | 5 | `ars_optics` | 15 |
| `ars_drills` | Combat Drills | Soldiers respawn 25% faster | 3 | `ars_recruits` | — |

Catalog total: **45★**. Maximum stars in the game: 10 maps × 3 = **30★**. Players can afford ~two-thirds and must specialize.

## 6. UpgradeManager

`src/systems/UpgradeManager.js` — upgrade domain logic. Constructed with a `SaveManager` instance; reads/writes the purchased set through it.

```
class UpgradeManager
  constructor(saveMgr)

  getAvailableStars(): number
    // saveMgr.getTotalStars() - sum of cost of purchased nodes

  isPurchased(id): boolean

  canPurchase(id): boolean
    // true only if ALL hold:
    //   - node exists and not already purchased
    //   - requires is null OR requires is purchased
    //   - starThreshold absent OR saveMgr.getTotalStars() >= starThreshold
    //   - getAvailableStars() >= node.cost

  purchase(id)
    // throws if !canPurchase(id); else adds id to purchased set via saveMgr

  refund(id)
    // computes the transitive set of purchased dependents of id (any purchased
    // node whose requires-chain passes through id), removes id + all dependents
    // from the purchased set via saveMgr. No-op if id not purchased.

  getModifiers(): Modifiers
    // pure aggregation of all purchased nodes into a flat object (see 6.1)

  getNodeState(id): 'purchased' | 'affordable' | 'unaffordable'
                  | 'locked-prereq' | 'locked-threshold'
    // for UI rendering
```

`getNodeState` precedence: `purchased` → `locked-prereq` (requires not owned) → `locked-threshold` (prereq owned but `getTotalStars()` < threshold) → `affordable` (canPurchase true) → `unaffordable`.

### 6.1 Modifiers object

`getModifiers()` returns a flat object with defaults when no relevant node is owned:

```
{
  heroMaxHpBonus:    0,      // +50 if cmd_battle_hardened
  heroStartLevel:    1,      // 2 if cmd_veteran, 3 if cmd_elite (elite wins)
  heroRespawnDelta:  0,      // -6 (seconds) if cmd_rapid_redeploy
  startGoldBonus:    0,      // +40 supply_cache, +80 deep_reserves (additive → up to 120)
  killGoldMult:      1.0,    // 1.2 if log_bounty
  startLivesBonus:   0,      // +2 if log_garrison
  towerCostMult:     1.0,    // 0.9 if ars_munitions
  towerRangeMult:    1.0,    // 1.08 if ars_optics
  towerDamageMult:   1.0,    // 1.06 if ars_overcharge
  soldierMaxHpBonus: 0,      // +30 if ars_recruits
  soldierRespawnMult:1.0     // 0.75 if ars_drills
}
```

`getModifiers()` is a pure function of the purchased set — fully unit-testable.

## 7. GameScene Integration

### 7.1 Apply modifiers at match start

`GameScene.create()` constructs a `SaveManager` and `UpgradeManager`, calls `getModifiers()` once, and applies the result. Upgrades are static for the match — no mid-match recompute.

| Modifier | Application point |
|---|---|
| `startGoldBonus` | added to `EconomyManager` starting gold |
| `startLivesBonus` | added to `EconomyManager` starting lives |
| `heroMaxHpBonus` | added to Hero `maxHp` (and current `hp`) at creation |
| `heroStartLevel` | Hero created at this level (abilities unlocked accordingly) |
| `heroRespawnDelta` | added to Hero respawn delay (seconds) |
| `killGoldMult` | multiplies gold earned per enemy kill |
| `towerCostMult` | multiplies tower purchase cost at placement (rounded) |
| `towerRangeMult` | multiplies tower range |
| `towerDamageMult` | multiplies tower damage |
| `soldierMaxHpBonus` | added to Soldier `maxHp` at creation |
| `soldierRespawnMult` | multiplies Soldier respawn delay |

Exact integration in `Hero`, `Tower`, `Barracks`/`Soldier`, and `EconomyManager` is determined during planning by reading each consumer. The contract: each consumer accepts the relevant modifier; `GameScene` is the single place modifiers are read and distributed.

### 7.2 Commit stats at match end

A match-local kill counter and a highest-wave-reached tracker run during play. On `game:victory` (`_onVictory`) and `game:defeat` (`_onDefeat`), `GameScene` commits to `SaveManager`:

- `kills += matchKills`
- `bestWave = max(bestWave, matchWave)`
- `gamesPlayed += 1`
- `victories += 1` (victory) **or** `defeats += 1` (defeat)

`matchWave` is `waveMgr.currentWave` at the time the match ends.

## 8. UI

### 8.1 MapSelectScene additions

Three new DOM elements, consistent with the existing sidebar/featured-panel DOM pattern:

- **Total-stars bar** — `★ {getTotalStars()} / 30`, near the top.
- **"Upgrades" button** — adjacent to the stars bar; opens the upgrade tree overlay.
- **Lifetime stats panel** — read-only, populated from `getStats()` on scene create: Kills, Games Played, Victories, Defeats, Best Wave, Total Stars (last one from `getTotalStars()`).

### 8.2 Upgrade tree overlay

A full-screen DOM overlay (no new Phaser scene — same DOM approach as Phase 5 panels), opened from `MapSelectScene` and closed back to it.

- **Layout** — three branch columns (Command / Logistics / Arsenal), nodes connected by prerequisite lines, matching the approved mockup (`.superpowers/brainstorm/.../upgrade-tree-v2.html`).
- **Node states** (from `getNodeState`): Purchased / Affordable / Unaffordable / Locked-prereq / Locked-threshold. Locked-threshold nodes display the `15★` requirement.
- **Interaction** — clicking an `affordable` node calls `purchase(id)` immediately (no confirm dialog; refund is available so mistakes are cheap). Each purchased node shows a refund control calling `refund(id)`.
- **Chrome** — an "Available: {getAvailableStars()}★" counter (updates live on every buy/refund), and a Close button.
- After buy/refund, the overlay re-renders all node states and the available counter; on close, `MapSelectScene` refreshes its total-stars bar.

Upgrades take effect on the **next** map started.

## 9. Testing

Test runner: **vitest** (`npm test` → `vitest run`). Project currently at 142 passing tests.

- **`SaveManager.test.js`** (replaces `ProgressManager.test.js`):
  - legacy-array migration → v1 envelope written, `lastlight_progress` deleted
  - fresh load when no data exists
  - corrupt-JSON in either key → fresh envelope fallback
  - `getStars` / `setStars` only-increases behavior
  - `isUnlocked` (map 0 always; gated by previous map stars)
  - `getTotalStars`
  - `getPurchasedUpgrades` / `setPurchasedUpgrades` round-trip
  - `getStats` / `setStats` round-trip
- **`UpgradeManager.test.js`**:
  - `canPurchase` for each rejection cause: already-owned, prereq unmet, threshold unmet, unaffordable; and the all-clear case
  - `purchase` reduces `getAvailableStars()` by `cost`; `purchase` throws when `!canPurchase`
  - **refund cascade** — refunding a root refunds all transitive dependents; `getAvailableStars()` recovers the full summed cost; refunding a leaf removes only that node
  - `getModifiers` aggregation across several purchased sets (none, partial, `cmd_veteran` vs `cmd_elite` precedence, additive gold)
  - `getNodeState` precedence
- **`upgrades.test.js`** — data integrity: ids unique; every non-null `requires` points to a real id in the same branch; `starThreshold` present only on `cmd_elite`, `log_garrison`, `ars_overcharge`.

`getModifiers()` is pure and fully unit-tested. `GameScene` modifier-application wiring and the upgrade overlay are verified in-browser, consistent with Phase 5–6 validation practice.

## 10. File Summary

**New:**
- `src/systems/SaveManager.js`
- `src/systems/SaveManager.test.js`
- `src/systems/UpgradeManager.js`
- `src/systems/UpgradeManager.test.js`
- `src/data/upgrades.js`
- `src/data/upgrades.test.js`

**Deleted:**
- `src/systems/ProgressManager.js`
- `src/systems/ProgressManager.test.js`

**Modified:**
- `src/scenes/MapSelectScene.js` — `SaveManager`; total-stars bar, Upgrades button, stats panel, upgrade tree overlay.
- `src/scenes/GameScene.js` — `SaveManager` + `UpgradeManager`; apply modifiers in `create()`; commit stats in `_onVictory`/`_onDefeat`.
- Modifier consumers (`Hero`, `Tower`, `Barracks`/`Soldier`, `EconomyManager`) — accept the relevant modifier; exact signatures determined during planning.
