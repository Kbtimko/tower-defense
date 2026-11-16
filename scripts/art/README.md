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
4. `npm run art:apply -- ~/Downloads/picks.json` (the browser usually saves it
   there) installs the picks, rebuilds sheets, runs `npm run assets -- --strict`
   and `npm test`, and prints the files it changed. It NEVER commits.
5. `npm run build && npm run preview` and look at it in the running game (the
   dev server serves files the production build drops).
6. Commit what you keep, on a branch, with explicit `git add <paths>`.

## Flags

- `--fake` makes stand-ins with no Draw Things: hue-shifted copies of today's
  art with a FAKE band (a labelled grey card when there is no current art).
  Apply refuses them unless you pass `--allow-fake` (tests only; never ship them).
- `--dry-run` prints what would be generated (or, for apply, the step plan).
- `--reroll reroll.json` regenerates only the assets the page marked, as a new
  round of candidates (old ones are kept).
- `--cache <dir>` (or `ART_CACHE`) moves the cache; give it to `art`,
  `art:review` and `art:apply` alike.
- `--candidates N` overrides the job's candidate count; `--no-prepare` skips the
  Python cutout step.

- Jobs default to seed 88001, not the 77021 the shipped art used, so candidate #0
  is never today's art; put `"seed": 77021` in a job to reproduce it on purpose.

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
  When `npm test` is the failing check, apply names the failing test files.
- A failing `src/systems/tierLookPadFit.test.js` after a base-tower pick means the
  new art changed tower footprints (it pins the accepted overlap sets). Check the
  overlaps in the game, then update the pinned set in that test deliberately,
  then re-run apply.
- To undo a batch:
  - tracked files: `git restore public/assets/sprites public/assets/overworld public/assets/portraits assets-src/sprites src/data scripts/art/facing.json`;
  - new variant sheets are untracked: `git clean -n public/assets/sprites assets-src/sprites`,
    then `git clean -f <each path it printed>`;
  - a reference apply overwrote is in `<cache>/sprites/backup/<name>-<timestamp>.png`;
    copy it back to `<cache>/sprites/<name>.png`.
- Tests: `npm test` (the `--fake` end-to-end is `scripts/art/pipeline.e2e.test.js`)
  and `python3 -m unittest discover -s scripts/art -p 'test_*.py'`.
