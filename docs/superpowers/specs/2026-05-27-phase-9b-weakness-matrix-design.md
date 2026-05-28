# Phase 9b — Tower/Enemy Weakness Matrix: Design Spec

**Status:** Approved (2026-05-27) — ready for plan.
**Branch:** `feature/phase-9b-weakness-matrix` (off `feature/phase-3-tower-system`)
**Scope:** Second of three "Strategic Depth" sub-features. Phase 9a (send-wave-early) is in flight as PR #12; Phase 9c (click-to-inspect overlay) is tracked separately and out of scope here.

---

## 1. Motivation

Today, every tower deals the same damage to every enemy modulo a flat `armor` subtraction. The only matchup decisions in the game are (a) "is the enemy armored, so do I want pierce?" and (b) "is the enemy flying, so do I want soldiers that block flyers?" Every other tower-vs-enemy pairing is interchangeable.

This sub-feature introduces a **damage multiplier matrix** keyed by `(tower-type × enemy-type)`, with sparse **Tier-4 branch overrides** so that picking Sniper-Assassin vs Sniper-Rapid-Fire becomes a real strategic choice rather than a raw-DPS comparison. The matrix also covers hero damage so the hero unit has a counter identity of its own.

The matrix is the centerpiece of the Strategic Depth pass: paired with 9a's tempo decisions and 9c's transparency, it turns tower placement from "pile DPS on the path" into "match towers to wave composition."

---

## 2. Damage Formula

Current `Enemy.takeDamage`:

```js
const armor = optsObj.pierce ? 0 : this.armor;
const dmg   = Math.max(1, amount - armor);
```

Phase 9b formula (post-armor multiplier):

```js
const armor      = optsObj.pierce ? 0 : this.armor;
const afterArmor = Math.max(1, amount - armor);
const mult       = getWeaknessMultiplier(optsObj.source, this.def.type);
const dmg        = Math.max(1, Math.floor(afterArmor * mult));
```

Properties:
- Armor applied **first**, multiplier **second**. Multiplier amplifies what got through.
- Inner `max(1, …)` after armor preserves today's "always at least 1 damage" floor.
- Outer `max(1, …)` after the multiplier handles weak-pairing edge cases: a 0.5× multiplier on a tower armor-walled to 1 damage still does 1 damage.
- `floor` keeps damage integer-valued (matches existing convention).
- **No source → multiplier = 1.0**, so any caller that doesn't pass `opts.source` (legacy tests, future helpers) gets today's exact behavior.

### 2.1 Worked examples (current tower/enemy stats)

| Scenario | Math | Final |
|---|---|---|
| Cannon (45) vs Brute (armor 8), 1.5× | `max(1, 45−8)=37`, `floor(37×1.5)=55` | **55** |
| Sniper-Assassin (300, pierce) vs Titan (armor 20), 2.5× | `max(1, 300−0)=300`, `floor(300×2.5)=750` | **750** |
| Ice (8) vs Titan (armor 20), 0.75× | `max(1, 8−20)=1`, `floor(1×0.75)=0` → `max(1,0)` | **1** |
| Cannon (45) vs Phantom (armor 0), 0.5× | `max(1, 45−0)=45`, `floor(45×0.5)=22` | **22** |
| Hero (25) vs Phantom (armor 0), 1.5× | `max(1, 25−0)=25`, `floor(25×1.5)=37` | **37** |
| Archer (15) vs Drone (armor 0), 1.0× (no entry) | `max(1, 15−0)=15`, `floor(15×1.0)=15` | **15** |

---

## 3. Damage Scope

The matrix applies to **all player-sourced damage to enemies**. Every existing damage site is gated:

