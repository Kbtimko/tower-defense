# Art pipeline v2: generate, review, pick, apply

Job-driven. A job file (`scripts/art/jobs/<batch>.json`) lists assets; each gets N
candidate images you review in a browser, then apply. Prompts come from the
`PROMPTS.md` files; tunables live in the job, not in code.

## The batch loop (6 commands)

1. `npm run art -- --job <batch>` generates candidates into the cache
   (`.art-cache/candidates/<batch>/<asset>/<i>.png`) and then makes cutouts and
   game-size previews. Resumable: re-running only fills what is missing.
2. `npm run art:review -- <batch>` writes the review page and prints its
   `file://` URL.
3. Open the page, pick one candidate per asset (flip if the facing is wrong, or
   "None - reroll"), then Download `picks.json`.
4. `npm run art:apply -- picks.json` installs the picks, rebuilds sheets, runs
   `npm run assets` and `npm test`. It NEVER commits.
5. `npm run build && npm run preview` and look at it in the running game (the
   dev server serves files the production build drops).
6. Commit what you keep, on a branch, with explicit `git add <paths>`.

## Flags

- `--fake` makes labelled grey cards with no Draw Things. Apply refuses them
  unless you pass `--allow-fake` (tests only; never ship them).
- `--dry-run` prints what would be generated (or, for apply, the step plan).
- `--reroll reroll.json` regenerates only the assets the page marked, as a new
  round of candidates (old ones are kept).
- `--cache <dir>` (or `ART_CACHE`) moves the cache; give it to `art`,
  `art:review` and `art:apply` alike.
- `--candidates N` overrides the job's candidate count; `--no-prepare` skips the
  Python cutout step.

## Draw Things setup

Draw Things -> Settings -> API Server -> protocol **HTTP** (not gRPC), then
load **FLUX.1 [schnell]**. Port 7860 is discovered automatically; override with
`--port`. A job asset with `"init": "base"` is generated img2img from the base
reference (`strength` defaults to 0.45); if the server rejects img2img the run
falls back to txt2img and records the mode in each candidate's json.

**Quit Chrome before generating.** On the 24 GB Mac, Chrome plus FLUX has
wedged Draw Things twice.

## Things that bite

- `scripts/art/facing.json` records which way each entity's art faces; apply
  updates it when you flip a pick. Edit it only through apply or by hand with
  care; the page's flip is relative to the preview mirror.
- `enemy_drone` is in `NOT_REPRODUCIBLE` (`scripts/build-sprite-sheets.py`): its
  shipped sheets match no facing/debris combination, so `--all` skips it and
  only an explicit pick rebuilds it.
- Apply restores `src/data/sprites.js`, `spriteVariants.js` and `facing.json` if
  any step fails; copied references and built sheets are left for inspection.
- To undo a test batch: `git checkout -- public/ assets-src/ src/data/ scripts/art/facing.json`.
- Tests: `npm test` (the `--fake` end-to-end is `scripts/art/pipeline.e2e.test.js`)
  and `python3 -m unittest discover -s scripts/art -p 'test_*.py'`.
