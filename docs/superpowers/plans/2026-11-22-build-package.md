# Build and Package (roadmap 6.2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `npm run package:itch` produces a checked, subfolder-verified itch.io zip, and `npm run release:media` produces the page screenshots, cover and a 15 s clip.

**Architecture:**
- **Pure core.** The itch limit check, absolute-URL scan and zip naming are pure functions in `src/systems/itchPackage.js`. Their limits and the media shot list live in `src/data/release.js`.
- **Subfolder verification.** `scripts/staticServer.mjs` is an exact-case static server that never falls back to `index.html`. `capture.mjs --flow` learns to serve a given directory under a nested path, so the existing device-flow test (title → story → map 0 → build → send wave, real input) runs on the unpacked zip.
- **Media.** The media script reuses the capture harness's shot and video helpers, extracted into `scripts/captureCore.mjs`.

**Tech Stack:** Node ESM scripts, Vite 5 `build` API, Playwright (Chromium), `sharp`, system `zip`/`unzip`/`ffmpeg`, Vitest + jsdom.

**Spec:** `docs/superpowers/specs/2026-11-22-build-package-design.md`

> **As built (2026-11-23):** Task 4's shot policy changed during execution (Ruling F). It now uses a full board via `releaseBuild`, auto-send, a mid-road frame chosen between 8 s and 45 s of sim time, a 1134×900 crop centred on the action, and a GIF at 640 px / 8 fps. Task 1's `RELEASE_MEDIA` block and Task 4 Step 2 below show the original values; the spec's Decisions section is current.

## Global Constraints

- itch limits:
  - at most **1,000** files after extraction;
  - total extracted size at most **500 MB** (use 500 000 000 bytes) and any single file at most **200 MB** (200 000 000 bytes);
  - path length (including folders) at most **240** characters;
  - the zip must contain **`index.html`** at its root;
  - file names are case sensitive;
  - relative paths only.
- The zip is the **production** mode built with `base: './'`. Only the media come from the `capture` mode.
- Outputs go under `release/`, which is gitignored. Nothing generated is committed.
- No new npm dependencies. System tools `zip`, `unzip` and `ffmpeg` are checked at start. If one is missing, the script exits **2** with a message naming it.
- Exit codes for `package-itch.mjs`:
  - **0** — packaged and verified;
  - **1** — a limit check or the subfolder flow failed;
  - **2** — a required tool is missing.
- Tunables live in `src/data/release.js`. Pure logic gets Vitest tests. Every behaviour change needs a failing-first test and a mutation check: break the code, show the specific test fails, restore, and paste both outputs in the report.
- `npm run capture` and `npm run matrix` must behave exactly as before when the new flags are absent.
- Never pipe test or build output through `tail` or `head`. Stage explicit paths only.

## Review Focus

1. **macOS hides case bugs.** A URL `Assets/x.png` for the file `assets/x.png` loads locally and 404s on itch, which runs on Linux. The static server must match exact case per path segment. This is tested in Task 2.
2. **Fallback servers mask 404s.** Vite `preview` answers unknown paths with `index.html`, as a 200 SPA fallback. The verify server must return 404 for missing files and 403 for directory paths, as itch does. This is tested in Task 2.
3. **`zip` appends to an existing archive.** Re-packaging the same commit would keep stale files. The packager deletes any existing zip of that name first. This is tested in Task 3 by packaging twice and comparing listings.
4. **OS junk ships in the zip.** `public/` holds `.gitkeep` files, and a Mac adds `.DS_Store`. The packager removes those two names from the build. The checker reports any other file whose name starts with `.`. This is tested in Tasks 1 and 3.
5. **A dirty working tree gets a clean-looking name.** A zip built from uncommitted changes must say so: `-dirty` is appended to the name. This is tested in Task 1.

---

### Task 1: Release data and pure packaging logic

**Files:**
- Create: `src/data/release.js`, `src/systems/itchPackage.js`, `src/systems/itchPackage.test.js`

