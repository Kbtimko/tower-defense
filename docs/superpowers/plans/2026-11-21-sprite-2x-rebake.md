# 4.1b 2x Sprite Sheets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a second, 2x-cell set of sprite sheets that loads only at render scale k = 2, so sprites are as sharp as 4.1a's 2x canvas allows, with k = 1 byte-identical.

**Architecture:** The Python sheet builder and normalizer gain a `--scale 2` pass that writes `<name>@2x.png` siblings and a generated `src/data/sprite2x.js` listing them. A pure resolver turns the 1x manifest into the k-resolved manifest (all-or-nothing per entity); every runtime consumer reads the manifest through it. The asset check and `art:apply` keep both sets in step.

**Tech Stack:** Phaser 3.90, vanilla ES modules, Vitest 2 + jsdom, Python 3 (PIL, numpy, rembg), Node scripts.

**Spec:** `docs/superpowers/specs/2026-11-21-sprite-2x-rebake-design.md` (read it, including "Builder-check resolutions").

## Global Constraints

- k = 1 is byte-identical: no 1x sheet, 1x manifest value or 1x code path changes.
- 2x sheets: same frames/order as 1x, cell exactly 2x the entry's 1x `frameWidth`/`frameHeight`, named `<name>@2x.png` beside the 1x file in both `assets-src/sprites/` and `public/assets/sprites/`.
- Coverage is per entity, all-or-nothing over base + every declared variant (builder-check 2). At k = 2 exactly `{ enemy:drone }` stays 1x.
- On-screen size, anchor, ground and timing are unchanged at k = 2 (`frameWidth × scale` identical).
- `src/data/sprite2x.js` is generated, never hand-edited.
- Python steps that cut out references need `rembg`: on this Mac run them with `/usr/bin/python3` (anaconda `python3` lacks it). References: `.art-cache/sprites` (already staged in this worktree from the 4.2 cache; gitignored).
- Tests importing anything that pulls in Phaser must `vi.mock('phaser', ...)`.
- Conventional Commits; explicit `git add` paths only; never pipe test output through `tail`/`head`; never bare `git stash`.
- Every new test is shown FAILING before its fix (record the failing assertion in the report).

## Review Focus

1. **Module evaluation order:** `getRenderScale()` is set in `main.js` after `sprites.js` is imported, so a manifest resolved at module load would always be 1x → Task 3 test `resolves at call time, not import time`.
2. **A variant that borrows a base state** must never mix 1x and 2x → Task 3 test `an entity with one uncovered sheet stays 1x in base and variants`.
3. **Partial `--only` runs** must not drop other entries from `sprite2x.js` → Task 1 test `sprite2x.js is regenerated from every @2x file on disk`.
4. **Soldier tier recolours at k = 2** read frame sizes from the manifest def → Task 3 test `soldier tier textures use the resolved frame size`.
5. **A future art pick** updating only the 1x set → Task 4 test `apply plans a 2x build and normalize after the 1x steps`.

---

### Task 1: 2x pass in the sheet builder and normalizer

**Files:**
- Modify: `scripts/build-sprite-sheets.py` (`main`, naming via `sheet_path`)
- Modify: `scripts/art/normalize.py` (`main`, `normalize_entry`, `_normalize_states`)
- Test: `scripts/art/test_build_sheets.py`, `scripts/art/test_normalize.py`

