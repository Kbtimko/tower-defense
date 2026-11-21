# 4.3 Enemy Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Install the user's G2 picks for drone, phantom and titan (1x + 2x), hold their on-screen footprint, and retire the drone's `NOT_REPRODUCIBLE` exception.

**Architecture:** `art:apply` installs picks (refs, sheets, normalize, ground, sprite2x.js, gates). Then data tuning in `src/data/sprites.js` and the small code/test changes that the drone becoming reproducible implies.

**Tech Stack:** Node scripts, Python (PIL, rembg via `/usr/bin/python3`), Vitest.

**Spec:** `docs/superpowers/specs/2026-11-21-enemy-refresh-design.md`

## Global Constraints

- `npm run art:apply` spawns `python3`; run it as `PATH=/usr/bin:$PATH npm run art:apply -- <picks>` so rembg is found.
- Footprint targets (display px, from `git show 047b599:src/data/sprites.js`): drone `ground.width` 32.2, phantom 30.2 (±5 %); titan's longest drawn dimension 104 (±5 %), measured from the normalized idle/move frame × scale.
- After any `scale` change, re-run `/usr/bin/python3 scripts/art/normalize.py --only enemy/<type> --ground-json <tmp>` (copy ground into the entry) and `/usr/bin/python3 scripts/art/normalize.py --scale 2 --only enemy/<type>` (must exit 0).
- `npm run assets -- --strict`, `npx vitest run`, `/usr/bin/python3 -m unittest discover -s scripts/art -p 'test_*.py'`, `npm run build` green at the end.
- Conventional Commits, explicit paths, `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; no test output through tail/head; no bare git stash.

## Review Focus

1. The drone's old shipped sheets came from an unknown reference; after apply, `--all` rebuilds must reproduce every shipped enemy sheet (Task 2 Step 2 byte-identical check).
2. The phantom is a flyer (`HOVER` set, detached shadow): the new art must still hover (no ground contact, `HOVER` unchanged).
3. Titan orientation: upright → horizontal changes its silhouette height a lot; the HP bar / boss UI anchored above the sprite must still sit above it (live check).
4. `sprite2x.js` gains the drone's two sheets, and the pinned 1x-at-k=2 set becomes empty (Task 1 Step 1).

---

### Task 1: Drone becomes reproducible, then install the picks

**Files:** `src/systems/spriteResolution.test.js` (pinned set), `src/assets/assetManifest.test.js` (drone @2x rows), `scripts/build-sprite-sheets.py` (`NOT_REPRODUCIBLE` loses `enemy_drone`), plus everything `art:apply` changes (refs in `.art-cache/sprites`, `assets-src/sprites/enemies/{drone,phantom,titan}_*`, `public/assets/sprites/enemies/{drone,phantom,titan}_*` incl. `@2x`, `src/data/sprites.js` ground, `src/data/sprite2x.js`, `scripts/art/facing.json`).

- [ ] **Step 1: Change the pinned tests first** (apply runs `npm test` as its gate, so the old "exactly enemy:drone stays 1x" pin would roll the install back): `spriteResolution.test.js` → "no entity stays 1x at k=2" (unresolved set is empty); `assetManifest.test.js` → the drone has `@2x` rows at 2x size. Run them → FAIL (drone still has no 2x art) and record it. Do not commit yet.
- [ ] **Step 2:** Remove `enemy_drone` from `NOT_REPRODUCIBLE` (if `scripts/art/test_build_sheets.py` pins the drone entry, update it to the empty dict).
- [ ] **Step 3:** `PATH=/usr/bin:$PATH npm run art:apply -- <picks.json from the controller>` → exit 0 (its gates now pass with the new tests).
- [ ] **Step 4:** Commit tests + `build-sprite-sheets.py` + every path `git status` shows from apply: `feat(enemies): new drone, phantom and titan art; drone reproducible (4.3)`.

### Task 2: Hold footprints and re-verify reproducibility

**Files:** `src/data/sprites.js` (scale + ground for drone/phantom/titan), the re-normalized sheets, `scripts/art/README.md`, `docs/licenses.md`.

- [ ] **Step 1:** Measure each new entity's footprint and set `scale` to hit the Global Constraints targets; re-run both normalize passes per changed entity and copy ground. A failing test first: in `src/data/sprites.test.js`, `enemy footprints hold their pre-4.3 size` — drone/phantom `ground.width` within 5 % of 32.2/30.2 and the titan's drawn longest side within 5 % of 104 (read the frame size × scale from the manifest; derive the titan's drawn extent from the normalized sheet's alpha bbox in the test via a small PNG read, or assert on `ground.width` ≥ 0.9×104 if the titan is wider than tall).
- [ ] **Step 2: Reproducibility check:** `/usr/bin/python3 scripts/build-sprite-sheets.py --all --out-root <tmp>` and compare every enemy sheet with `assets-src/sprites/enemies` → all identical, now including the drone.
- [ ] **Step 3:** Update the README and `docs/licenses.md` sentences that call the drone 1x-only / not reproducible. Full gates (Global Constraints). Commit `feat(enemies): hold the refreshed enemies at today's footprint (4.3)`.

## After the tasks (controller)
Opus final review; live capture at k=1 and k=2 vs base: the three enemies render from art at the same footprint, phantom visible on map 9, titan reads as walking right and its HP bar sits above it; flow matrix; roadmap 4.3 ticked and 4.4 marked superseded (user decision 2026-11-21).
