# Wave Preview, Codex, and Ability Tooltips — Design

**Date:** 2026-09-21
**Branch:** `feat/wave-preview-codex-tooltips` (off `origin/main` @ `2240c6a`)
**Baseline:** 1182 tests passing, 84 files

## Problem

Three information gaps in the shipped game:

1. A player commits to a wave with no idea what is in it. `MAP_WAVES` knows the exact
   composition; nothing surfaces it.
2. There is no reference for what a tower, hero, or enemy actually does. The stat tables
   exist in `src/data/`; the player never sees them.
3. Hero abilities carry a `tooltip` string that is rendered only as a native browser
   `title` — a ~1s delayed, unstyled, touch-invisible hint that omits cooldown and
   unlock level.

## Scope

In scope: a pre-wave composition popover, a Towers/Heroes/Enemies codex reachable from
map select and mid-level, and a styled hover card for hero abilities on both the in-game
HUD and the Hero Command overlay.

Out of scope: new art or audio; balance changes; any change to wave composition, stats,
or matchup values; localisation; a save-format migration.

## Decisions taken during brainstorming

| Question | Decision |
|---|---|
| Wave preview placement | Popover on hover/click of the Send Wave control — not an inline strip |
| Codex gating | Show every entry; dim and tag ones not yet encountered |
| Codex access | Map-select meta bar **and** mid-level |
| Mid-level codex and pause | Auto-pause while open, honouring an existing user pause |
| Matchup hints | Shown in both the wave popover and the codex |
| Encounter tracking | Derived from existing save progress — **no SaveManager migration** |
| Architecture | Shared pure content model, separate DOM chrome per surface |

## Architecture

Follows the existing split: pure logic in `src/systems/`, DOM in `src/ui/`, data
untouched in `src/data/`.

### Pure modules (no Phaser, no DOM, fully unit-testable)

**`src/systems/entityDescriptors.js`** — single source of truth for "what is this thing".

- `describeEnemy(type)` → `{ type, name, icon, hp, speed, armor, flying, reward,
  vulnerableTo, resists }`. Matchups come from the existing `describeEnemyMatchups`.
- `describeTower(type)` → `{ type, name, icon, cost, range, damage, fireRate,
  splashRadius, pierce, slow, tiers: [...], ability, soldierStats?, effective, weak }`.
  `soldierStats` is present only for the barracks; `damage: 0` must render as soldier
  stats, not a blank damage row.
- `describeHero(id)` → `{ id, displayName, shortName, role, stats, matchups,
  abilities: [...], unlockMapAfter }`. Its `abilities` are the **static** form — label,
  icon, cooldown, unlock level, effect — with no `state` field, because a codex entry
  describes the ability in the abstract. Live state is a separate concern: the HUD and
  Hero Command call `describeAbility` themselves with the current level and cooldown.
- `describeAbility(heroDef, slot, { level, heroUnlocked, cooldownRemaining })` →
  `{ slot, hotkey, label, icon, cooldown, unlockLevel, effect, state, lockReason }`
  where `state` is one of `available | cooldown | locked_level | locked_hero`.
  `unlockLevel` is read from `heroDef.stats.abilityUnlockLevels[slot]` — never hardcoded.

**`src/systems/wavePreview.js`**

- `summarizeWave(mapId, waveIndex)` → `{ waveNumber, totalCount, groups }` or `null`
  when the index is out of range. `groups` is one entry per enemy type, each the
  enemy descriptor plus `count`, ordered as authored in the wave.
- Counts for a repeated type within one wave are summed. (No wave does this today; the
  behaviour is defined so a future wave edit cannot produce a duplicated row.)
- `waveCount(mapId)` → `MAP_WAVES[mapId].length`. Wave counts vary per map
  (10, 10, 12, 12, 14, 14, 15, 15, 16, 18) — nothing may assume 10.

**`src/systems/codexCatalog.js`**

- `buildCatalog(progress)` → `{ towers, heroes, enemies }`, each an array of descriptors
  tagged `encountered: boolean`.
- `progress` is a plain object `{ starsByMap: {mapId: stars}, unlockedHeroIds: string[] }`
  so tests need no storage layer. The SaveManager → progress adapter lives at the call
  site in the scenes.
- Encounter rules:
  - **Towers** — always `encountered: true`. All six are purchasable from wave 1, so
    gating them would be a lie.
  - **Heroes** — mirrors `SaveManager.isHeroUnlocked`: `unlockMapAfter == null`, or
    that map has at least one star.
  - **Enemies** — every type appearing in `MAP_WAVES[m]` for every map `m` the player
    has reached. "Reached" means unlocked, not completed, so an enemy you are currently
    losing to is documented.

### DOM modules

All three follow the `SettingsOverlay` idiom exactly: an explicit `_listeners` array,
`open()` wires and `close()` unwires every listener as a pair, Escape and backdrop click
close, no inline arrow functions left attached.

**`src/ui/WavePreviewPopover.js`** — `constructor(anchorEl)`, `setWave(summary|null)`,
`show()`, `hide()`, `destroy()`. Opens on `pointerenter`, `focus`, or tap; closes on
`pointerleave`, `blur`, Escape, or an external `hide()`.

**`src/ui/CodexOverlay.js`** — `open(catalog, { initialTab, initialEntry })`, `close()`.
Three tabs, list pane plus detail pane. Unencountered entries get a `.codex-unseen`
class: reduced opacity, a "not yet encountered" tag, still fully readable and selectable.

**`src/ui/AbilityTooltip.js`** — one shared card element. `attach(anchorEl, getModel)`
where `getModel()` returns a `describeAbility` result at hover time (so cooldown and
level are current, not captured at wire time). `detachAll()` for teardown.

