# 2026-11-16 — roadmap 4.0 Pipeline v2

Branch `visual/4.0-art-pipeline-v2` → PR into `visual/integration`.

## What the user asked
- "what's next to work on?" → "yes go with roadmap 4.0". The roadmap asks for job specs, N candidates per asset, auto-cutout, a review page, a `picks.json` apply step, and a dry-run that works without Draw Things.
- Design picks: tower tier variants in scope (a); visual companion yes; review layout C (contact sheet with a game-size strip on a map pad under every tile); "will you use draw things? i have it on my machine" → live check at the end on the local Draw Things; build approach A (new pipeline beside the legacy generator); a variant reuses its base's tone; spec approved.

## Shipped
- `npm run art -- --job <batch>`: `scripts/art/runJob.mjs` with `src/assets/artJob.js` (job validation, variants towers-only, `cell` rejected, batch must match the file name) and `src/assets/candidates.js` (cache layout, resumable seeds `seed + round*1000 + k`). `--fake`, `--dry-run`, `--reroll`, `--cache`/`ART_CACHE`, `--candidates`, `--no-prepare`. Then `scripts/art/prepare_review.py` writes `<i>.cut.png`, `<i>.preview.png` (game-size on a map pad) and `<i>.cut.json` (review-time mirror).
- `npm run art:review -- <batch>`: `src/assets/reviewPage.js` + `scripts/art/review.mjs`. Layout C, dark/light, Flip, None — reroll, pad ellipse, stale-localStorage prune, Download `picks.json`.
- `npm run art:apply -- picks.json`: `src/assets/picks.js`, `src/assets/applyPlan.js`, `scripts/art/applyExec.mjs`, `scripts/art/apply.mjs`. Backs up references, rebuilds sheets, re-normalizes, writes ground lines, gates on `assets --strict` + `npm test`, restores `sprites.js`/`spriteVariants.js`/`facing.json` on failure or SIGINT, names failing test files, prints what changed.
- Variants: parser accepts `- **archer.t4a** — …`; generated `src/data/spriteVariants.js` merged into `SPRITE_MANIFEST` (`mergeVariants`); variant files are `required` in the asset manifest; `build-sprite-sheets.py` and `normalize.py` take variants, `--ref-dir`, `--out-root`, `--only`, `--ground-json`; facing table `scripts/art/facing.json`.
- Docs: `scripts/art/README.md`, PROMPTS.md "Tier variants" section with a first-draft `archer.t4a` bullet.

## Process
- 11 tasks, subagent-driven, each task-reviewed; whole-branch review "With fixes" → one fix wave → re-review clean.
- The final review's Critical: tests compared against the live (empty) `spriteVariants.js`, so every real variant apply would fail its own `npm test` gate and roll back. Fixed by pointing those tests at fixtures/mocks; a scratch-copy simulation and then the live run both proved it.

## Edge cases
- Draw Things off → `--fake` stand-ins; apply refuses them without `--allow-fake`.
- Draw Things rejects img2img → falls back to txt2img and records the mode (stub-server test); live: this build supports img2img.
- Interrupted run → resumes, fills only missing indices; corrupt last json → regenerated.
- Candidate without a cut → raw tile shown with the row's mirror, no Flip control.
- Flip after a re-apply → anchored to the review-time mirror in `cut.json`, so re-applying does not flip art back.
- Unknown variant key / variant on a non-tower / `cell` override / batch ≠ file name / duplicate asset → job rejected with all errors at once.
- Apply failure or Ctrl-C → data files restored; references kept in `<cache>/sprites/backup/`.
- Base-tower re-pick that changes footprint → `tierLookPadFit` fails by design; README explains.
- `enemy_drone` → not reproducible, skipped by `--all`.

## Verification
- `npm test`: 3900 passed (234 files). `python3 -m unittest discover -s scripts/art -p 'test_*.py'`: 35 OK. `npm run build` OK; `npm run assets -- --strict` 72/72.
- Live, real Draw Things (FLUX schnell, port 7860, Chrome quit): smoke job 6/6 generated, exit 0. Review page on dark + light, 0 failed requests. Picks through the page's Download. Apply: 12 steps, assets 74/74, npm test 3900 green with the variant installed. Capture build map 0 `archer@0:4a,archer@1:3`: variant sheets 200, 0 errors; magenta-painted variant sheet in the probe dist → T4A archer 1873 magenta px, T3 archer drawn with normal art. All smoke art reverted afterwards.

## Found live
- Candidate #0 with an unchanged prompt is pixel-identical to the shipped art (deterministic FLUX + shared default seed) → backlog #70.
- img2img strength 0.45 barely changes the base → start 4.2 at 0.6–0.7.
- G1's FLUX anchor replacement was never in the 4.0 spec → first step of 4.2.

## Rulings (controller)
- runJob/buildReview exported as functions for the e2e seam.
- facing table derived from a full rebuild check (37/39 identical), not the notes' count.
- Drone left unreproducible and skipped by `--all`.
- `cell` overrides rejected until apply rewrites frameWidth/scale.
- Flip anchored to the review-time mirror; no Flip on uncut tiles.
- `tierLookPadFit` stays in the apply gate.
- strength defaults to 0.45 when `init` is set.
