# 4.5 Soldier, Engineer, Portraits Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the soldier legible (×1.5), ship the speaker portraits at 512 px (same art), and install a user-picked engineer without a baked shadow.

**Architecture:** Data + regenerated assets through the existing tools: `src/data/sprites.js` scale, `scripts/art/normalize.py` (1x and `--scale 2`) for ground, the legacy generator for portraits, `art:apply` for the engineer pick.

**Tech Stack:** Phaser 3.90, Vitest, Python (PIL, rembg via `/usr/bin/python3`), Draw Things HTTP (FLUX.1 [schnell]).

**Spec:** `docs/superpowers/specs/2026-11-21-units-portraits-design.md`

## Global Constraints

- Python with rembg: `/usr/bin/python3` (anaconda `python3` lacks rembg). For `npm run art:apply`, which spawns `python3`, run with `PATH=/usr/bin:$PATH`.
- Draw Things must be idle before any generation step (another batch may be running; check `ps aux | grep -c "scripts/art/runJob\|generate-art"`).
- 1x and @2x sheets move together; `npm run assets -- --strict` must pass.
- No hardcoded expected sizes in tests: derive from `src/data/` / the manifest.
- Conventional Commits, explicit paths, end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; never pipe test output through tail/head; never bare git stash.

## Review Focus

1. Portrait drift: regenerated faces must match the shipped ones (Task 2 comparison gate).
2. Soldier tier variants (t2–t4b) and the generated tier recolours scale with the base `scale` — confirm none carries its own `scale` that would skip the ×1.5 (Task 1 test over the manifest).
3. Soldier ground/footY re-measured at both 1x and 2x so contact shadows stay under the feet (Task 1).
4. The 4A shield and formation spacing at the new size (live check).

---

### Task 1: Soldier ×1.5

**Files:** Modify `src/data/sprites.js` (soldier `scale` 0.36 → 0.54, `ground` from normalize), test `src/data/sprites.test.js`.

- [ ] **Step 1: Failing test** in `src/data/sprites.test.js`: `soldier draws at 1.5x its pre-4.5 size` — `getSpriteConfig('soldier','default').scale` equals `0.54` (the spec value) and every soldier variant in the manifest either has no own `scale` or has one equal to 1.5× its previous value. Run `npx vitest run src/data/sprites.test.js` → FAIL.
- [ ] **Step 2:** Set `scale: 0.54`. Run `/usr/bin/python3 scripts/art/normalize.py --only soldier/default --ground-json /private/tmp/claude-501/soldier-ground.json`, copy the reported ground into the entry; then `/usr/bin/python3 scripts/art/normalize.py --scale 2 --only soldier/default` must exit 0 (ground within tolerance). Confirm `git status` shows no 1x PNG change except what normalize rewrote deterministically (normalize output depends on scale via outline width: if the soldier PNGs change, that is expected — commit them).
- [ ] **Step 3:** `npx vitest run`, `npm run assets -- --strict` → pass. Commit `feat(soldiers): draw soldiers 1.5x larger so squads read (4.5)`.

### Task 2: Portraits at 512

**Files:** Modify `src/assets/assetManifest.js:108` (portrait `expected` 256 → 512) and its test; regenerate `public/assets/portraits/portrait-{command,rael,veth}.png`.

- [ ] **Step 1: Failing test** in `src/assets/assetManifest.test.js`: portrait rows expect `{ width: 512, height: 512 }`. Run → FAIL.
- [ ] **Step 1b: Legacy generator uses `post()`** (added 2026-11-21).
  - `scripts/generate-art.mjs` (~line 161) still calls global `fetch`, which has undici's 300 s header timeout, and the 2026-11-21 runs lost images to it under load.
  - Replace that fetch with `post(port, endpoint, body)` from `./art/drawThings.mjs` (cherry-picked as dfc6784; it returns `{ ok, status, json }` and waits up to 30 min). Keep the existing log lines: `FAILED (HTTP ${status})`, and `FAILED (no image in response)` when `json` is null or has no image.
  - Check it with `node scripts/generate-art.mjs --kind portrait --force --dry-run`: it exits 0 and lists the 3 portraits. Also run `npx vitest run scripts/art`.
- [ ] **Step 2:** Change `expected`. Copy the three shipped PNGs to `/private/tmp/claude-501/portraits-256/` first. Then run `PATH=/usr/bin:$PATH npm run art -- --kind portrait --force` with Draw Things idle. `--force` is required, because without it the generator skips files that already exist and renders nothing.
- [ ] **Step 3: Sameness gate.** For each portrait, downscale the new 512 to 256 (PIL LANCZOS) and compare with the saved 256: report mean and max per-channel abs diff. Pass if mean < 4 (resampling noise). **If any fails, stop and report BLOCKED** with the numbers and both images saved side by side in `/private/tmp/claude-501/`.
- [ ] **Step 4:** `npx vitest run`, `npm run assets -- --strict` → pass. Commit `feat(portraits): speaker portraits at 512 px, same art (4.5)`.

### Task 3: Install the engineer pick (after the user's G2 pick)

**Files:** whatever `art:apply` changes (`.art-cache` refs, `assets-src/sprites/heroes/engineer_*`, `public/assets/sprites/heroes/engineer_*` 1x and @2x, `src/data/sprites.js` ground, `src/data/sprite2x.js`, `scripts/art/facing.json`).

- [ ] **Step 1:** `PATH=/usr/bin:$PATH npm run art:apply -- <picks.json path given by the controller>` → exit 0 (its own gates: assets strict + npm test).
- [ ] **Step 2: Hold size:** compare the new engineer `ground.width` with the old (from `git show HEAD:src/data/sprites.js`); if it differs by more than 15 %, set `scale` so the width matches within 5 % and re-run both normalize passes for `hero/engineer`.
- [ ] **Step 3:** Confirm no baked ground blob: render the new idle frame on a light background and check the pixels under the feet (report). `npx vitest run` → pass. Commit `feat(heroes): engineer art without the baked ground shadow (4.5)` listing the exact changed paths from `git status`.

## After the tasks (controller)
Opus final review; live capture A/B vs base (k=1 and k=2): dialog portraits 512 and sharper at 2x, squads legible at every tier and not over pads, engineer shadow-free; flow matrix.