### Markup and CSS

New markup in `index.html` beside the existing overlays, styled to match
(`#codex-overlay` mirroring `#settings-overlay`; `.wave-preview-popover` and
`.ability-card` as new classes). z-index: codex above the tower panel and story dialog;
the popover and ability card above the bottom bar but below the codex.

### Wiring

- **`index.html`** — the in-game 📚 Codex button goes in the top `#hud` bar beside
  `#pause-btn`, not the bottom bar: the bottom bar is already six tower buttons plus
  Exit and Send Wave, and the codex is a peer of pause, not of a purchase.
- **`GameScene`** — owns `WavePreviewPopover`; refreshes its content inside the existing
  `_updateWaveButton()`, which already computes the correct next-wave number. Owns the
  new in-game 📚 button and the pause handshake. Unwires both in `shutdown()`.
- **`UIScene`** — attaches `AbilityTooltip` to `ability-q/w/e`, replacing the
  `btn.title = ...` assignment at `UIScene.js:377`. Feeds it the level state it already
  tracks in `_onHeroLevelUp` and the cooldowns from `_onHeroCooldownTick`.
- **`MapSelectScene`** — 📚 Codex button in `#map-meta-bar`, alongside
  ⚙ Upgrades / 🦸 Heroes / ♪ Audio / 📖 Story.
- **`HeroManagementOverlay`** — attaches the same `AbilityTooltip` to its ability rows,
  including the `locked_hero` state for heroes not yet unlocked.

## Critical implementation details

### Disabled buttons do not fire mouse events

`_updateWaveButton()` sets `#wave-btn.disabled = true` whenever a wave is in flight.
Chrome and Safari suppress pointer events on disabled form controls, so hovering a
disabled `#wave-btn` fires nothing. **The popover's hover target must be a wrapper
element around the button, not the button.** Without this the preview dies during the
exact window a player most wants to plan against, and it dies silently.

### The popover always describes the wave the button would send

During an early-send window `waveMgr.active && waveMgr.isEarlyEligible`, the button
reads "Send Wave N+1" and the popover must agree. When `waveMgr.done`, the popover is
suppressed entirely — no empty frame.

### Pause handshake

`GameScene` owns it, reusing the pattern already at `GameScene.js:237`:

- Opening the codex while `_userPaused === true` → change nothing; it stays paused.
- Opening while running → `this.scene.pause()`.
- Closing → `if (!this._userPaused) this.scene.resume()`.

A player who paused, opened the codex, then closed it must not be silently un-paused.

### Listener discipline

This codebase has already shipped a listener leak that multiplied enemy spawns per
replay (6 → 12 → 18). `this.events` survives scene shutdown. Every listener wired is
unwired as a pair; use `once('shutdown')`; never attach an inline arrow that cannot be
removed.

## Edge cases — each must be covered by a test

1. Final wave sent / `waveMgr.done` → popover suppressed, no empty frame.
2. Wave in progress, not early-eligible → button disabled, preview still reachable.
3. Wave in progress, early-eligible → popover shows wave N+1, matching the button.
4. Per-map wave counts read from data; map 9 (18 waves) and map 0 (10) both correct.
5. `summarizeWave` with an out-of-range index → `null`, no throw.
6. Duplicate types in one wave → counts summed into one row. A data test asserts the
   current no-duplicates invariant so a future wave edit is caught.
7. Every type in `MAP_WAVES` exists in `ENEMY_DEFS` — allow-list **derived from the
   data**, never a hardcoded array, so the suite cannot enforce dead content.
8. Fresh save, zero stars → codex shows map-0 enemies (drone, skitter, brute), Rael, and
   all six towers as encountered; everything else dimmed but readable.
9. Full completion → every entry encountered, nothing dimmed.
10. Barracks codex entry → renders soldier stats per tier, not a blank `damage: 0` row.
11. Ability card states → `available`, `cooldown` (shows remaining), `locked_level`
    (shows "Unlocks at L<n>" from data), `locked_hero` (shows the unlock condition).
12. Codex open/close leaves pause state exactly as it found it, in both pause branches.
13. Escape closes only the topmost surface.
14. Scene shutdown → no listener left attached by any of the three features.
15. Touch: tap opens the popover and the ability card; tap elsewhere dismisses.

## Testing strategy

- **Pure modules** — direct Vitest coverage of descriptors, wave summaries, and
  catalogue gating at zero / partial / full progress.
- **DOM modules** — jsdom tests following the existing `MapSelectScene.heroOverlay.test.js`
  pattern, covering listener teardown and the pause handshake. Any test importing an
  entity that transitively imports Phaser must `vi.mock` it.
- **Live verification** — `npm run build && npm run preview`, then browser-verify in the
  real game: popover during an active wave, codex mid-level with the pause handshake in
  both branches, and an ability card in each of its four states. A green suite is not a
  working feature.

## Success criteria

1. Hovering or tapping the Send Wave control shows the next wave's exact types, counts,
   stats, and counters — including while a wave is in flight.
2. A Codex reachable from map select and mid-level documents all 6 towers (with tier
   ladders), 4 heroes, and 6 enemies, with unencountered entries dimmed but readable.
3. Opening the codex mid-level pauses the game and closing it restores the prior pause
   state exactly.
4. Hovering a hero ability shows an instant styled card with name, hotkey, cooldown,
   unlock level, and effect, in all four states, on both the HUD and Hero Command.
5. Full suite green with the new tests, production build clean, and all of the above
   verified in a browser against the production build.