**Interfaces:**
- Produces:
  - CLI `build-sprite-sheets.py ... --scale 2`: cell = (`--cell` or `CELL_OVERRIDES` or `PLAN` cell) × 2; output path `<dir>/<name>@2x.png`; everything else (frames, transforms, `NOT_REPRODUCIBLE` skip in `--all`) unchanged. `--scale` defaults to 1 (today's behaviour, today's file names).
  - CLI `normalize.py ... --scale 2`: for each entry/variant, reads `<src>@2x.png`, treats `frameWidth/frameHeight × 2` and `scale / 2`, writes `<out>@2x.png`; skips (with a printed note) any entry whose `@2x` source is missing; measures ground and **exits non-zero** if any measured `footY`/`width` differs from the manifest's 1x `ground` (variant ground if set) by more than `0.5`. After processing, regenerates `src/data/sprite2x.js` from every `public/assets/sprites/**/*@2x.png` on disk.
  - `src/data/sprite2x.js` format (generated, sorted, with a do-not-edit header): `export const SPRITE_2X = new Set([ 'assets/sprites/towers/archer_idle.png', ... ]);` — the **1x** paths that have a 2x sibling.

- [ ] **Step 1: Write failing Python tests.**
  - `test_build_sheets.py` `test_scale_2_doubles_cell_and_names_at2x`: build one entity from a small synthetic reference into a temp out-root with `--scale 2` (stub `cutout` with `unittest.mock` as the existing tests mock what they need, so no rembg is required); assert the file is `<name>@2x.png` and its size is exactly 2x the `--scale 1` build's.
  - `test_normalize.py`:
    - `test_scale_2_keeps_outline_display_width`: normalize a synthetic 1x and 2x pair of the same silhouette; the outline width in source px at 2x is 2x the 1x width (measure navy ring thickness).
    - `test_scale_2_fails_on_ground_drift`: a 2x sheet whose silhouette is shifted down by `ceil(1.0 / (scale / 2))` source px (> 0.5 display px of ground drift) makes `main(['--scale','2', ...])` exit non-zero naming the entity.
    - `test_sprite2x_js_is_regenerated_from_every_at2x_file_on_disk`: with two `@2x` files under a temp out-root and an `--only` run touching one, the written module lists both 1x paths, sorted.
- [ ] **Step 2: Run** `/usr/bin/python3 -m unittest discover -s scripts/art -p 'test_*.py'` — Expected: the new tests FAIL.
- [ ] **Step 3: Implement** the two `--scale` passes. Keep the 1x code path identical when `--scale` is 1. Add a `--sprite2x-js PATH` option (default `src/data/sprite2x.js`) so tests write to a temp file.
- [ ] **Step 4: Run** the Python suite — Expected: all pass. Run `npx vitest run scripts/art` — Expected: pass (JS tests over the art scripts are unaffected).
- [ ] **Step 5: Commit**
```bash
git add scripts/build-sprite-sheets.py scripts/art/normalize.py scripts/art/test_build_sheets.py scripts/art/test_normalize.py
git commit -m "feat(art): --scale 2 pass builds and normalizes @2x sprite sheets (4.1b)"
```

---

### Task 2: Generate and commit the 2x set

**Files:**
- Create: `assets-src/sprites/**/<name>@2x.png` (81), `public/assets/sprites/**/<name>@2x.png` (81), `src/data/sprite2x.js`

**Interfaces:**
- Consumes: Task 1 CLIs.
- Produces: the committed 2x set and `SPRITE_2X` covering every manifest sheet except the drone's two.

- [ ] **Step 1: Byte-identical gate (builder-check 4).** `/usr/bin/python3 scripts/build-sprite-sheets.py --all --out-root <tmp>`; compare every output to `assets-src/sprites` (PIL `ImageChops.difference(...).getbbox() is None`). Expected: 81 identical, only `enemies/drone_*` not rebuilt. **If any differ: stop, report BLOCKED with the list.**
- [ ] **Step 2: Build 2x sources:** `/usr/bin/python3 scripts/build-sprite-sheets.py --all --scale 2`. Expected: 81 `@2x.png` under `assets-src/sprites/`, drone skipped.
- [ ] **Step 3: Normalize 2x:** `/usr/bin/python3 scripts/art/normalize.py --scale 2`. Expected: exit 0 (no ground drift > 0.5), 81 `@2x.png` under `public/assets/sprites/`, `src/data/sprite2x.js` with 81 entries.
- [ ] **Step 4: Verify 1x untouched:** `git status --short assets-src/sprites public/assets/sprites src/data` shows only new `@2x` files and `sprite2x.js` (no modified 1x file). `npx vitest run` and `npm run assets -- --strict` — Expected: pass (2x files are not yet referenced).
- [ ] **Step 5: Commit.** Print `git ls-files --others --exclude-standard assets-src/sprites public/assets/sprites` and confirm it lists only the 162 `@2x.png` files; then `git ls-files -z --others --exclude-standard assets-src/sprites public/assets/sprites | xargs -0 git add --` and `git add src/data/sprite2x.js`.
```bash
git commit -m "feat(art): 2x sprite sheets for every reproducible entity (4.1b)"
```
Record shipped bytes: `du -ch public/assets/sprites/**/*@2x.png | tail -1` (report only; not a gate).