| Source | Today's call site | 9b change |
|---|---|---|
| Tower projectile (direct hit) | `GameScene._onProjectileHit` → `_dealDamage(target, damage, pierce)` | `_dealDamage` passes `source: {kind:'tower', type, tier, branch}` |
| Tower projectile (splash) | `GameScene._onProjectileHit` splash loop → `_dealDamage(enemy, damage, pierce)` | Same source object, applied per enemy in splash |
| Soldier melee | `GameScene._updateEnemies` blocker branch → `_dealDamage(enemy, blocker.damage, false)` | `source: {kind:'tower', type:'barracks', tier: blocker.barracks.level, branch: blocker.barracks.branch}` (`Soldier` already holds a `this.barracks` reference to its parent Tower) |
| Hero airstrike (W) | `GameScene._triggerAirstrike` → `_dealDamage(e, result.damage, true, {isAoe, abilityLabel})` | Add `source: {kind:'hero', ability:'airstrike'}` to the opts |
| Hero auto-attack | `Hero.update` → `nearest.takeDamage(ATTACK_DAMAGE)` (direct, bypasses `_dealDamage`) | Wrap with `nearest.takeDamage(ATTACK_DAMAGE, {source:{kind:'hero'}})` |
| Hero EMP (E) | `GameScene._onAbility` case `'e'` — applies `stun`, deals no damage | No change |
| Hero overcharge (Q) | `GameScene._applyOvercharge` — buffs tower fireRate, deals no damage | No change |
| Enemy → soldier / hero | `Soldier.takeDamage` / `Hero.takeDamage` | **Not gated.** Matrix is one-directional (player → enemy only). |
| Tower abilities (Volley/Headshot/Blizzard/Big Bomb) | **Not implemented yet** (defs exist in `TOWER_DEFS.ability`, no dispatcher) | When implemented, route through `_dealDamage` with `source: {kind:'tower', …, ability: 'volley'}` |

All integration is concentrated in `_dealDamage`, `Hero.update`, and `Enemy.takeDamage` — three files.

---

## 4. Data: The Matrix

New file `src/data/weaknessMatrix.js`. Omitted cells default to `1.0`.

```js
// Base 6×6 (TOWER × ENEMY). Omitted = 1.0.
export const WEAKNESS_MATRIX = {
  archer:   {                       skitter: 1.25, brute: 0.75, colossus: 0.75, phantom: 1.25, titan: 0.5  },
  mage:     { drone:  1.25,                                     colossus: 1.25, phantom: 1.5,  titan: 1.25 },
  cannon:   { drone:  0.75, skitter: 0.5,  brute: 1.5, colossus: 1.5,  phantom: 0.5,  titan: 1.25 },
  ice:      {                                                                                  titan: 0.75 },
  sniper:   {               skitter: 0.75, brute: 1.25, colossus: 1.5, phantom: 0.75, titan: 1.5  },
  barracks: {               skitter: 1.25, brute: 1.25,                phantom: 0.5,  titan: 0.75 },
};

// Sparse Tier-4 branch overrides. Override REPLACES the base cell (does not multiply).
export const TIER4_OVERRIDES = {
  archer: { B: {                       brute: 1.25, colossus: 1.25                          } }, // Marksman: armor-piercing
  mage:   { B: {                       brute: 1.5,  colossus: 1.5                           } }, // Frost Mage: Shatter synergy
  cannon: { A: { skitter: 2.0                                                               } }, // Artillery: splits → swarm
  ice:    { B: {                       brute: 1.5,  colossus: 1.5                           } }, // Shatter: explicit
  sniper: { A: {                                    colossus: 2.0,                titan: 2.5 } }, // Assassin: the titan answer
};

// Hero damage (auto-attack + airstrike). Omitted = 1.0.
export const HERO_MULTIPLIERS = {
  phantom: 1.5,   // hero is the anti-air baseline
};

export function getWeaknessMultiplier(source, enemyType) {
  if (!source) return 1.0;
  if (source.kind === 'hero') return HERO_MULTIPLIERS[enemyType] ?? 1.0;
  if (source.kind === 'tower') {
    if (source.tier === 4 && source.branch) {
      const override = TIER4_OVERRIDES[source.type]?.[source.branch]?.[enemyType];
      if (override !== undefined) return override;
    }
    return WEAKNESS_MATRIX[source.type]?.[enemyType] ?? 1.0;
  }
  return 1.0;
}

// Derives UI-facing matchup hints from the matrix. Pure.
// Returns { effective: enemyType[], weak: enemyType[] } classified by ≥1.25 / ≤0.75.
export function describeMatchups(source) { /* … */ }
```

