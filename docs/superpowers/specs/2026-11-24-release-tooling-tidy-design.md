# Backlog #86: release tooling tidy-ups

**Date:** 2026-11-24 · **Branch:** `chore/86-release-tooling` off `origin/visual/integration` (aea7d9e)
**Tag:** `[auto]`. The spec and plan are self-approved under the global `[auto]` rule; there is no scope change.
**Raised by:** the 6.2 final review (2026-11-23).

## Intent

`npm run package:itch` produces the zip the user uploads to itch, and `npm run release:media` produces the page media. The 6.2 review left seven small defects in these tools. None is breaking a release today, but each either ships a slightly wrong artifact, hides a mistake the operator made, or leaks a resource on failure. Fix all seven, each with a test that fails first.

## Goals

1. **The zip has no directory entries.** `zip` is run with `-D`. Today every folder (`assets/`, `audio/` and others) appears as its own entry. itch tolerates that, but those entries are noise in the archive and carry timestamps.
2. **`package-itch.mjs --devices` with no value is an error.** Today it falls back silently to `desktop,iphone`. It should exit 1 with a message. A value that starts with `--` counts as missing.
3. **`capture.mjs` rejects a flag where a value belongs.** `--serve` and `--base-path` currently take the next argument even if it is another flag: `--flow --serve --no-build` serves a directory named `--no-build`. A missing value or a value starting with `--` must throw `<flag> needs a value`.
4. **`shootBestFrame`'s deadline message reports the latest sim time.** Today it reports the best frame's `simMs` ("stopped at … ms of best frame"), which hides how far the sim actually got.
5. **`recordClip` closes its browser context when the crowd-wait deadline throws.** Today the throw skips `context.close()`, so the context and its video recording leak.
6. **`findAbsoluteUrls` catches unquoted and uppercase attributes.** `SRC="/x"`, `src=/x` and `HREF=/x` must be found. Protocol-relative (`//cdn`), scheme URLs and relative paths still must not be.
7. **A failed `zip` removes any partial zip.** The `zip failed` branch exits without deleting `release/<name>.zip`. It must delete it, the same as a failed verification does. This keeps the rule that a plainly named zip in `release/` is always a verified one.

## Non-goals

- The other perf-gate items in #85.
- Restructuring `capture.mjs` or `release-media.mjs` beyond what a fix needs to be testable.
- Changing what the zip contains, or any game code.

## Approach

One approach fits: small, targeted fixes, each with a test.
- Logic that `package-itch.mjs` runs inline moves into small pure functions in `src/systems/itchPackage.js` so Vitest can reach it: the zip arguments, the argument parsing, and the zip-and-clean-up step with injected `spawn` and `rm`.
- `release-media.mjs` runs `main()` on import. To test `recordClip`, guard `main()` so it runs only when the file is the entry point, and export `recordClip`.
- The `capture.mjs` argument fix is tested by running the script as a subprocess, because its `parseArgs` is private and `main()` runs on import.

**Rejected:** moving `parseArgs` out of `capture.mjs` into its own module. It would be cleaner, but it is a refactor of a 2,500-line working file for a one-line fix.

## Constraints

- Every fix gets a failing test first, plus a mutation check: revert the fix and the specific test fails.
- No test may delete or write files under `release/` in the real checkout. The user's zip lives there.
- Plain ES modules and Vitest, matching the existing `itchPackage.test.js` and `scripts/staticServer.test.js`.

## Verification

- `npx vitest run`, exit 0.
- `npm run package:itch` on this branch, exit 0. `unzip -l` on the result lists no entry ending in `/`.
- `node scripts/capture.mjs --flow --serve --no-build` exits 1 with `--serve needs a value`, before any build or browser.
- `npm run package:itch -- --devices` exits 1 with a message.
