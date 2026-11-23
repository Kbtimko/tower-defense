# Roadmap 6.2: build and package for itch.io

**Date:** 2026-11-22 · **Branch:** `release/6.2-build-package` off `origin/visual/integration` (b88712a)
**Roadmap text:** "`vite build --base=./`, `scripts/package-itch.mjs` → zip; auto-generated screenshots + a 15 s gameplay clip from the capture harness."
**Approved:** the user approved this design on 2026-11-22 ("yes it does - move forward").

## Intent

Phase 6 puts v1 on itch.io. 6.4 (publish, gate G5) needs two things ready to upload: a zip that runs as an itch HTML5 game, and the page media (screenshots, a cover, a short clip). Both should come from one command each, so they can be rebuilt for every release without hand work.

## What recon found (2026-11-22)

- Every runtime asset path is already relative (`assets/...`, `audio/...`, `particles/...`; fonts are bundled through `@fontsource`). A trial `vite build --base=./` emits only `./assets/...` references in `index.html`.
- itch's HTML5 rules (itch.io/docs/creators/html5):
  - at most 1,000 files after extraction and 500 MB in total;
  - no single file over 200 MB;
  - no path longer than 240 characters;
  - the zip must contain `index.html`, and file names are case sensitive;
  - relative paths only, because the game is hosted in a subdirectory.

  The trial build is 308 files, 33 MB, longest path 54 characters.
- itch cannot host a video file. A trailer is a YouTube or Vimeo link, so the clip is useful as a GIF in the screenshot gallery and as an MP4 the user can upload elsewhere. The usual cover size is 630×500.
- `scripts/capture.mjs` already builds the capture mode, plays a map at a chosen wave with a tower build, shoots the busiest frame (`shootBusiestFrame`) and records an MP4 with `--video` (Playwright webm, then ffmpeg). `desktop1080` (1920×1080, 1x) is already a capture device.

## Goals

1. **`npm run package:itch`** (`scripts/package-itch.mjs`):
   - builds the production mode with `--base=./` into `release/itch/`;
   - checks the result against itch's limits and exits 1 if any is broken. The checks are: file count, total size, largest file, longest path, `index.html` at the zip root, and no absolute `/` URLs in `index.html` or the emitted CSS;
   - zips it to `release/last-light-<package.json version>-<short sha>.zip`, with `index.html` at the zip root;
   - prints the zip path, file count and size.
2. **Subfolder check.** Unpack the zip into a nested path (for example `/html/12345/`), serve it with a static server, and load the game in Chromium:
   - reach the title screen and start map 0 with real input;
   - fail on any 404 or page error.

   It runs as part of `package:itch` unless `--no-verify` is passed.
3. **`npm run release:media`** (`scripts/release-media.mjs`), built on the capture harness. It writes to `release/media/`:
   - **Screenshots:** about 6 shots on `desktop1080` of busy late waves on maps chosen to show different themes;
   - **Cover:** a 630×500 cover cropped from one of the shots;
   - **Clip:** a 15 s gameplay clip as `clip.mp4` and `clip.gif`.
4. **Ignored outputs.** `release/` is gitignored; none of these outputs are committed.

## Non-goals

- The itch page itself, embed size, fullscreen and mobile settings, and picking the final images. Those belong to 6.4 (G5).
- The README gallery (6.3).
- Any change to game code. If the subfolder check finds a broken path, fixing it is in scope; otherwise the game is untouched.
- A build version label inside the game.

## Anti-goals

- **A zip that only works at the site root.** The subfolder check exists to catch this, and it must be shown to fail against a build with an absolute path.
- **Hand-picked or hand-edited media.** Every image and the clip come from the scripts, so a later release can regenerate them.
- **Debug hooks in the shipped zip.** The zip is the production mode; only the media come from the capture mode.

## Constraints

- No new runtime dependencies. Allowed dev tooling: what is already installed (Vite, Playwright, `sharp`), the system `zip` and `ffmpeg` (both on this Mac; the scripts check for them and exit 2 with a clear message if missing).
- Limits and the media shot list live in `src/data/` (for example `src/data/release.js`); pure logic (the limit check, the zip name) gets Vitest tests.
- Respect the shared-host rules from 6.1: the browser steps are timing-insensitive (no fps budget), so no load gate is needed, but waits use game time as `capture.mjs` does.

## Decisions (controller's calls, within the approved design)

- **Shot list:** maps 0, 3, 4, 6, 8, 9 at each map's last wave with `defaultCaptureBuild`. These six cover outpost, station, asteroid, corridor, homeworld and the finale. **Cover:** a centred 630×500 crop from the map 9 shot, downscaled from a 1260×1000 crop of the 1920×1080 frame.
- **Clip:** map 9, last wave, `desktop1080`, 15 s, with `autosend=1` so enemies keep coming.
  - `clip.mp4`: H.264, yuv420p, faststart.
  - `clip.gif`: 960 px wide, 15 fps, palette-optimised with ffmpeg. The target is under 10 MB; the script warns when it is over.
- **Sharing with `capture.mjs`:** reuse it by extracting the pieces needed (the build-and-serve helper, `shootBusiestFrame`, the video path) into an importable module rather than shelling out to the CLI. Keep `npm run capture` and `npm run matrix` behaviour unchanged.
- **Zip tool:** the system `zip -r -X` run from inside `release/itch/`, so `index.html` sits at the root and no `__MACOSX` or extra attributes are added.
- **The version** comes from `package.json` (0.1.0 today). Bumping it is 6.4's call.

## Left to the builder

- The static server for the subfolder check (Vite `preview` with `base`, or a tiny `node:http` server).
- How the GIF palette pass is staged.
- Exact file names under `release/media/`.