### 4.1 Invariants

- **Overrides replace, not multiply.** Tier-4A Sniper vs Titan = `2.5×`, not `2.5 × 1.5 = 3.75×`. Predictable; one number per cell.
- **Unknown source / unknown enemy → 1.0×.** Every existing test that calls `takeDamage(amount)` or `takeDamage(amount, {pierce:true})` without a `source` passes through unchanged.
- **Pure module.** No scene/registry coupling. `weaknessMatrix.test.js` tests the function with no scaffolding.
- **Single source of truth.** UI helpers (`describeMatchups`) read from the same exports; no duplicate "effective vs" tables in UI code.

### 4.2 Cell counts

Base 6×6 grid has 36 cells. Published non-`1.0`:
- archer: 5, mage: 4, cannon: 6, ice: 1, sniper: 5, barracks: 4 → **25 base cells**
- Tier-4 overrides: archer-B 2, mage-B 2, cannon-A 1, ice-B 2, sniper-A 2 → **9 overrides**
- Hero: **1 cell**

Total tunable surface: **35 numbers**.

---

## 5. Architecture

### 5.1 Files touched

| File | Change |
|---|---|
| `src/data/weaknessMatrix.js` | **new** — exports the three tables, `getWeaknessMultiplier`, `describeMatchups` |
| `src/data/weaknessMatrix.test.js` | **new** — unit tests for lookup & helper |
| `src/entities/Enemy.js` | `takeDamage` resolves `source` → multiplier and applies post-armor |
| `src/entities/Enemy.test.js` | extend — formula, source handling, no-source backcompat |
| `src/entities/Projectile.js` | constructor accepts and stores `sourceTier`, `sourceBranch` (alongside existing `towerType`) |
| `src/entities/Hero.js` | auto-attack passes `{source:{kind:'hero'}}` to `enemy.takeDamage` |
| `src/scenes/GameScene.js` | `_dealDamage` builds `source` from tower projectile / soldier / airstrike; passes it through. Also: `_openTowerPanel` appends a matchup line; `_renderBranchPicker` (line ~700) appends a Tier-4 override line per card |
| `src/scenes/GameScene.test.js` (or equivalent) | extend — integration smoke for tower, soldier, airstrike paths |
| `src/scenes/UIScene.js` | adds `mouseenter`/`mouseleave` tooltip handlers to `.tower-btn` (in the same `forEach` that already wires clicks at line ~65). Also: `_renderBranchPicker` (line ~234) appends the same Tier-4 override line per card |
| `index.html` | adds one floating `<div id="tower-tooltip">` element (positioned absolutely, hidden by default) used by the BottomBar tooltip handler. Existing `#panel-branch-picker` and TowerPanel DOM are reused; no new layout containers. |

Estimated diff: ~120 lines of source + ~100 lines of tests + ~20 lines of HTML/CSS. No new dependencies.

### 5.2 Branch picker render paths

There are two `_renderBranchPicker` implementations: one in `UIScene.js` (line ~234) and one in `GameScene.js` (line ~700). Both must receive the Tier-4 override line so the card looks identical regardless of which scene rendered it. (Consolidating these two render paths is a pre-existing code smell, out of scope for 9b — flagged for a future cleanup commit.)

### 5.3 Source-object shape

The `source` field passed in `opts` is a discriminated object, not a string. This keeps `getWeaknessMultiplier` total and avoids string-parsing inside the hot path:

