# Bug bundle #68 / #64 / #57 — design

**Status:** approved 2026-11-20 (short design, three small fixes, one PR).

## Intent
Three independent backlog bugs, each with a confirmed root cause:

- **#68 — barracks draws at its old depth after Move.** `Tower` sets
  `setDepth(unitDepth(this.y))` only in its constructor; `GameScene._repositionTo`
  calls `setPosition` but never re-derives depth, so a moved barracks keeps
  occluding (or being occluded by) neighbours as if it were still on its old pad.
- **#64 — Move mode survives arming a tower or an aim.** Ruling 16 ("newest
  intent wins") is implemented for rally by `_leaveRallyMode`, called from
  `_selectTowerType` and the aimed-ability branch of `_onAbility`. Nothing leaves
  reposition mode, and reposition is second in the tap chain (`tapResolve.js`),
  so after arming Archer the next pad tap moves the barracks instead of building;
  the build-range preview is also suppressed (`selectedType && !repositionMode`)
  and the blue Move ring stays drawn.
- **#57 — SaveManager getters read a stale snapshot.** Several instances share
  `lastlight_save` (boot registry `'save'`, GameScene, MapSelectScene). Setters
  re-read storage first (#114) but getters return the construction-time `_data`,
  so the boot instance feeding the codex's encounter gating
  (`progressFromSave(registry.get('save'))`) misses progress made in a level.

## Goals
- A moved barracks sorts by its new y.
- Arming a tower or an aim drops a pending Move exactly as it drops a pending rally.
- Every SaveManager getter reflects the latest stored save, whichever instance wrote it.

## Non-goals
- No single shared SaveManager instance (touches four constructors and their tests for the same result).
- No change to tap priority order, the rally behaviour, or save format/migrations.

## Anti-goals
- A per-frame localStorage parse. (Checked: no getter runs per frame — all are UI/scene-entry paths.)
- Breaking the Cancel button sync that callers do after leaving a mode.

## Approaches
- #57: getters read through `_refresh()` (picked) vs one shared instance (rejected above).
- #64: generalise `_leaveRallyMode` into `_leaveBarracksModes` covering rally and
  reposition (picked) vs a parallel `_leaveRepositionMode` called at both sites
  (two helpers that must always be called together).

## Design
- **#68:** in `_repositionTo`, after `barracks.setPosition(slot.x, slot.y)`, call
  `barracks.setDepth(unitDepth(slot.y))` (import `unitDepth` from `../systems/grounding.js`).
- **#64:** rename `_leaveRallyMode` → `_leaveBarracksModes`; it additionally clears
  `repositionMode` / `repositioningBarracks`. Both existing call sites switch to it.
  Callers still sync Cancel afterwards. (`_redrawZones` is a no-op placeholder; the
  Move ring and build preview are drawn per frame from the mode flags.)
- **#57:** every getter (`getStars`, `isUnlocked`, `getTotalStars`, `getRecord`,
  `getPurchasedUpgrades`, `getStats`, `getSettings`, `getSelectedHero`,
  `isHeroUnlocked`, `hasSeenBeat`, `getSeenBeats`) calls `this._refresh()` first.

## Left to the builder
- Whether `isHeroUnlocked` refreshes itself or relies on `getStars` doing it.
