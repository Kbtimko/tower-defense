# 2026-11-19 — backlog #73a: drop the core glow over tower art

Branch `visual/73a-drop-core-glow` → PR into `visual/integration`.

## What the user asked
- "how do i find the folder with the t1 & t2 columns?" `/private/tmp` is hidden in Finder, so the tier images were copied to `~/Downloads/tower-tiers/`.
- "drop the dots for 73a. for 74 build a sweep". "The dots" was read as the #49 core glow, the subject of #73a. Pips, the badge, embers, the T4 ring and the #66 stroke circle stay.

## Shipped
- `TowerTierLook.setTier` draws the core only when the tier is T2+ AND the sprite has no art (`!sprite.active`). A tower whose art fails to load keeps the core, so it still shows its tier. Upgrading a tower whose art became active removes the old core, because `_setCore(false)` destroys it.
- `expectedTowerLook(level, branch, { art = false } = {})`: `core` is `marked && !art`. The capture's tier-look check passes `{ art: true }`, so a tower that quietly lost its art now fails the check.
- `Tower.test.js`: three assertions on the art tower changed from core true (and core sizing) to core false / `_glow` null. These follow from the spec; core sizing is still covered in `TowerTierLook.test.js`.

## Found while scoping #74 (logged as #75)
Most tier-4 abilities are text only. The game fires with damage, range, fireRate, splash, pierce and slow, and nothing reads `passiveEffect` outside the info panels.
- Chain lightning, 2 arrows, split shells, frozen 2x, ignores armour, boss stun and archer 4B's range/pierce: none happen.
- Frost Mage has no slow.
- Ice 4B Shatter stops slowing entirely, because splash shots skip the slow.

## Process
- Short spec, then a one-task plan. A sonnet implementer (RED: 6 failing), then a sonnet task review: spec ✅, quality Approved, 1 optional Minor.

## Edge cases
- Art-less tower: the core is kept (E28 plus a new test).
- Art becomes active after a core was drawn: the core is removed on the next `setTier` (new test).
- T1 never has a core, with or without art.
- The capture expects `{ art: true }`, because every tower type declares art.

## Verification
- vitest: 235 files, 3926/3926.
- **Frozen-frame probe** on the capture build, map 9: 30 combinations (6 towers × T1/T2/T3/4A/4B).
  - Every tower has art active and 0 `fx-glow` children.
  - Embers are 3 from T3. Pips are 1/2/3, with A/B badges.
  - 0 page errors.
- **Proven:** the same probe on the pre-change (#72) build shows `glow: 1` on the art-backed T2 and T4 mage.
- **Capture `--screens` desktop1440:**
  - Run 1: tier-looks-still passed all three batches. The animated tier-looks run timed out on a canvas `boundingBox` during the per-tower crop step, after its looks checks had run.
  - Run 2 timed out earlier, in `shootBusiestFrame`.
  - Both ran under host load of 6–25 from other sessions, with a different step failing each time (the known load flake).
  - Run 3, started at load 1.5: exit 0, including both tier-looks runs (animated and reduced-motion). In the tier crops the core blob is gone and the art reads through (mage T2 orb, ice T3 crystal).
- Merged `visual/integration` after #126 (#74) landed; the only conflict was `.claude/notes.md` (both status entries and backlog items 73–75 kept).