```js
{ kind: 'tower', type: 'cannon', tier: 4, branch: 'A' }   // Tier-4A cannon
{ kind: 'tower', type: 'archer', tier: 1, branch: null }  // base archer
{ kind: 'hero' }                                          // hero auto-attack
{ kind: 'hero', ability: 'airstrike' }                    // hero airstrike (ability field is informational; matrix is hero-wide today)
```

The `ability` field on hero sources is reserved for future expansion (e.g., if airstrike grows a different multiplier table). v1 ignores it.

### 5.4 Data flow

```
                                ┌──────────────────────────────┐
                                │ WEAKNESS_MATRIX / OVERRIDES  │
                                │ HERO_MULTIPLIERS             │
                                │ getWeaknessMultiplier()      │
                                └──────────────┬───────────────┘
                                               │ pure lookup
                                               │
   ┌─────────────────────┐   damage     ┌──────▼──────┐  multiplier
   │ tower projectile    ├──────────────►             │
   │ tower splash AoE    │              │  _dealDamage │
   │ soldier melee       ├──────────────►  (builds    │
   │ hero airstrike      │              │  source)    │
   └─────────────────────┘              └──────┬──────┘
                                               │ opts.source
                                               │
   ┌─────────────────────┐                     ▼
   │ hero auto-attack    ├────────────► Enemy.takeDamage
   └─────────────────────┘  (direct,    (resolves mult,
                            adds source) applies post-armor)
```

---

## 6. UI Surface

Minimum surface to make the matrix legible. Deeper inspection (per-enemy "weak to" panel, damage-number color tinting, range-ring color hints) is deferred to Phase 9c.

### 6.1 Tower-build BottomBar tooltip

On hover (mouse `mouseenter` / `mouseleave`), the tower's build button shows two lines pulled from its matrix row via `describeMatchups({kind:'tower', type, tier:1, branch:null})`. Touch / long-press handling is deferred to the Capacitor / iOS phase — desktop browser is the v1 target.

```
🏹 Archer — 60g
Effective vs: Skitter, Phantom
Weak vs: Brute, Colossus, Titan
```

- "Effective" = enemies with multiplier ≥ 1.25.
- "Weak" = enemies with multiplier ≤ 0.75.
- Towers with empty effective/weak lists (no published non-1.0 cells, e.g. Ice base row has only one entry) display only the line that applies; omit the other entirely.
- Enemy display names come from `ENEMY_DEFS[type].name`, stripping the `Veth ` prefix for compactness ("Skitter" not "Veth Skitter").

### 6.2 TowerPanel matchup line

When a placed tower is clicked, the existing TowerPanel shows the same two lines, but using the tower's **actual** `{type, tier, branch}` source. A Tier-4A Sniper shows Tier-4A's overridden row — so Titan moves from the base row (1.5×) to the override row (2.5×), and the override is what's classified.

### 6.3 Tier-3 → Tier-4 branch picker hint

Each Tier-4 branch card (e.g. the "ASSASSIN" card on a Tier-3 Sniper) appends one line beneath its existing `passiveEffect` description:

```
ASSASSIN (160g)
Ignores armor, stuns boss 1s
⚡ 2.5× vs Titan
```

- The line is rendered only for branches with at least one published override.
- Only the **single largest** override cell per branch is shown (the "headline") to keep the card compact. If two cells tie, the alphabetically-first enemy name wins.
- If a branch has no overrides (e.g. Sniper-B Rapid Fire has none in v1), the line is omitted.

### 6.4 Out of UI scope for 9b

- Click-to-inspect overlay on enemies → 9c.
- Floating damage-number color tint (`>1.0×` orange, `<1.0×` grey) → 9c.
- Range-ring color hint when hovering enemies → 9c.
- Tooltip on the placed tower's body (range-ring hover) → 9c.
- Tutorial / first-time pop-up explaining the system → not planned.

---

## 7. Edge Cases