---

### Task 3: Resolve the manifest by render scale at call time

**Files:**
- Create: `src/systems/spriteResolution.js`, `src/systems/spriteResolution.test.js`
- Modify: `src/data/sprites.js` (add `spriteManifest()`; `getSpriteConfig` reads it)
- Modify: `src/scenes/BootScene.js` (loader loop ~line 88 and registry loop ~line 108 use `spriteManifest()`)
- Modify: `src/systems/soldierTierTextures.js` (entry lookup ~line 14 uses `spriteManifest()`)
- Test: `src/systems/soldierTierTextures.test.js`, `src/data/sprites.test.js`

**Interfaces:**
- Consumes: `SPRITE_2X` (Task 2), `getRenderScale()` (4.1a, `src/systems/renderScale.js`).
- Produces:
  - `resolveEntry(entry, k, has2x: (path) => boolean) → entry` — pure. Returns `entry` unchanged when `k !== 2` or when any state path of the base or of any variant fails `has2x`; otherwise a new entry whose base and every variant `states[*]` have `path` → `@2x` sibling, `frameWidth`/`frameHeight` × 2, and whose `scale` (base, and each variant that sets one) is halved. `anchor`, `ground`, `frames`, `frameRate`, `baseFacing` untouched.
  - `resolveManifest(manifest, k, has2x)` → `manifest.map(e => resolveEntry(e, k, has2x))`.
  - `spriteManifest()` in `sprites.js` → `resolveManifest(SPRITE_MANIFEST, getRenderScale(), p => SPRITE_2X.has(p))`, memoized per k. `SPRITE_MANIFEST` stays the 1x manifest (tooling reads it).
  - `at2x(path)` helper: `'a/b.png'` → `'a/b@2x.png'`.

- [ ] **Step 1: Write failing tests** (`spriteResolution.test.js`, plus the soldier test):
  - `k=1 returns the entry unchanged` (same object).
  - `k=2 with full coverage doubles frames, halves scale, points at @2x` (synthetic entry with one variant that has its own `scale` and one without).
  - `an entity with one uncovered sheet stays 1x in base and variants`.
  - `display size is identical at k=1 and k=2 for every real manifest entry and variant` — loop over `SPRITE_MANIFEST` with `has2x = p => SPRITE_2X.has(p)`; for each state compare `frameWidth × scale` (variant scale ?? base scale).
  - `exactly enemy:drone stays 1x at k=2` — the set of `category:type` whose resolved entry `=== ` the input equals `['enemy:drone']`.
  - `every SPRITE_2X path is a manifest sheet path` (no stale entries).
  - `resolves at call time, not import time` — import `sprites.js`, then `setRenderScale(2)`, then `spriteManifest()` returns @2x paths for the archer; reset to 1 in `afterEach`.
  - `soldier tier textures use the resolved frame size` — at k = 2, `addSpriteSheet` receives the doubled `frameWidth`/`frameHeight`.
