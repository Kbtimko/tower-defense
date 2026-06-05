# Hero Management Overlay — Design Spec

**Date:** 2026-06-04
**Backlog item:** "Heroes" icon on MapSelect → hero management UI (notes.md prior-backlog #7)
**Status:** Approved (brainstorm phase complete; ready for implementation plan)

---

## 1. Goal

Give the player a single overlay on MapSelect that combines two things currently split across the screen:

1. Picking which hero drops into the next match.
2. Spending stars on per-hero upgrades.

Today the small hero picker above the PLAY button handles (1), and the ⚙ Upgrades overlay handles (2) by showing all six branches (4 heroes + logistics + arsenal) at once. The new overlay scopes (2) to one hero at a time and lets the player switch hero + spend stars on that hero without closing the modal.

## 2. Scope decisions

| # | Decision | Rationale |
|---|---|---|
| 1 | **Replace both** existing UIs (small picker + hero branches inside ⚙ Upgrades) | One source of truth for hero swap + per-hero upgrades. Cleanest UX. |
| 2 | Layout: **left rail of hero cards + right tree pane** | Settings-app feel; scales if more heroes are added later. |
| 3 | Locked heroes are **clickable read-only previews** | Player can plan toward future heroes; tree shows what they'll get. |
| 4 | Clicking an unlocked card **auto-commits** `selectedHeroId` | Zero-friction. Closing the modal Just Works. A ✓ SELECTED badge marks the committed hero so the player can still browse locked heroes without losing track. |
| 5 | The ⚙ Upgrades overlay survives but is **slimmed to Logistics + Arsenal** | The non-hero economy/tower branches still need a home. Title changes from "Command Doctrine" → "Doctrine". |

## 3. UI architecture

### 3.1 MapSelect meta bar

`#map-meta-bar` gains one button between ⚙ Upgrades and ♪ Audio:

```
[★ N / 30]  [⚙ Upgrades]  [🦸 Heroes]  [♪ Audio]
```

### 3.2 Featured panel

The `#hero-picker` block (label + 4 small cards) is **removed**. The PLAY button moves up to fill the space. The selected hero is now invisible from the featured panel — it's set inside the new overlay and read via `SaveManager.getSelectedHero()` when PLAY is clicked.

### 3.3 New `#hero-mgmt-overlay`

Full-screen modal (matches the visual treatment of `#upgrade-overlay` and `#settings-overlay`).

**Title bar:**
- 🦸 **Hero Command** (left)
- ⭐ N to spend (right; reflects global available stars from `UpgradeManager.getAvailableStars()`)
- ✕ Close button (right edge)

**Body grid:** `170px / 1fr` — rail on the left, tree pane on the right, min-height 300px.

**Rail** — one card per hero in `HERO_ORDER`. Each card:

| Element | Source |
|---|---|
| Portrait circle (32px) | `HEROES[id].portraitChar`, `bodyColor`, `strokeColor` |
| Name | `HEROES[id].shortName` |
| Role tag (small) | `HEROES[id].role` — new presentation field added to each hero def (see §4.5). |
| Unlock hint (locked only, below role) | "Clear Map N" — `HEROES[id].unlockMapAfter + 1` |
| ✓ SELECTED badge (top-right of card) | shown when `id === saveMgr.getSelectedHero()` |
| Inspecting border (cyan) | shown when `id === overlay._inspectedHeroId` |
| Locked dim (opacity 0.55) | when `!saveMgr.isHeroUnlocked(id)` |

**Tree pane:**

| Section | Contents |
|---|---|
| Header | "{displayName}" (large, hero stroke color) + role subtitle + right-aligned "★ X / Y spent on {shortName}" (X = sum of costs of purchased nodes in this branch; Y = sum of all costs in this branch) |
| Locked banner (locked hero only) | Orange dashed box: "🔒 Clear Map N to unlock {displayName}". Replaces purchase actions; the node renderer still draws the nodes, but `getNodeState` returns `'locked-hero'` for all of them so no purchase click handlers attach. |
| Node list | Every node where `node.branch === inspectedHeroId`, in array order. Each node rendered by the shared `renderUpgradeNode` helper (see §4.3). |

### 3.4 ⚙ Upgrades overlay (existing, slimmed)

| Change | |
|---|---|
| `#upgrade-overlay-title` text | "Command Doctrine" → "Doctrine" |
| `BRANCHES` const in `UpgradeTreeOverlay.js` | Remove `rael`, `engineer`, `scout`, `pyro` entries. Keep `logistics`, `arsenal`. |

Everything else about that overlay stays — same renderer, same available-stars chip, same open/close.

## 4. State + JS modules

### 4.1 State model

| Variable | Lives | Mutated by | Read by |
|---|---|---|---|
| `selectedHeroId` | `SaveManager` (persisted in `lastlight_save`) | `HeroManagementOverlay` rail click on an unlocked card | `MapSelectScene._bindPlay` (passed to GameScene), `HeroManagementOverlay._renderRail` (for badge), `MapSelectScene.create` (initial inspect) |
| `_inspectedHeroId` | `HeroManagementOverlay` instance | Any rail click | `_renderRail` (for inspecting border), `_renderTree` (for which branch to show) |

On `open()`: `this._inspectedHeroId = saveMgr.getSelectedHero()`. This guarantees the overlay always opens showing the committed hero, even if the previous interaction left the user inspecting a locked hero.

### 4.2 New file: `src/ui/HeroManagementOverlay.js`

```
class HeroManagementOverlay {
  constructor(upgradeMgr, saveMgr)
    // cache DOM refs: #hero-mgmt-overlay, #hero-rail, #hero-tree, #hero-avail, #hero-close
    // _onClose = () => this.close()

  open()
    // _inspectedHeroId = saveMgr.getSelectedHero()
    // closeBtn.addEventListener('click', _onClose)
    // overlay.style.display = 'flex'
    // _render()

  close()
    // closeBtn.removeEventListener('click', _onClose)
    // overlay.style.display = 'none'

  _render()
    // _renderRail()
    // _renderTree(_inspectedHeroId)
    // _availEl.textContent = `⭐ ${upgradeMgr.getAvailableStars()} to spend`

  _renderRail()
    // for heroId of HERO_ORDER:
    //   build card; mark .inspecting if _inspectedHeroId === heroId
    //   if saveMgr.isHeroUnlocked(heroId):
    //     mark .selected (badge) if saveMgr.getSelectedHero() === heroId
    //     onClick: saveMgr.setSelectedHero(heroId); _inspectedHeroId = heroId; _render()
    //   else:
    //     mark .locked; show unlock hint
    //     onClick: _inspectedHeroId = heroId; _render()

  _renderTree(heroId)
    // build header (name, subtitle, "X / Y spent" stars)
    // if !saveMgr.isHeroUnlocked(heroId): render banner
    // for node of UPGRADES.filter(u => u.branch === heroId):
    //   append renderUpgradeNode(node, upgradeMgr, HEROES, onChange=() => _render())
}
```

### 4.3 Refactor: extract `src/ui/upgradeNode.js`

`UpgradeTreeOverlay._renderNode` is currently inlined. The new overlay needs identical node-rendering. Extract to a pure helper:

```
export function renderUpgradeNode(node, upgradeMgr, heroDefs, onChange) {
  const state = upgradeMgr.getNodeState(node.id);
  // build DOM (same structure as current _renderNode)
  // affordable -> click handler calls upgradeMgr.purchase(node.id) + onChange()
  // purchased  -> refund button calls upgradeMgr.refund(node.id) + onChange()
  // locked-threshold -> show "Needs {threshold}★ earned"
  // locked-hero -> add tooltip "🔒 Clear Map N to unlock {displayName}"
  // return the DOM element
}
```

Both `UpgradeTreeOverlay._renderNode` and `HeroManagementOverlay._renderTree` call this helper. `UpgradeTreeOverlay` shrinks; behavior is identical.

### 4.4 Modified files

| File | Change |
|---|---|
| `src/scenes/MapSelectScene.js` | Delete `_renderHeroPicker` and `toCssColor` helper. Drop `this._renderHeroPicker()` call from `create()`. Add `_bindHeroes()` mirroring `_bindUpgrades` / `_bindSettings`. Instantiate `HeroManagementOverlay` alongside the existing overlays. `shutdown()` hides `#hero-mgmt-overlay`. |
| `src/ui/UpgradeTreeOverlay.js` | Drop 4 hero entries from `BRANCHES`. Replace inline `_renderNode` body with a call to `renderUpgradeNode`. |
| `index.html` | Add `<button id="open-heroes">🦸 Heroes</button>` between `#open-upgrades` and `#open-settings`. Delete `<div id="hero-picker">…</div>` block. Add `#hero-mgmt-overlay` markup (mirrors `#upgrade-overlay` structure). Inline CSS at top of `<style>` for the new overlay (matches project convention). Change `#upgrade-overlay-title` text to "Doctrine". Remove `.hero-picker-label`, `.hero-picker-cards`, `.hero-card`, `.hero-card.locked`, `.hero-card.active`, `.hero-card-portrait`, `.hero-card-name`, `.hero-card.locked .hero-card-portrait` CSS rules. |

### 4.5 Data layer

**One additive change:** add a `role` string field to each `HEROES[*]` def in `src/data/heroes.js`. Values:

| Hero | role |
|---|---|
| rael | `'Generalist bruiser'` |
| engineer | `'Support / builder'` |
| scout | `'Ranged DPS / anti-air'` |
| pyro | `'AoE / burn'` |

(These match the strings currently inlined in `UpgradeTreeOverlay.BRANCHES`. After this change, the `BRANCHES` const for `logistics` + `arsenal` keeps its own `title` + `subtitle`; hero branches' subtitle string now lives on the hero def, single source of truth.)

**No other data-layer changes.** `UpgradeManager.getNodeState` already returns `'locked-hero'` for hero-gated nodes when the hero isn't unlocked, and `canPurchase` already gates on `isHeroUnlocked`. `SaveManager.getSelectedHero` / `setSelectedHero` / `isHeroUnlocked` already exist. `UPGRADES[*].branch` already maps 1:1 to hero ids for the hero branches. No changes to save format, upgrade math, matchups, or any combat logic.

## 5. Click semantics (canonical)

| Card state | Click effect |
|---|---|
| Unlocked, not currently inspecting | `setSelectedHero(id)` + `_inspectedHeroId = id` + re-render |
| Unlocked, currently inspecting | `setSelectedHero(id)` (no-op if it was already the selected hero) + re-render |
| Locked | `_inspectedHeroId = id` + re-render. **No** `setSelectedHero` call. |
| Node (affordable) inside tree | `upgradeMgr.purchase(node.id)` + re-render |
| Node (purchased) Refund button | `upgradeMgr.refund(node.id)` + re-render (cascade handled by `UpgradeManager.refund` internally) |
| Close button | `close()` |

There is no separate "Select for Combat" button. The act of clicking an unlocked card is the commit.

## 6. Visual states (summary)

| State | Visual |
|---|---|
| Inspecting | Cyan (`#4fc3f7`) 1px border on the card |
| Selected (committed for combat) | Green pill `✓ SELECTED` at card's top-right corner |
| Locked | Card opacity 0.55, portrait is a 🔒 emoji on dark grey background, unlock hint below role tag |
| Locked + inspecting | Both — cyan border AND dim AND unlock hint |
| Selected can never coexist with Locked (selected hero is always unlocked by construction) |  |

## 7. Tests

### 7.1 New: `src/ui/upgradeNode.test.js`

| Case | Assertion |
|---|---|
| Affordable node | Element has `.affordable` class; click invokes `upgradeMgr.purchase(id)` + `onChange()` |
| Purchased node | Element has `.purchased` class; contains a Refund button; refund click invokes `upgradeMgr.refund(id)` + `onChange()` |
| Locked-threshold | Element has `.locked-threshold` class; contains gate text with threshold value |
| Locked-hero | Element has `.locked-hero` class; `title` attribute contains the unlock-map hint |
| Unaffordable | Element has `.unaffordable` class; no click handler attached |

### 7.2 New: `src/ui/HeroManagementOverlay.test.js`

| Case | Assertion |
|---|---|
| `open()` | `#hero-mgmt-overlay` becomes `display:flex`; rail has 4 cards in `HERO_ORDER`; tree shows the selected hero's branch nodes |
| `open()` initial state | `_inspectedHeroId === saveMgr.getSelectedHero()` (badge and inspecting border on the same card) |
| Click unlocked card | `saveMgr.setSelectedHero` called with that hero's id; rail re-rendered with badge on new card; tree shows new hero's nodes |
| Click locked card | `saveMgr.setSelectedHero` **not** called; tree shows locked hero's nodes; unlock banner is visible; every node in tree has `.locked-hero` class |
| Purchase | Click an affordable node → `upgradeMgr.purchase(id)` called; available-stars label updates; node re-renders as purchased |
| Refund | Click Refund on a purchased node → `upgradeMgr.refund(id)` called; available-stars label updates |
| Refund cascade | Refunding a prerequisite refunds its purchased dependents (delegated to `UpgradeManager.refund`; spec-level assertion is just that the call goes through) |
| `close()` | overlay hides; close-button click listener removed (assert no duplicate listener after re-open) |
| Stars header | "★ X / Y spent on {shortName}" reflects sum of purchased nodes in current branch |

### 7.3 Renamed: `MapSelectScene.heroPicker.test.js` → `MapSelectScene.heroOverlay.test.js`

| Case | Assertion |
|---|---|
| MapSelect mount | `#hero-picker` not in DOM; `#open-heroes` button bound; clicking opens the overlay |
| (Remove the existing tests that drove the small-card click behavior.) | — |

### 7.4 New: `UpgradeTreeOverlay.test.js`

There is no current test for `UpgradeTreeOverlay`. Add minimal coverage now that the file is being refactored:

| Case | Assertion |
|---|---|
| `open()` populates only Logistics + Arsenal columns | Tree contains exactly 2 `.upgrade-branch` columns; their headings match those two branch titles |
| Node rendering delegates to `renderUpgradeNode` | A purchased logistics node renders with `.purchased` class and a Refund button (smoke test that the extraction did not regress behavior) |
| `close()` removes close-button listener | Re-opening then closing twice does not stack listeners |

### 7.5 Test posture

Mock-based, jsdom (matches existing overlay tests). Reuse the `phaserMock` pattern only if a test file transitively imports an entity that imports Phaser (none in scope here, since `HeroManagementOverlay` only depends on `UPGRADES`, `HEROES`, and the manager classes). Run with the existing `npm test` command. Lint-skip remains in effect (no `eslint.config.js`).

## 8. Risks + non-goals

### 8.1 Risks tracked

1. **Stars accounting per hero is decorative only.** The "★ X / Y spent on {shortName}" header in the tree pane is a display-only calculation. The single source of truth for available-stars stays `upgradeMgr.getAvailableStars()` (global). Do not introduce a per-hero star pool.
2. **Refund cascade crossing branches.** `UpgradeManager.refund` cascades by `node.requires`, which today is always within the same branch. The new overlay should not assume this — a refund triggered from one hero's tree could in principle remove a node from another branch. If that ever happens, the next `_render()` correctly redraws based on `getNodeState`, so the UI stays consistent. No special-casing needed.
3. **Open-overlay during scene shutdown.** `MapSelectScene.shutdown` must hide `#hero-mgmt-overlay` (one-liner added to the existing shutdown hide-list).
4. **Test count growth.** ~+15 net tests. No performance concern.

### 8.2 Non-goals (explicit out-of-scope)

- No data-layer changes (`SaveManager`, `UpgradeManager`, `heroes.js`, `upgrades.js`)
- No per-hero star pool or per-hero economy split
- No hero stats / ability preview inside the overlay (future enhancement)
- No 🦸 Heroes button on the in-level HUD — MapSelect only
- No changes to the Audio settings overlay
- No drag-to-reorder of heroes in the rail (rail order = `HERO_ORDER`)

## 9. Acceptance criteria

1. From MapSelect, clicking 🦸 Heroes opens an overlay with 4 hero cards on a left rail and one hero's upgrade tree on the right.
2. The cyan-bordered card identifies which hero's tree is shown; the ✓ SELECTED badge identifies which hero will drop into the next match.
3. Clicking an unlocked hero card switches both: the inspected tree and the selected-for-combat persistence.
4. Clicking a locked hero card switches only the inspected tree; the tree shows nodes read-only and surfaces an unlock banner.
5. Purchasing or refunding a node inside the tree updates the available-stars chip in the title bar and re-renders the tree pane.
6. Closing the overlay returns the player to MapSelect; the selected hero from inside the overlay is what gets passed to GameScene when PLAY is clicked.
7. The featured-panel hero picker no longer exists.
8. The ⚙ Upgrades overlay shows only Logistics and Arsenal branches.
9. All existing tests still pass (with the test-file renames + per-§7.4 update applied); no new lint failures.