| Case | Behavior |
|---|---|
| Caller passes no `source` (legacy callers, tests) | `getWeaknessMultiplier(undefined, enemy.type) === 1.0`. Existing behavior preserved exactly. All 235 current tests pass unchanged. |
| Unknown enemy type in matrix (e.g., a new enemy added later before its row is filled) | Falls through to `1.0` via the `?? 1.0` guard. Game still plays; the new enemy is just neutral to all towers until its column is authored. |
| Tier-4 source but no override published for that enemy | Falls back to the base row (`WEAKNESS_MATRIX[type][enemyType]`) — that's the whole point of "sparse overrides." |
| Tier 2 or 3 source | Treated identically to Tier 1 (overrides only kick in at `tier === 4 && branch`). Intermediate tiers inherit the base row. |
| Multiplier of 0 | Not published in v1 (all values are ≥ 0.5). The `max(1, floor(afterArmor × mult))` floor would clamp it to 1 if ever authored. Reserved meaning of 0 is "cannot target at all," which is not used today and is a separate gate from this matrix. |
| AoE splash on multiple enemy types | Each enemy in the splash radius gets its own per-target multiplier lookup. Cannon-A vs a mixed Brute+Skitter group: Brute takes `1.5×`, Skitter takes `2.0×` (Artillery override), both in the same splash. |
| Hero auto-attack on multiple enemy types | Per-target lookup against `HERO_MULTIPLIERS`. v1: only Phantom is non-1.0. |
| Hero airstrike AoE | Same per-target lookup using `{kind:'hero', ability:'airstrike'}`; `ability` field is currently ignored, so airstrike inherits the same hero table. |
| Enemy → Soldier or Enemy → Hero damage | Untouched. Matrix is player→enemy only. |
| Damage event payload (`damage-dealt` event) | Reports the **final** damage number (post-armor, post-multiplier). DamageNumberOverlay continues to show the actual damage taken. |
| Save/load (Phase 7 meta-persistence) | No persistent state in the matrix; it's pure data. Loading a saved game replays through the same module — no migration needed. |

---

## 8. Testing Strategy

### 8.1 weaknessMatrix.test.js (new)

- `getWeaknessMultiplier(null, 'titan') === 1.0`
- `getWeaknessMultiplier(undefined, 'titan') === 1.0`
- `getWeaknessMultiplier({kind:'tower', type:'cannon', tier:1}, 'brute') === 1.5`
- `getWeaknessMultiplier({kind:'tower', type:'archer', tier:1}, 'drone') === 1.0` (no entry → default)
- **Override replaces base:** `getWeaknessMultiplier({kind:'tower', type:'sniper', tier:4, branch:'A'}, 'titan') === 2.5` (not 1.5 × 2.5)
- **Override fallthrough:** `getWeaknessMultiplier({kind:'tower', type:'sniper', tier:4, branch:'A'}, 'skitter') === 0.75` (base row, override has no skitter entry)
- **Wrong branch:** `getWeaknessMultiplier({kind:'tower', type:'sniper', tier:4, branch:'B'}, 'titan') === 1.5` (B has no overrides → base)
- **Tier 2/3 inherits base:** `getWeaknessMultiplier({kind:'tower', type:'sniper', tier:3, branch:null}, 'titan') === 1.5`
- **Hero source:** `getWeaknessMultiplier({kind:'hero'}, 'phantom') === 1.5`; `getWeaknessMultiplier({kind:'hero'}, 'brute') === 1.0`
- **Hero ignores tower matrix:** `getWeaknessMultiplier({kind:'hero'}, 'titan') === 1.0` (HERO_MULTIPLIERS has no titan entry; tower matrix is not consulted)
- **describeMatchups base:** `describeMatchups({kind:'tower', type:'cannon', tier:1, branch:null})` → `effective: ['brute','colossus','titan']`, `weak: ['drone','skitter','phantom']`
- **describeMatchups Tier-4 folds overrides:** `describeMatchups({kind:'tower', type:'sniper', tier:4, branch:'A'})` → effective list contains `'titan'` and `'colossus'` at their override values
- **describeMatchups hero:** returns `{effective:['phantom'], weak:[]}`