- [ ] **Step 2: Run** `npx vitest run src/systems/spriteResolution.test.js src/systems/soldierTierTextures.test.js` — Expected: FAIL.
- [ ] **Step 3: Implement** the resolver, `spriteManifest()`, `getSpriteConfig` via `spriteManifest()`, and switch BootScene's two loops and `soldierTierTextures` to `spriteManifest()`. Grep `src/` (non-test) for other readers of `SPRITE_MANIFEST` and route runtime ones through `spriteManifest()`; leave `src/assets/*` (tooling/asset check) on `SPRITE_MANIFEST` for Task 4.
- [ ] **Step 4: Run** `npx vitest run` — Expected: all pass; `npm run build` exit 0.
- [ ] **Step 5: Commit**
```bash
git add src/systems/spriteResolution.js src/systems/spriteResolution.test.js src/data/sprites.js src/scenes/BootScene.js src/systems/soldierTierTextures.js src/systems/soldierTierTextures.test.js
git commit -m "feat(render): load 2x sprite sheets at render scale 2 (4.1b)"
```

---

### Task 4: Asset check and art:apply keep both sets in step

**Files:**
- Modify: `src/assets/assetManifest.js` (`spriteAssets` / required list) and its test
- Modify: `src/assets/applyPlan.js` (`spriteSteps`) and its test

**Interfaces:**
- Consumes: `SPRITE_2X`, `at2x()` (Task 3).
- Produces:
  - `npm run assets` additionally lists every `SPRITE_2X` sheet's `@2x` file with `expected` = 2 × the 1x sheet's expected `{ width, height }` (frames × frameWidth × 2, frameHeight × 2), so `--strict` fails on a missing or missized 2x file.
  - `spriteSteps` appends, after the 1x `normalize` + `setGround` steps: `{ op: 'run', cmd: ['python3', 'scripts/build-sprite-sheets.py', assetId, '--ref-dir', refDir, '--scale', '2', ...(keepDebris ? ['--keep-debris'] : [])] }` then `{ op: 'run', cmd: ['python3', 'scripts/art/normalize.py', '--scale', '2', '--only', <same selector as the 1x step>] }`.

- [ ] **Step 1: Write failing tests.**
  - asset manifest: `lists each @2x sheet at twice its 1x size` (pick the archer idle entry from the real manifest; assert the `@2x` row exists with doubled expected size); `drone has no @2x row`.
  - apply plan: `apply plans a 2x build and normalize after the 1x steps` — for a base pick and a variant pick, the step list ends with the two 2x `run` steps in that order, after `setGround`, carrying `--keep-debris` when the asset has it.
- [ ] **Step 2: Run** the two test files — Expected: FAIL.
- [ ] **Step 3: Implement.** Update any apply test fixtures/snapshots that assert the exact step count (explain each in the report).
- [ ] **Step 4: Run** `npx vitest run`, `npm run assets -- --strict`, `/usr/bin/python3 -m unittest discover -s scripts/art -p 'test_*.py'`, `npm run build` — Expected: all pass/exit 0.
- [ ] **Step 5: Commit**
```bash
git add src/assets/assetManifest.js src/assets/assetManifest.test.js src/assets/applyPlan.js src/assets/applyPlan.test.js
git commit -m "feat(art): asset check and art:apply cover the 2x sprite set (4.1b)"
```

---

## After the tasks (controller)

Final whole-branch review (Opus), then live on the capture build (base = 4.1a head `7af91e1`), host load < 6:
1. `?res=1` on desktop1440x2: no request for any `@2x` URL (network log); frame matches 4.1a within the noise floor.
2. `?res=2`: zero 404s; every tower tier, enemy, hero, soldier (incl. tier recolours) renders from art (no Graphics fallback); the drone renders 1x.
3. Frozen-frame crops at `?res=2`, 4.1a vs 4.1b: sharper; alpha-mask silhouette bounds equal within 1 px.
4. Flow matrix green; 0 page errors. Report shipped-byte delta and k = 2 texture memory delta.
