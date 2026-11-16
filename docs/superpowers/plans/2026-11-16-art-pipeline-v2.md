# Art Pipeline v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A job-driven art loop (generate N candidates → review page → `picks.json` → one-command install, including tower tier variants) that runs end to end with Draw Things off.

**Architecture:** Pure decision logic in `src/assets/*.js` (Vitest), thin Node CLIs in `scripts/art/`, image work in Python (`build-sprite-sheets.py`, `normalize.py`, new `prepare_review.py`). `npm run art` without `--job` is unchanged. Variants reach the game through a generated `src/data/spriteVariants.js` merged into `SPRITE_MANIFEST`.

**Tech Stack:** Node 20 ES modules, Vitest 2 + jsdom (`// @vitest-environment node` for file/sharp tests), `sharp` (dev dep, already installed), Python 3 + pillow/numpy/scipy/rembg (installed; `isnet-general-use.onnx` cached), stdlib `unittest` for Python tests (no pytest).

**Spec:** `docs/superpowers/specs/2026-11-16-art-pipeline-v2-design.md` — read it before any task.

## Global Constraints

- No new dependencies (npm or pip).
- `PROMPTS.md` is the only home of prompt text; job files never contain prompts.
- Variant keys allowed: `t2`, `t3`, `t4a`, `t4b`; variants only for category `tower`.
- `assetId` forms: sprite `<category>_<type>` or `<category>_<type>.<variant>`; overworld = PNG stem (e.g. `overworld_0_outpost_sigma`); portrait = key (e.g. `portrait-rael`).
- Cache root: `--cache <dir>` / env `ART_CACHE`, default `<repo>/.art-cache`. Candidates under `<cache>/candidates/<batch>/<assetId>/`; references under `<cache>/sprites/`; review page at `<cache>/review/<batch>/index.html`.
- Candidate files: `<i>.png` (raw 1024²), `<i>.json` (`{ index, round, seed, mode, prompt, createdAt }`, mode ∈ `txt2img|img2img|fake`), `<i>.cut.png` and `<i>.preview.png` (sprites only, written by `prepare_review.py`).
- Seed of candidate k (0-based within round r): `seed + r * 1000 + k`. `candidates` must be 1–16.
- FLUX settings unchanged: 1024×1024, 4 steps, CFG 0, `Euler a`, one request at a time.
- Apply never commits, refuses `mode: fake` picks unless `--allow-fake`, backs up any reference it overwrites to `<cache>/sprites/backup/<name>-<timestamp>.png`.
- Shipped art must not change: the rebuild check in Task 5 must show every existing sheet pixel-identical.
- Comments explain why, not what; match surrounding style.

## Review Focus

1. **The legacy `npm run art -- --kind sprite` path meets a variant bullet** → it must skip it; otherwise `tower_archer.t4a`'s prompt overwrites `.art-cache/sprites/tower_archer.png`, the only copy of the base reference. Test in Task 1.
2. **A run is interrupted mid-batch, then re-run** → it resumes at the next missing index of the current round with the same seeds, never regenerating or renumbering existing candidates. Test in Task 3.
3. **`picks.json` from an older review of the same batch** (an index that no longer exists, or an asset removed from the job) → apply refuses before touching any file. Test in Task 10.
4. **Apply fails halfway (a Python step exits non-zero)** → it stops, prints which step failed, restores `src/data/sprites.js` and `src/data/spriteVariants.js` to their contents before the run (so the game never declares a variant whose sheets are missing), and leaves image outputs in place for inspection. Test in Task 10.
5. **`SPRITE_VARIANTS` is empty (today)** → `SPRITE_MANIFEST` and `requiredAssets()` are exactly what they were before this branch; `npm run assets -- --strict` still exits 0 with 72/72. Test in Task 8.

---

### Task 1: Variant bullets in `PROMPTS.md`

**Files:**
- Modify: `src/assets/promptParser.js` (`parseSpritePrompts`)
- Modify: `scripts/generate-art.mjs` (sprite job loop)
- Test: `src/assets/promptParser.test.js`

**Interfaces:**
- Produces: `parseSpritePrompts(md) -> Array<{ category, type, variant?: string, subject }>`. A bullet `- **archer.t4a** — …` yields `{ category: 'tower', type: 'archer', variant: 't4a', subject }`. The parser accepts any `[a-z0-9]+` suffix; validating the key is Task 2's job.