### 8.2 Enemy.test.js (extend)

- **No source → backcompat:** `enemy.takeDamage(45)` with brute (armor 8) → hp drops by 37, matching today.
- **Source applied post-armor:** `enemy.takeDamage(45, {source:{kind:'tower', type:'cannon', tier:1, branch:null}})` with brute → hp drops by 55 (matches §2.1).
- **Pierce + mult:** `enemy.takeDamage(300, {pierce:true, source:{kind:'tower', type:'sniper', tier:4, branch:'A'}})` with titan → hp drops by 750.
- **Floor at 1:** `enemy.takeDamage(8, {source:{kind:'tower', type:'ice', tier:1, branch:null}})` with titan (armor 20, mult 0.75) → hp drops by 1.
- **Cannon vs phantom:** `enemy.takeDamage(45, {source:{kind:'tower', type:'cannon', tier:1, branch:null}})` with phantom → hp drops by 22.
- **Hero vs phantom:** `enemy.takeDamage(25, {source:{kind:'hero'}})` with phantom → hp drops by 37.
- **Damage event payload:** the `damage-dealt` event emitted from `takeDamage` reports the post-multiplier damage (used by DamageNumberOverlay).

### 8.3 GameScene integration smoke (extend existing patterns)

Using the stubbed-scene pattern already established in the project's GameScene tests:

- **Tower projectile:** placed cannon, brute in range, fire → `_dealDamage` is called with `source:{kind:'tower', type:'cannon', tier:1, branch:null}`. Enemy hp drops by 55.
- **Tier-4 branch source:** upgrade tower to `tier:4, branch:'A'`. Source object reflects `tier:4, branch:'A'`. Override applies (verify for sniper-A vs titan = 750).
- **Soldier melee:** barracks blocking a phantom → `_dealDamage` source is `{kind:'tower', type:'barracks', tier:<tower.level>, branch:<tower.branch>}`. Multiplier `0.5×` applies.
- **Hero airstrike:** trigger airstrike at a phantom cluster → each affected enemy's `_dealDamage` carries `{kind:'hero', ability:'airstrike'}`. Phantom takes `floor(80 × 1.5) = 120`.
- **Hero auto-attack:** hero in attack range of phantom → `Enemy.takeDamage` is called with `{source:{kind:'hero'}}`. Damage = `floor(ATTACK_DAMAGE × 1.5)`.

### 8.4 UI tests

- `describeMatchups` output drives BottomBar tooltip text — assert rendered tooltip for each of the 6 tower-build buttons matches the published cells.
- Placed-tower TowerPanel for a Tier-4A Sniper shows Titan in the Effective list (from override), not just the base row.
- Tier-4 branch picker card for "Assassin" includes the line `⚡ 2.5× vs Titan`. For "Rapid Fire" (no overrides), the line is absent.
- Empty effective/weak handling: Ice base row (only `titan: 0.75`) → tooltip shows only "Weak vs: Titan", no "Effective vs" line.

### 8.5 Manual browser walkthrough (Phase 9b acceptance)

On a clean build of the branch:

1. **Map 1, early wave:** hover each tower-build button — confirm tooltips render "Effective vs / Weak vs" lines matching the matrix.
2. Place a **Cannon** near Brutes (wave with brutes). Confirm Brutes drop visibly faster than Skitters do to the same tower (HP-bar bite is larger per shot).
3. Place an **Archer** on a Phantom-heavy stretch — confirm Phantoms drop fast; place another Archer on Titans — confirm Titans take many hits.
4. On a later wave, upgrade a **Sniper to Tier-3 then pick Assassin (4A)**. Confirm:
   - The branch picker card showed `⚡ 2.5× vs Titan`.
   - Once placed, the TowerPanel's "Effective vs:" line includes Titan and Colossus.
   - A Titan walking through dies in ~2 shots instead of ~5.