**Interfaces:**
- Produces:
  - `ITCH_LIMITS = { maxFiles: 1000, maxTotalBytes: 500_000_000, maxFileBytes: 200_000_000, maxPathLength: 240 }`.
  - `JUNK_FILES = ['.DS_Store', '.gitkeep']`.
  - `RELEASE_MEDIA`:
    ```js
    {
      device: 'desktop1080',
      shotMaps: [0, 3, 4, 6, 8, 9],
      warmupSimMs: 3000,
      cover: { map: 9, cropWidth: 1260, cropHeight: 1000, width: 630, height: 500 },
      clip: { map: 9, seconds: 15, gifWidth: 960, gifFps: 15, gifWarnBytes: 10_000_000 },
    }
    ```
    All of these are in `src/data/release.js`.
  - `checkItchLimits(files, limits = ITCH_LIMITS) -> string[]`. `files` is `[{ path: string, bytes: number }]`, with paths relative to the zip root and `/`-separated. The function returns readable problem strings; an empty array means it passed. It checks:
    - the file count;
    - the total bytes;
    - each file's bytes;
    - each path's length;
    - that `index.html` exists at the root (exact case);
    - that no path segment starts with `.`.
  - `findAbsoluteUrls(text) -> string[]`. Returns each root-absolute URL found in `src="/…"`, `href="/…"` and CSS `url(/…)` / `url("/…")` / `url('/…')`. It ignores protocol-relative `//…`, `https://…` and `data:`.
  - `zipName({ version, sha, dirty }) -> string`. Returns `last-light-<version>-<sha>.zip`, or `last-light-<version>-<sha>-dirty.zip` when `dirty` is true.
  All three functions are in `src/systems/itchPackage.js`.

- [ ] **Step 1: Write the failing tests** (`src/systems/itchPackage.test.js`).

```js
const ok = [{ path: 'index.html', bytes: 2_000 }, { path: 'assets/index-abc.js', bytes: 1_500_000 }];
it('a small build with index.html at the root passes', () => expect(checkItchLimits(ok)).toEqual([]));
it('missing root index.html fails, and case matters', () => {
  expect(checkItchLimits([{ path: 'game/index.html', bytes: 10 }]).join()).toMatch(/index\.html/);
  expect(checkItchLimits([{ path: 'Index.html', bytes: 10 }]).join()).toMatch(/index\.html/);
});
it('1,001 files fails; 1,000 passes', () => {
  const many = n => [{ path: 'index.html', bytes: 1 }, ...Array.from({ length: n - 1 }, (_, i) => ({ path: `a/${i}.png`, bytes: 1 }))];
  expect(checkItchLimits(many(1000))).toEqual([]);
  expect(checkItchLimits(many(1001)).join()).toMatch(/1001 files/);
});
it('size limits: one file over 200 MB, total over 500 MB', () => {
  expect(checkItchLimits([...ok, { path: 'big.bin', bytes: 200_000_001 }]).join()).toMatch(/big\.bin/);
  const total = [...ok, ...[1, 2, 3].map(i => ({ path: `p${i}.bin`, bytes: 170_000_000 }))];
  expect(checkItchLimits(total).join()).toMatch(/total/);
});
it('a 241-character path fails; 240 passes', () => {
  const p = n => 'x'.repeat(n - 4) + '.png';
  expect(checkItchLimits([...ok, { path: p(240), bytes: 1 }])).toEqual([]);
  expect(checkItchLimits([...ok, { path: p(241), bytes: 1 }]).join()).toMatch(/241/);
});
it('any dotfile segment fails (Review Focus 4)', () => {
  expect(checkItchLimits([...ok, { path: 'audio/sfx/.gitkeep', bytes: 0 }]).join()).toMatch(/\.gitkeep/);
  expect(checkItchLimits([...ok, { path: '.hidden/a.png', bytes: 1 }]).join()).toMatch(/\.hidden/);
});
it('finds root-absolute URLs only', () => {
  const html = '<script src="/assets/a.js"></script><link href="./assets/b.css"><a href="https://x.io/y">';
  expect(findAbsoluteUrls(html)).toEqual(['/assets/a.js']);
  expect(findAbsoluteUrls('a{background:url(/img/x.png)} b{background:url("./y.png")} c{background:url(\'/z.webp\')} d{src:url(//cdn/f.woff2)} e{x:url(data:image/png;base64,AA)}'))
    .toEqual(['/img/x.png', '/z.webp']);
});
it('zip name carries version, sha and dirty (Review Focus 5)', () => {
  expect(zipName({ version: '0.1.0', sha: '18455fc', dirty: false })).toBe('last-light-0.1.0-18455fc.zip');
  expect(zipName({ version: '0.1.0', sha: '18455fc', dirty: true })).toBe('last-light-0.1.0-18455fc-dirty.zip');
});
```