- [ ] **Step 1: Write failing tests** in `promptParser.test.js`, inside a new `describe('parseSpritePrompts variants')`:
  - `it('parses a variant bullet with the runtime type and the variant key')`: md with a `### (c) Towers` section and `- **archer.t4a** — \`#8B4513\` brown: \`tall dark-iron crossbow emplacement with glowing runes\`` → `expect(out).toEqual([{ category: 'tower', type: 'archer', variant: 't4a', subject: 'tall dark-iron crossbow emplacement with glowing runes' }])`.
  - `it('lets a fenced variant prompt beat an inline span')`: bullet `- **archer.t4b** — output \`assets/sprites/towers/\`` followed by an indented fenced block `rapid repeating crossbow turret` → subject is the fenced text.
  - `it('maps a soldier variant to category soldier, type default')`: under the heroes heading, `- **soldier.t4a** — \`armoured rifle soldier in gold plate\`` → `{ category: 'soldier', type: 'default', variant: 't4a', … }`.
  - `it('leaves base bullets without a variant field')`: every entry from the real `spriteMd` has `variant === undefined` (today's file has no variant bullets).
- [ ] **Step 2: Run** `npx vitest run src/assets/promptParser.test.js` → the three variant tests FAIL (no match / no field); the base test passes.
- [ ] **Step 3: Implement** — extend the bullet regex to `/^-\s+\*\*([a-z0-9_]+)(?:\.([a-z0-9]+))?\*\*\s*[—-]\s*(.*)$/i`; set `variant` only when captured (omit the key otherwise, so `toEqual` on base entries is unchanged). The soldier/sentry mapping applies unchanged.
- [ ] **Step 4: In `scripts/generate-art.mjs`**, the sprite loop becomes `for (const p of parseSpritePrompts(spriteMd).filter(p => !p.variant))`, with a one-line why-comment (a variant would otherwise write over the base reference). The script has no test seam; Review Focus 1 is checked by Task 11 Step 3's `--dry-run --kind sprite` count.
- [ ] **Step 5: Run** `npx vitest run src/assets/promptParser.test.js` → all PASS. Run `npm run art -- --dry-run --kind sprite` → still lists exactly 18 sprite prompts.
- [ ] **Step 6: Commit** `feat(art): parse tier-variant bullets in sprite PROMPTS.md`

### Task 2: Job files (`src/assets/artJob.js`)

**Files:**
- Create: `src/assets/artJob.js`, `src/assets/artJob.test.js`

**Interfaces:**
- Consumes: Task 1's `parseSpritePrompts`; existing `parseOverworldPrompts`, `parsePortraitPrompts`, `parseStyleAnchor`, `parseFencedSection`, `buildPrompt`.
- Produces:
  - `export const VARIANT_KEYS = ['t2', 't3', 't4a', 't4b']`
  - `export function promptSources({ spriteMd, overworldMd, portraitMd }) -> { sprite: { style, entries }, overworld: { style, entries }, portrait: { style, entries } }` (style via `parseFencedSection(spriteMd, 'Shared style anchor')` / `parseStyleAnchor`, as `generate-art.mjs` does today).
  - `export function resolveJob(job, sources, { facing }) -> { job: ResolvedJob | null, errors: string[] }` where `facing` is `{ [name]: boolean }` (Task 5's `facing.json` contents; `true` = mirror) and
    `ResolvedJob = { batch, candidates, seed, assets: ResolvedAsset[] }`,
    `ResolvedAsset = { assetId, kind, prompt, category?, type?, variant?, entity?, id?, mirror?, cell?, keepDebris?, init?, strength? }`.
  - Defaults: `candidates` 8, `seed` 77021, sprite `mirror` = `facing[assetId] ?? facing[entity] ?? true` (a variant falls back to its base's facing), `keepDebris` false.

- [ ] **Step 1: Write failing tests** (`artJob.test.js`, built against small inline md strings plus one test against the real PROMPTS files):
  - `resolves a base sprite, a variant, an overworld node and a portrait` — job with `tower_cannon`, `tower_archer` variant `t4a`, `overworld_0_outpost_sigma`, `portrait-rael` → assetIds `['tower_cannon', 'tower_archer.t4a', 'overworld_0_outpost_sigma', 'portrait-rael']`, each `prompt` equal to `buildPrompt(style, subject)` for its entry, `errors` empty.
  - `takes mirror from the facing table, a variant inheriting its base` — facing `{ tower_archer: false }` → archer t4a `mirror === false`; cannon (absent) `mirror === true`; explicit `"mirror": true` in the job wins.
  - `rejects` (one `it` per case, asserting an error string containing the quoted fragment and `job === null`): unknown kind `'kind "icon"'`; sprite with no prompt `'no PROMPTS.md entry for tower_laser'`; variant with no variant prompt `'no PROMPTS.md entry for tower_cannon.t4a'`; unknown variant `'variant "t5"'`; variant on `hero_rael` `'variants are towers-only'`; duplicate assetId `'duplicate tower_cannon'`; `candidates` 0 and 17 `'candidates must be 1-16'`; `strength` 1.5 `'strength must be 0-1'`; `init` on a base sprite `'init needs a variant'`; `cell` on a variant `'a variant uses its base cell'` (variants always share the base cell, so the base `scale` keeps the footprint and the spec's "scale only when the cell differs" case cannot arise); empty `assets` `'no assets'`.
  - `collects every error, not just the first` — a job with two problems returns both.
- [ ] **Step 2: Run** `npx vitest run src/assets/artJob.test.js` → FAIL (module missing).
- [ ] **Step 3: Implement** `promptSources` and `resolveJob` as specified. Entity `tower_archer` splits on the first `_` into category/type; `soldier_default`/`sentry_default` work as-is.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(art): resolve and validate art job files`

### Task 3: Candidate bookkeeping (`src/assets/candidates.js`)

**Files:**
- Create: `src/assets/candidates.js`, `src/assets/candidates.test.js`

**Interfaces:**
- Produces:
  - `export function cacheRoot(repoRoot, { cache, env }) -> string` — `cache ?? env.ART_CACHE ?? join(repoRoot, '.art-cache')`, resolved absolute.
  - `export function candidateDir(cache, batch, assetId) -> string`
  - `export function readExisting(fileNames: string[], metas: Record<number, {round}>) -> Array<{ index, round, hasCut, hasPreview }>` — from a directory listing (`3.png`, `3.json`, `3.cut.png`, `3.preview.png`); an index counts only when both `<i>.png` and `<i>.json` exist.
  - `export function planCandidates({ existing, candidates, seed, reroll }) -> Array<{ index, round, seed }>` — round = max existing round (0 if none), or that +1 when `reroll` (0 if none); generate `candidates - countInRound` more; indices continue after the max existing index; seed `seed + round*1000 + k`, k counting from the number already in that round.

- [ ] **Step 1: Write failing tests:**
  - `plans a fresh asset` → `planCandidates({ existing: [], candidates: 3, seed: 100, reroll: false })` equals `[{index:0,round:0,seed:100},{index:1,round:0,seed:101},{index:2,round:0,seed:102}]`.
  - `resumes an interrupted round with the same seeds` → existing indices 0,1 (round 0), candidates 3 → `[{index:2,round:0,seed:102}]`.
  - `a complete round plans nothing` → existing 0,1,2 → `[]`.
  - `a reroll starts the next round after the last index` → existing 0–2 round 0, reroll → `[{index:3,round:1,seed:1100},{index:4,round:1,seed:1101},{index:5,round:1,seed:1102}]`.
  - `readExisting ignores a png without its json` (an interrupted write) and reports `hasCut`/`hasPreview`.
  - `cacheRoot prefers --cache, then ART_CACHE, then the repo default`.
- [ ] **Step 2: Run** `npx vitest run src/assets/candidates.test.js` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(art): candidate seeds, resume and reroll rounds`

### Task 4: Generation (`npm run art -- --job`)

**Files:**
- Create: `src/assets/drawThingsRequest.js`, `src/assets/drawThingsRequest.test.js`
- Create: `scripts/art/drawThings.mjs` (port discovery, help text, `post(port, endpoint, body)`), moved out of `scripts/generate-art.mjs`
- Create: `scripts/art/fakeCandidate.mjs`, `scripts/art/fakeCandidate.test.js` (`// @vitest-environment node`)
- Create: `scripts/art/runJob.mjs` (the `--job` path)
- Modify: `scripts/generate-art.mjs` (import from `drawThings.mjs`; if `--job` is present, delegate to `runJob.mjs` and exit; legacy behaviour otherwise byte-for-byte the same output)
- Create: `scripts/art/jobs/smoke.json`

**Interfaces:**
- Consumes: Task 2 `resolveJob`/`promptSources`, Task 3 `cacheRoot`/`candidateDir`/`readExisting`/`planCandidates`, Task 5's `scripts/art/facing.json` (read as JSON; until Task 5 lands, a missing file means `{}`).
- Produces:
  - `export const FLUX = { steps: 4, cfg_scale: 0, sampler_name: 'Euler a', width: 1024, height: 1024 }` (moved from `generate-art.mjs`).
  - `export function txt2imgBody({ prompt, seed }) -> object` (today's body shape, `negative_prompt: ''`, `batch_size: 1`).
  - `export function img2imgBody({ prompt, seed, initB64, strength }) -> object` = txt2img body + `init_images: [initB64]`, `denoising_strength: strength`.
  - `export function initImageSource(cache, asset) -> { ref: string, fallback: string }` — `ref` = `<cache>/sprites/<entity>.png`; `fallback` = `assets-src/sprites/<dir>/<type>_idle.png` (`_move` for enemies; dirs as `build-sprite-sheets.py` `OUT_DIRS`).
  - `export async function makeFakeCandidate({ outPath, index, label, basePng }) -> void` — 1024² PNG via `sharp`: `basePng` (today's art, first frame) scaled up and hue-rotated by `index * 45`°, or a flat grey card when `basePng` is null; always a diagonal red band with the text `FAKE` and `label`.
  - CLI: `npm run art -- --job <batch> [--candidates N] [--fake] [--reroll picks.json] [--cache dir] [--port N] [--dry-run]`. (Task 7 adds the post-generation `prepare_review.py` call and `--no-prepare`.)

- [ ] **Step 1: Write failing tests** for `drawThingsRequest.js`: `txt2imgBody` equals today's request body for a given prompt/seed (copy the literal from `generate-art.mjs`); `img2imgBody` adds exactly `init_images` and `denoising_strength`; `initImageSource` returns the ref and `assets-src/sprites/towers/archer_idle.png` for `tower_archer.t4a`, `assets-src/sprites/enemies/drone_move.png` for an enemy entity.
- [ ] **Step 2: Write failing test** `fakeCandidate.test.js`: writes to a temp dir; the result is a 1024×1024 PNG (`sharp(path).metadata()`); two indices from the same base differ in pixel bytes; `basePng: null` still works.
- [ ] **Step 3: Run** both → FAIL.
- [ ] **Step 4: Before touching `generate-art.mjs`**, save `npm run art -- --dry-run` output to `<scratchpad>/dryrun-before.txt`. Then implement the two pure/helper modules, then `drawThings.mjs` (move, don't change, discovery + help text), then `runJob.mjs`:
  - Read the job file `scripts/art/jobs/<batch>.json`, resolve it; print errors and exit 1 if any.
  - For each asset: list its candidate dir, `readExisting`, `planCandidates` (with `reroll` = asset is in the picks file's `reroll` array when `--reroll` is given; assets not listed there are skipped in a reroll run).
  - Write each candidate as `<i>.png` then `<i>.json` (json last, so an interrupted write is not counted).
  - img2img: read `initImageSource` (ref, else fallback upscaled to 1024 with `sharp`, else log a per-asset error and continue with the next asset). If the img2img POST is not ok, log once per asset `img2img unsupported (HTTP n), falling back to txt2img`, use `txt2imgBody` with the job seed for the rest of that asset, record `mode: 'txt2img'`.
  - `--fake` never probes the server. `--dry-run` prints the plan (assetId, round, indices, seeds, mode) and writes nothing.
  - No server and not `--fake`/`--dry-run`: print today's help text, exit 1, write nothing.
- [ ] **Step 5: Create** `scripts/art/jobs/smoke.json`: batch `smoke`, candidates 3, assets `tower_cannon` and `{ kind: 'sprite', entity: 'tower_archer', variant: 't4a', init: 'base', strength: 0.45 }`. (Its archer prompt arrives in Task 11; until then `--dry-run` reports that one missing-prompt error, which is expected.)
- [ ] **Step 6: Run** the new tests → PASS; full `npx vitest run src/assets scripts` → PASS; `npm run art -- --dry-run > <scratchpad>/dryrun-after.txt` and `diff` against `dryrun-before.txt` → no differences.
- [ ] **Step 7: Commit** `feat(art): job-driven candidate generation with img2img fallback and --fake`

### Task 5: Sheet builder: facing table, variants, cache and output roots

**Files:**
- Create: `scripts/art/facing.json`
- Modify: `scripts/build-sprite-sheets.py`
- Create: `scripts/art/test_build_sheets.py` (stdlib `unittest`; import the hyphenated module with `importlib.util.spec_from_file_location`)

**Interfaces:**
- Produces:
  - `facing.json`: `{ "default": true, "tower_archer": false, "tower_mage": false, "tower_ice": false, "tower_sniper": false, "tower_barracks": false, "hero_rael": false, "hero_engineer": false, "hero_scout": false, "soldier_default": false, "sentry_default": false }` (enemies, `tower_cannon`, `hero_pyro` mirror via `default`). Keys may also be `<entity>.<variant>`.
  - `parse_name(name) -> (category, etype, variant | None)`: `tower_archer.t4a` → `('tower', 'archer', 't4a')`.
  - `mirror_for(name, facing) -> bool`: exact key, else base entity key, else `default`.
  - Outputs for a variant: `<OUT_DIRS[category]>/<type>_<variant>_<state>.png`, states/cell from the base entity (`STATE_OVERRIDES`, `CELL_OVERRIDES`).
  - New flags: `--ref-dir DIR` (default `.art-cache/sprites`), `--out-root DIR` (default `assets-src/sprites`), `--mirror` / `--no-mirror` override the table, otherwise `facing.json` decides.

- [ ] **Step 1: Write failing tests** `test_build_sheets.py`: `parse_name` for base, variant and `soldier_default`; `mirror_for` for `tower_archer` (False), `tower_archer.t4a` (False, inherited), `tower_cannon` (True), `enemy_drone` (True), and an exact variant key overriding its base.
- [ ] **Step 2: Run** `python3 -m unittest scripts/art/test_build_sheets.py -v` → FAIL.
- [ ] **Step 3: Implement**; `--all` globs both `*_*.png` and `*_*.*.png` in the ref dir.
- [ ] **Step 4: Run** the unit tests → PASS.
- [ ] **Step 5: Rebuild check (no shipped file changes).** Copy the primary checkout's references: `mkdir -p .art-cache/sprites && cp /Users/keithtimko/projects/tower-defense/.art-cache/sprites/*.png .art-cache/sprites/`. Run `python3 scripts/build-sprite-sheets.py --all --out-root <scratch>/rebuild`, then compare every output with `assets-src/sprites/` pixel-for-pixel (a short PIL script: `ImageChops.difference(...).getbbox() is None`). Expected: 36/36 identical. Any mismatch → fix `facing.json` for that entity (try the other facing) and re-run; if neither facing matches, report it in the task summary and leave it (do not touch `assets-src/`). `git status` must show no change under `assets-src/` or `public/`.
- [ ] **Step 6: Commit** `feat(art): facing table and tier-variant sheets in build-sprite-sheets`

### Task 6: Normalize: variants with the base's tone, ground as JSON

**Files:**
- Modify: `scripts/art/normalize.py`
- Create: `scripts/art/test_normalize.py`

**Interfaces:**
- Consumes: `SPRITE_MANIFEST` entries now may carry `variants` (Task 8; `load_manifest()` already serialises the manifest via node, so variants come through once Task 8 lands — the tests here use a synthetic manifest).
- Produces:
  - `normalize_entry(entry, *, only_variants=None, src_root, out_root) -> list[dict]` — normalises the base states and each variant; a variant's tone params are the base entry's (from the base's first state; computed even when only a variant is requested). Returns `[{ "key": "tower/archer" | "tower/archer.t4a", "ground": { "footY": float, "width": float } }]`.
  - CLI: `--only` accepts `tower/archer` (base only) and `tower/archer.t4a` (that variant only); `--ground-json PATH` writes the returned list as JSON; `--src-root`/`--out-root` default to `assets-src` / `public`.
  - `preview_frame(cut_rgba, entry, *, tone_params=None) -> PIL.Image` — used by Task 7: builds the first frame the way the real sheet would (fit into the entity's cell via `build-sprite-sheets._fit` logic) and applies cleanup, tone (given params, else the frame's own), rim light and outline at the entry's `scale`.

- [ ] **Step 1: Write failing tests** (synthetic 64px sheets written to a temp dir): a variant whose pixels are twice as bright as its base gets the SAME `gamma/gain/sat` as the base (assert by patching `tone_params` to record calls: called once, with the base's first frame); `--only tower/archer.t4a` writes only the variant files; `--ground-json` output has one record per normalised key; `preview_frame` returns an RGBA image of the entity's cell size with a navy outline pixel present.
- [ ] **Step 2: Run** `python3 -m unittest scripts/art/test_normalize.py -v` → FAIL.
- [ ] **Step 3: Implement** by extracting the per-entry body of `main()` into `normalize_entry`; keep the contact sheet and printed table.
- [ ] **Step 4: Run** → PASS. Then `python3 scripts/art/normalize.py --out-root <scratch>/norm` and compare every file with `public/assets/sprites/` pixel-for-pixel → all identical; `git status` clean under `public/`.
- [ ] **Step 5: Commit** `feat(art): normalize tier variants with the base entity's tone`

### Task 7: Review images (`scripts/art/prepare_review.py`)

**Files:**
- Create: `scripts/art/prepare_review.py`, `scripts/art/test_prepare_review.py`
- Modify: `scripts/art/runJob.mjs` (after generation, run `python3 scripts/art/prepare_review.py --cache <cache> --batch <batch>`; skipped with `--no-prepare`; a non-zero exit is reported but does not delete candidates)

**Interfaces:**
- Consumes: `build-sprite-sheets.cutout`, `mirror_for` (Task 5); `normalize.preview_frame`, `tone_params` (Task 6); manifest via `normalize.load_manifest()`.
- Produces: `python3 scripts/art/prepare_review.py --cache DIR --batch NAME [--job PATH]`. For each sprite asset's candidates lacking them: `<i>.cut.png` (cutout, mirrored per `mirror_for`, cropped) and `<i>.preview.png` (`preview_frame`, base tone params for a variant, its own for a base entity). Idempotent; skips files that exist; continues past one bad candidate and exits 1 at the end if any failed.

- [ ] **Step 1: Write failing test**: with `cutout` patched to return a fixed RGBA image (rembg is slow), a temp cache with two raw candidates → both `.cut.png` and `.preview.png` exist; preview size equals the entity's cell; a second run does not call `cutout` again; a corrupt `1.png` leaves `0.*` written and exit status 1.
- [ ] **Step 2: Run** `python3 -m unittest scripts/art/test_prepare_review.py -v` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS. Real smoke: copy one reference into a temp cache as `candidates/t/tower_cannon/0.png` + a json, run the script unpatched, open both outputs (Read tool) and confirm the cannon is cut out, faces right and has the navy outline.
- [ ] **Step 5: Commit** `feat(art): cutout and game-size previews for review`

### Task 8: Variants reach the game data

**Files:**
- Create: `src/data/spriteVariants.js` (generated header + `export const SPRITE_VARIANTS = {};`)
- Modify: `src/data/sprites.js` (merge after the array), `src/assets/assetManifest.js`
- Test: `src/data/sprites.test.js` (extend), `src/assets/assetManifest.test.js` (create)

**Interfaces:**
- Produces: `SPRITE_VARIANTS` shape `{ 'tower/archer': { t4a: { ground?, scale?, anchor?, states: { idle: {path, frameWidth, frameHeight, frames, frameRate?}, … } } } }`. `sprites.js` merges each into the matching entry's `variants` (existing keys kept). `requiredAssets()` adds, per declared variant state, `{ kind: 'sprite', id: '<cat>/<type> <state> <variant>', path, url, required: true, key: variantTextureKey(...), frames, expected }`.

- [ ] **Step 1: Write failing tests:** a pure `mergeVariants(manifest, variants)` (exported from `sprites.js`) returns entries with `variants` added and leaves the input unmodified; with `{}` the result deep-equals the input; `requiredAssets()` lists a declared variant's files as `required: true` (call an exported `spriteAssets(manifest)` helper with a synthetic manifest); contract test: every key in the real `SPRITE_VARIANTS` names an existing manifest entry and a key in `VARIANT_KEYS`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** `mergeVariants`, export `SPRITE_MANIFEST` as the merged result, and `spriteAssets` in `assetManifest.js`.
- [ ] **Step 4: Run** full `npm test` → PASS; `npm run assets -- --strict` → exit 0, `72/72` (Review Focus 5); `npm run build` → exit 0.
- [ ] **Step 5: Commit** `feat(sprites): generated tier-variant manifest, required in the asset check`

### Task 9: Review page

**Files:**
- Create: `src/assets/reviewPage.js`, `src/assets/reviewPage.test.js`
- Create: `scripts/art/review.mjs`; modify `package.json` (`"art:review": "node scripts/art/review.mjs"`)

**Interfaces:**
- Consumes: Task 2 `ResolvedJob`, Task 3 `readExisting`, `getSpriteConfig`.
- Produces: `export function renderReviewPage({ job, rows, padUrl }) -> string`, where `rows = [{ assetId, kind, label, mode, current: { url, frameWidth, frameHeight } | null, display: { width, height }, candidates: [{ index, rawUrl, cutUrl?, previewUrl?, warning? }] }]` and all URLs are relative to the page. CLI `npm run art:review -- <batch> [--cache dir]` builds rows from disk, writes `<cache>/review/<batch>/pad.jpg` (a 240×160 crop of `public/assets/backgrounds/map_0_outpost_sigma.webp` via `sharp`), writes `index.html`, prints its `file://` URL.

Layout C (reference: option C in `.superpowers/brainstorm/*/content/review-layout.html`): header bar with batch name, `n / m picked`, Dark/Light toggle, **Download picks.json**; one row per asset with label + mode, today's art (first frame via CSS background), then candidate tiles (number, large image = `cutUrl ?? rawUrl`, a game-size strip = `previewUrl` drawn at `display` CSS px on the pad image, a **Flip** toggle that mirrors both images with `transform: scaleX(-1)`), and a **None — reroll** toggle per row. Overworld/portrait rows: no strip, image shown at `display` size. Inline `<script>` keeps state `{ picks, flip, reroll }`, persists it in `localStorage` under `art-review:<batch>` (try/catch), and downloads `{ batch, picks, flip, reroll }`. Picking a tile clears that row's reroll and vice versa.

`display` for sprites = `{ width: cell * scale, height: cell * scale }` from the manifest entry (variant: base entry).

- [ ] **Step 1: Write failing tests** (parse the returned HTML with jsdom `DOMParser`): one `.row` per asset with `data-asset`; tile count per row; a missing cut shows `rawUrl` with a visible warning; an asset with zero candidates says `no candidates yet`; no `current` → `none yet`; game-size `<img>` width equals `display.width`; overworld rows have no strip. Then execute the page's script in jsdom: clicking tile 2 then clicking Download produces JSON `{ batch, picks: { <id>: 2 }, flip: [], reroll: [] }` (stub `URL.createObjectURL` and capture the Blob); toggling reroll removes the pick; state survives re-rendering with the same `localStorage`; a throwing `localStorage` still lets picking work.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Real look:** `npm run art -- --job smoke --fake` (after Task 11 the archer variant resolves; before it, use a temporary local job with `tower_cannon` + `tower_mage` and delete it), then `npm run art:review -- smoke`, open the page with the repo's playwright (headless screenshot of dark and light modes into the scratchpad) and view the screenshots: rows, game-size strip on the pad, flip and pick states visible.
- [ ] **Step 6: Commit** `feat(art): candidate review page (layout C)`

### Task 10: Picks and apply

**Files:**
- Create: `src/assets/picks.js`, `src/assets/picks.test.js`
- Create: `src/assets/applyPlan.js`, `src/assets/applyPlan.test.js`
- Create: `scripts/art/apply.mjs`, `scripts/art/applyExec.mjs`, `scripts/art/applyExec.test.js` (`// @vitest-environment node`); modify `package.json` (`"art:apply": "node scripts/art/apply.mjs"`)

**Interfaces:**
- Consumes: Tasks 2, 3, 5 (`facing.json`), 6 (`--ground-json`), 8 (`SPRITE_VARIANTS` shape, `spriteVariants.js` path).
- Produces:
  - `validatePicks(picks, job, existingByAsset) -> string[]` — errors for: batch mismatch; unknown assetId; index with no candidate; asset both picked and rerolled; `flip` on a non-sprite or unpicked asset.
  - `planApply({ picks, job, metas, cache, manifest, timestamp }) -> Step[]`, `Step` one of `{ op: 'backup', from, to }`, `{ op: 'copy', from, to }`, `{ op: 'resize', from, to, width, height }`, `{ op: 'run', cmd: string[] }`, `{ op: 'writeVariant', key, variant, def }`, `{ op: 'setGround', target: 'sprites' | 'variants', key, variant?, fromJson }`, `{ op: 'setFacing', name, mirror }`, `{ op: 'check', cmd }`. Refuses (throws) when any picked candidate has `mode: 'fake'` unless `allowFake`.
    - base sprite: backup (if ref exists) → copy raw → setFacing (only if flipped) → run build `[python3, scripts/build-sprite-sheets.py, <entity>, --ref-dir, …]` → run normalize `--only cat/type --ground-json <tmp>` → setGround(sprites).
    - variant: backup (if exists) → copy raw to `<entity>.<variant>.png` → setFacing (if flipped) → writeVariant (states = base states with path `assets/sprites/<dir>/<type>_<variant>_<state>.png`) → run build → run normalize `--only cat/type.variant --ground-json <tmp>` → setGround(variants).
    - overworld/portrait: resize raw → `public/<asset path>` at `requiredAssets()` `expected` size.
    - finally `check` `npm run assets -- --strict` and `npm test`.
  - `setGroundLine(spritesJsText, category, type, ground) -> string` — rewrites only that entry's `ground: { footY: N, width: N }` line; throws `ground line for <cat>/<type> found <n> times` unless exactly one.
  - `renderSpriteVariants(obj) -> string` — the generated module text (fixed header comment, keys sorted, `JSON.stringify(…, null, 2)`); round-trips.
  - `scripts/art/applyExec.mjs`: `export async function executeSteps(steps, { repoRoot, spritesPath, variantsPath, facingPath, run }) -> { ok: boolean, failedStep?: Step, log: string[] }` — `run(cmd) -> Promise<{ code, output }>` is injectable (tests stub it); snapshots `spritesPath` and `variantsPath` first and restores both if any step fails.
  - CLI `npm run art:apply -- <picks.json> [--cache dir] [--allow-fake] [--dry-run]` loads metas, validates, plans, calls `executeSteps` with a real `run`, prints each step; `--dry-run` prints the plan only.

- [ ] **Step 1: Write failing tests** for every `validatePicks` error; `planApply` step lists for a base pick, a variant pick, a flipped variant, an overworld pick and an empty picks file (`[]` plus a "nothing to apply" message from the CLI layer); fake refusal and `allowFake`; a variant pick whose base entity has no manifest entry throws `no manifest entry for tower/laser`; idempotence: planning the same picks twice gives equal step lists apart from backup timestamps, and `executeSteps` run twice on the same `writeVariant` leaves `spriteVariants.js` byte-identical to after the first run; `setGroundLine` on the real `src/data/sprites.js` text for `tower/archer` changes exactly one line, throws for an unknown entity; `renderSpriteVariants` output imports back (write to temp, dynamic `import()`) to the same object; Review Focus 3: a `picks.json` whose index was removed → errors and no steps; Review Focus 4: `executeSteps` with a stub `run` that fails on the normalize step → `ok: false`, `failedStep` is the normalize step, no `setGround` ran, and the temp `spritesPath`/`variantsPath` files are byte-identical to before the call (the `writeVariant` that preceded the build was rolled back).
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(art): validate picks and apply them per asset kind`

### Task 11: End to end with `--fake`, smoke prompt, docs

**Files:**
- Create: `scripts/art/pipeline.e2e.test.js` (`// @vitest-environment node`)
- Modify: `public/assets/sprites/PROMPTS.md` (tower section: one `archer.t4a` bullet, first draft; a short "Tier variants" how-to under "How to add art"), `scripts/art/README.md` (create: the batch loop in 6 commands, the Draw Things setup lines, the Chrome/memory warning)

**Interfaces:**
- Consumes: everything above.

- [ ] **Step 1: Write the e2e test**: temp cache + temp copies of `src/data/sprites.js`, `src/data/spriteVariants.js` and `scripts/art/facing.json`, passed to `executeSteps` as `spritesPath`/`variantsPath`/`facingPath` with a stub `run`; run `runJob` for `smoke` with `--fake --no-prepare`; build the review page; synthesize picks `{ tower_cannon: 1, 'tower_archer.t4a': 0 }`; plan without `allowFake` → throws; plan with `allowFake` → executor (Python `run` stubbed to write the files build/normalize would) updates the temp `spriteVariants.js` with `tower/archer.t4a` and its ground. Assert nothing under the real `public/`, `assets-src/` or `src/data/` changed (`git status --porcelain` on those paths is empty).
- [ ] **Step 2: Add** the `archer.t4a` prompt bullet: `- **archer.t4a** — \`#8B4513\` brown: \`automated heavy crossbow ballista turret emplacement, tall upright swivel mount, dark weathered iron with glowing amber runes along the bow arms, twin reinforced bowstrings, high contrast against pale ground, compact dark base disc\``, marked in prose as a first draft for roadmap 4.2.
- [ ] **Step 3: Run** the e2e test → PASS; `npm run art -- --job smoke --dry-run` → both assets resolve, 3 candidates each, archer mode img2img; `npm run art -- --dry-run --kind sprite` still lists exactly 18 (Review Focus 1).
- [ ] **Step 4: Run** full `npm test` and `npm run build` → exit 0; `python3 -m unittest discover -s scripts/art -p 'test_*.py'` → OK.
- [ ] **Step 5: Commit** `test(art): end-to-end fake batch; docs and the smoke prompt`

## Not a subagent task: live verification (lead session, with the user)

After the final review: the user switches Draw Things' API Server to HTTP and quits Chrome. Then, in this worktree with the copied references: `npm run art -- --job smoke` (real generation, records img2img support), `npm run art:review -- smoke` and look at the page on both backgrounds, pick, `npm run art:apply -- picks.json`, `npm run build && npm run preview`, place an archer, upgrade it to 4A and see the variant render; then `git checkout -- public/ assets-src/ src/data/ scripts/art/facing.json` so no test art ships.