5. Spawn the **hero** (or use the Map 1 default hero). Walk it next to a Phantom and confirm hero attack drops Phantoms faster than the same hero attack drops Brutes.
6. Drop a **hero airstrike (W)** on a phantom cluster, confirm one-shot or near-one-shot kills.
7. Place a **Barracks**, let soldiers engage a Phantom (Tier-4A Vanguard if needed). Confirm Phantoms still die but slowly (0.5× multiplier).
8. Confirm no regression on existing flows: gold income, wave progression, hero level-ups, story banners, audio cues — everything else unchanged.

---

## 9. Out of Scope

- **Phase 9c surfaces:** enemy click-to-inspect, damage-number color tint, range-ring color hint.
- **Tower abilities** (Volley / Headshot / Blizzard / Big Bomb): these defs exist in `TOWER_DEFS.ability` but have no live dispatcher; when implemented, route via `_dealDamage` with the same source object pattern. Not implemented in 9b.
- **Enemy → player damage matrix** (e.g., titan does extra to soldiers). One-directional v1.
- **Per-status-effect multipliers** beyond what the matrix expresses (e.g., "Shatter does 2× to frozen targets" is encoded in TOWER_DEFS already and stays as-is; not folded into the matrix).
- **Persistent telemetry** (kills by tower-vs-enemy pair). Phase 7 saves overall progress, not matchup analytics.
- **A settings / debug toggle** to disable the matrix. The matrix is part of base game balance.
- **Achievement-style notifications** for player's first "Effective" or "Weak" kill.

---

## 10. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Starting multipliers are too sharp / too flat | All 35 numbers are in one file. Tuning is a follow-up commit; the spec deliberately encodes the v1 values inline so the next developer (or AI agent) can see the starting point. |
| Matrix interacts poorly with armor + pierce (e.g. low-damage towers vs heavy enemies still feel useless) | The post-armor formula was chosen specifically to avoid double-punishment — armor floor + matrix floor are layered, not multiplied. Worked examples in §2.1 cover the edge case explicitly. |
| UI text for tooltips clutters the BottomBar | "Effective" and "Weak" lines are 1 line each, hidden by default, shown on hover/long-press. Same UX as existing tower-stats display. If hover surface ever becomes too crowded, the lines can move into the TowerPanel only. |
| Players don't notice the matrix exists | 9c (click-to-inspect) gives full transparency. 9b's three UI surfaces (build tooltip, panel line, branch card line) are the discovery hooks for the matrix-only phase. |
| Tier-4 override breaks expectations ("I thought 4A was better, but its 2.5× titan dropped to 1.5× because I picked 4B") | Override is **replacement**, not multiplication, and is shown explicitly on the Tier-3 branch picker card. The choice is informed. |
| Adding a new enemy or tower later requires touching the matrix | Yes — but `WEAKNESS_MATRIX` defaults to 1.0 for unknown cells, so a new enemy is playable immediately at neutral multiplier and the new column is filled in a follow-up PR. |
| Performance regression from per-hit matrix lookup | `getWeaknessMultiplier` is two object-property reads. The hot path was already doing `max + min + subtraction` per hit. Cost is negligible (verify in browser DevTools profiler during manual walkthrough on a Titan wave). |

---

## 11. Acceptance Criteria

The feature ships when:

1. Unit tests in §8.1 and §8.2 pass.
2. Integration tests in §8.3 pass.
3. UI tests in §8.4 pass.
4. Manual browser walkthrough in §8.5 passes on a fresh build.
5. `npm test` shows no regression in the existing test suite (≥ 235 tests at start of phase).
6. `npm run build` is clean.
7. PR description shows: (a) the matrix table as a Markdown grid, (b) a screenshot of a tooltip + TowerPanel matchup line, (c) a short note on the Tier-4 override pattern.