- [ ] **Step 2:** Run `npx vitest run src/systems/itchPackage.test.js`. Expected: FAIL (module not found).
- [ ] **Step 3:** Implement per Interfaces. The problem strings name the offending path or the count, for example `1001 files (limit 1000)`, `big.bin is 200000001 bytes (limit 200000000)`, `total 510003500 bytes (limit 500000000)`, `path of 241 characters (limit 240): xxx…`, `dotfile in zip: audio/sfx/.gitkeep` and `no index.html at the zip root`.
- [ ] **Step 4:** Run the same command. Expected: PASS.
- [ ] **Step 4b: Mutation check.** (a) Change the path-length comparison from `>` to `>=` and confirm the 240/241 test FAILS. (b) Drop the dotfile check and confirm its test FAILS. Restore both, and paste the outputs in the report.
- [ ] **Step 5: Commit:** `git add src/data/release.js src/systems/itchPackage.js src/systems/itchPackage.test.js && git commit -m "feat(release): itch limits, absolute-URL scan and zip naming"`

---

### Task 2: Exact-case static server, and the device flow served from a subfolder

**Files:**
- Create: `scripts/staticServer.mjs`, `scripts/staticServer.test.js` (Vitest's default include already runs `scripts/**/*.test.js`, as `scripts/art/*.test.js` shows).
- Modify: `scripts/capture.mjs` (argument parsing near lines 180–205, `main()` near 2505, and the header usage comment).

**Interfaces:**
- Produces:
  - `startStaticServer({ root, mountPath = '/', port = 0 }) -> Promise<{ url: string, port: number, close: () => Promise<void> }>` in `scripts/staticServer.mjs`.
    - It serves files under `root` at `mountPath`. `url` is `http://localhost:<port><mountPath>`, without a trailing slash unless `mountPath` is `/`.
    - A request for `mountPath` or `mountPath + '/'` serves `root/index.html`.
    - Any other path that names a directory returns **403**.
    - A missing file returns **404**, and so does a path outside `mountPath` or one that escapes `root` with `..`.
    - Case is matched **exactly**, per segment, by checking each segment against `fs.readdirSync` of its parent (Review Focus 1).
    - Content types are set for `.html .js .css .json .png .webp .jpg .svg .ogg .mp3 .woff .woff2 .wasm`, with `application/octet-stream` for anything else.
    - There is never an `index.html` fallback (Review Focus 2).
  - `capture.mjs --flow` gains two flags:
    - `--serve <dir>`: skip building, and serve `<dir>` with `startStaticServer` instead of Vite `preview`.
    - `--base-path <path>`: the mount path, default `/`.
    With `--serve`, `base` becomes the server's `url`, so the flow's `page.goto(base + '/')` lands on `<mountPath>/`. Without these flags nothing changes.

- [ ] **Step 1: Write the failing tests** (`staticServer.test.js`). Build a temp root with `index.html`, `assets/A.png` and `assets/sub/x.js`, and start the server with `mountPath: '/html/12345'`. Use Node `fetch`. Assert:
  - `GET /html/12345/` returns 200 and `index.html`'s body;
  - `GET /html/12345/assets/A.png` returns 200 with `content-type` `image/png`;
  - `GET /html/12345/assets/a.png` returns **404**: wrong case, even on a case-insensitive disk;
  - `GET /html/12345/Assets/A.png` returns **404**;
  - `GET /html/12345/assets/` returns **403**;
  - `GET /html/12345/nope.js` returns **404**, not index.html;
  - `GET /index.html` returns **404**: outside the mount;
  - `GET /html/12345/../secret` returns **404**.

  Close the server in `afterAll`.
- [ ] **Step 2:** Run the test file. Expected: FAIL (module not found).
- [ ] **Step 3:** Implement `startStaticServer` with `node:http`, and add `--serve` and `--base-path` to `capture.mjs`. `--serve` implies no build. `--base-path` without `--serve` is an error. Update the usage comment.
- [ ] **Step 4:** Run the test file. Expected: PASS.
- [ ] **Step 4b: Mutation check.**
  1. Replace the exact-case lookup with `fs.existsSync` and confirm the two case tests FAIL.
  2. Add an `index.html` fallback for missing files and confirm the `nope.js` test FAILS.

  Restore both and paste the outputs.
- [ ] **Step 5: Live proof** (check `uptime` first; run at load < 6).
  1. `npm run matrix -- --devices desktop` → PASS, unchanged.
  2. `npx vite build --base=./ --outDir release/try/html/12345 --emptyOutDir`, then `node scripts/capture.mjs --flow --devices desktop,iphone --serve release/try/html/12345 --base-path /html/12345` → PASS on both devices.
  3. The proof that the check can fail: `npx vite build --outDir release/try-abs --emptyOutDir` (the default base `/`), then the same flow with `--serve release/try-abs --base-path /html/12345` → **FAIL** at boot with resource 404s.

  Paste all three summaries. Add `release/` to `.gitignore` in this task.
- [ ] **Step 6: Commit:** `git add scripts/staticServer.mjs scripts/staticServer.test.js scripts/capture.mjs .gitignore && git commit -m "feat(release): exact-case static server; device flow can run from a subfolder"`

---

### Task 3: `npm run package:itch`

**Files:**
- Create: `scripts/package-itch.mjs`
- Modify: `package.json` (add a `"package:itch": "node scripts/package-itch.mjs"` script)

**Interfaces:**
- Consumes:
  - from Task 1: `ITCH_LIMITS`, `JUNK_FILES`, `checkItchLimits`, `findAbsoluteUrls`, `zipName`;
  - from Task 2: `capture.mjs --flow --serve <dir> --base-path <path>`.
- Produces: `release/<zipName>`, plus `release/itch/` (the build) and `release/verify/html/12345/` (the unpacked zip). Flags:
  - `--no-verify`: skip the flow;
  - `--devices <list>`: flow devices, default `desktop,iphone`.

- [ ] **Step 1:** Write `scripts/package-itch.mjs`, in this order:
  1. Check that `zip` and `unzip` are on PATH with a small `findOnPath(name)` that scans `process.env.PATH` entries for an executable file (no `which`, so the check works with a stripped PATH); exit 2 naming the missing one. `ffmpeg` is not needed for packaging.
  2. Vite `build({ base: './', logLevel: 'warn', build: { outDir: 'release/itch', emptyOutDir: true } })`, production mode.
  3. Delete every file named in `JUNK_FILES` under `release/itch/`.
  4. Walk `release/itch/` into `[{ path, bytes }]` and run `checkItchLimits`. Also run `findAbsoluteUrls` over `index.html` and every emitted `.css`, adding a problem string for each hit. On any problem, print them all and exit 1.
  5. Name the zip with `zipName`. The version comes from `package.json`, the sha from `git rev-parse --short HEAD`, and `dirty` is true when `git status --porcelain` is non-empty. Delete any existing `release/<name>` (Review Focus 3), then run `zip -r -X -q ../<name> .` with `cwd: release/itch`.
  6. Unless `--no-verify`, clear `release/verify/`, run `unzip -q release/<name> -d release/verify/html/12345`, then `spawnSync('node', ['scripts/capture.mjs', '--flow', '--devices', devices, '--serve', 'release/verify/html/12345', '--base-path', '/html/12345'], { stdio: 'inherit' })`. A non-zero status exits 1.
  7. Print the zip path, its file count and size in MB, and `verified on <devices>` or `NOT verified (--no-verify)`.
- [ ] **Step 2: Prove each failure path:**
  1. Temporarily add an empty `public/.probe` file and run `npm run package:itch -- --no-verify`; expect exit **1** naming `.probe`. Remove the file.
  2. Temporarily set `ITCH_LIMITS.maxFiles` to 100 and run it; expect exit **1** with a file-count problem. Restore.
  3. Run `PATH=/nonexistent "$(command -v node)" scripts/package-itch.mjs --no-verify`; expect exit **2** naming `zip`.

  Paste the outputs.
- [ ] **Step 3: Happy path (load < 6):**
  - Run `npm run package:itch`; expect exit 0, `verified on desktop,iphone`, and roughly 300 files and 30+ MB.
  - Run it again unchanged. `unzip -Z1 release/<name> | sort` must be identical across the two runs, with no `.gitkeep` and no `.DS_Store` (Review Focus 3, 4).
  - Confirm the name ends in `-dirty.zip` while this task's change is uncommitted, and in plain `.zip` after the commit; run it once more after committing.
- [ ] **Step 4: Commit:** `git add scripts/package-itch.mjs package.json && git commit -m "feat(release): npm run package:itch builds, checks, zips and verifies from a subfolder"`

---

### Task 4: `npm run release:media`

**Files:**
- Create: `scripts/captureCore.mjs`, `scripts/release-media.mjs`
- Modify: `scripts/capture.mjs`. Move `captureUrl`, `watchProblems`, `shootBusiestFrame` and `MIN_ENEMIES` (plus `contextOptions` if it is plain data) into `captureCore.mjs` and import them back, with no behaviour change. Also modify `package.json` (add `"release:media": "node scripts/release-media.mjs"`).

**Interfaces:**
- Consumes: from Task 1, `RELEASE_MEDIA`; from `scripts/captureDevices.mjs`, `DEVICES`; from `src/data/waves.js`, `MAP_WAVES`.
- Produces:
  - `captureCore.mjs` exports `captureUrl(mapId, opts)`. It is the same function, except that `opts.autosend === true` also sets `autosend=1`.
  - It also exports `watchProblems`, `shootBusiestFrame`, `MIN_ENEMIES` and `contextOptions`.
  - `release-media.mjs` writes to `release/media/`:
    - `shot-map<N>.png` for each of `RELEASE_MEDIA.shotMaps`;
    - `cover.png` at 630×500;
    - `clip.mp4` and `clip.gif`;
    - `media.json` listing each file, its size, and the enemies and simMs at each shot.
  - It exits 1 on any page error or on fewer than 3 enemies in a shot, and 2 when `ffmpeg` is missing.

- [ ] **Step 1: Extract `captureCore.mjs`.** Prove nothing changed:
  - run `npm run capture -- --maps 0 --devices desktop`, and expect the same output line format and a `report.json` with no problems;
  - run `npm run matrix -- --devices desktop` → PASS.

  Commit: `refactor(capture): shared captureCore for the release media script`.
- [ ] **Step 2: Write `release-media.mjs`:**
  - Build the capture mode into `.art-cache/capture-dist`, exactly as `capture.mjs` does, and serve it with Vite `preview` on port 4192.
  - Launch Chromium with `--use-angle=metal --enable-gpu --ignore-gpu-blocklist`, so the clip is recorded at full frame rate on the real GPU.
  - **Shots:** for each map in `shotMaps`, open `captureUrl(map, { wave: MAP_WAVES[map].length })` on `RELEASE_MEDIA.device`, and call `shootBusiestFrame(page, warmupSimMs, file)`.
  - **Cover:** use `sharp` on `shot-map<cover.map>.png`. Extract a centred `cropWidth × cropHeight` region, resize it to `width × height`, and write `cover.png`.
  - **Clip:**
    - Open a fresh context with `recordVideo: { dir, size: viewport }` on `captureUrl(clip.map, { wave: last, autosend: true })`.
    - Record the wall-clock offset since the context opened at the moment `simMs >= warmupSimMs`. Wait `clip.seconds` more, then close the context.
    - Run `ffmpeg -ss <offset> -t <seconds> -i <webm> -c:v libx264 -pix_fmt yuv420p -movflags +faststart clip.mp4`.
    - Make the GIF in two passes: `palettegen`, then `paletteuse`, with `fps=<gifFps>,scale=<gifWidth>:-1:flags=lanczos`.
    - Warn if `clip.gif` is over `gifWarnBytes`.
- [ ] **Step 3: Run it** (`npm run release:media`, load < 6). Expect:
  - exit 0, 6 shots and `cover.png` at 630×500 (check with `sharp(...).metadata()`);
  - `clip.mp4` at 15 ± 0.5 s (check with `ffprobe -v error -show_entries format=duration`);
  - `clip.gif` written.

  **Look at the output yourself:** Read `cover.png`, two shots, and a frame from the middle of the clip (`ffmpeg -ss 7 -i clip.mp4 -frames:v 1 mid.png`). Report what you see: towers firing, several enemies, no HUD clipped by the cover crop, and no debug overlay.
- [ ] **Step 4: Commit:** `git add scripts/release-media.mjs package.json && git commit -m "feat(release): npm run release:media shoots page screenshots, cover and a 15 s clip"`
