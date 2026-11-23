# Backlog #81: ship third-party notices in the build

**Date:** 2026-11-23 · **Branch:** `release/81-third-party-notices` off `origin/visual/integration` (2bb4296)
**Backlog text:** "The build bundles Phaser (MIT), eventemitter3 (MIT), vendored Earcut (ISC), Vite's modulepreload polyfill (MIT) and the Orbitron/Rajdhani fonts (OFL-1.1), but ships none of their licence texts. Generate a notices file from the production bundle … and include the OFL texts from `node_modules/@fontsource/*/LICENSE`. Needed before any commercial release; see `docs/licenses.md`."
**Approval:** the item is tagged `[auto]`, so the controller approves this spec under the user's standing rule (global CLAUDE.md).

## Intent

The MIT and ISC licences require their copyright and permission notice to travel with every copy, and the OFL requires its licence text to ship with the fonts. The itch zip (roadmap 6.2) and the Vercel build carry none of these today. Every build should include an accurate notices file without hand upkeep, and the packager should refuse a zip without one.

## Goals

1. **`THIRD_PARTY_NOTICES.txt` at the build root.** A Vite build plugin writes it for every production build (Vercel, `package:itch`, and the capture build).
   - It is generated from the bundle itself: every npm package with at least one module in the output contributes a section. Each section gives the name, version and licence (from its `package.json`) and the full text of its `LICENSE`/`LICENCE`/`COPYING` file.
   - Code that is not an npm package gets a hand-kept entry in `src/data/vendoredNotices.js`, with its full licence text:
     - Earcut 2.2.4, ISC, © 2016 Mapbox, vendored in Phaser;
     - Vite's modulepreload polyfill, MIT, © VoidZero Inc. and Vite contributors.
   - The output is sorted by package name and deterministic, so the same bundle gives a byte-identical file.
   - If a bundled package has no licence file, the build fails with a message naming the package. It does not silently emit an incomplete notice.
2. **The packager checks it.** `npm run package:itch` exits 1 unless `THIRD_PARTY_NOTICES.txt` exists at the zip root and names every key of `package.json` `dependencies`, plus `eventemitter3`, Earcut and Vite.
3. **The ledger is updated.** `docs/licenses.md` says where the notices ship and how they are generated, and drops the "ships none" gap.

## Non-goals

- An in-game credits screen or link. The file in the distribution meets the licences. A credits screen is a separate, optional idea.
- Notices for dev-only tools (Vitest, Playwright, sharp), which don't ship.
- Art and audio provenance, which `docs/licenses.md` and `public/audio/ATTRIBUTIONS.md` (shipped) already cover.

## Anti-goals

- **A hand-maintained notices file that drifts from the bundle.** The package list must come from the build.
- **A notice missing licence text,** such as just a name and an SPDX id.

## Constraints

- No new npm dependencies (a licence plugin package is not needed for this little logic).
- Pure logic, meaning module-id → package resolution and formatting, lives in `src/systems/thirdPartyNotices.js` with Vitest tests and mutation checks. The plugin glue lives in `scripts/vitePluginNotices.mjs` and is registered in `vite.config.js` with `apply: 'build'`.
- Vendored texts are data in `src/data/vendoredNotices.js`.

## Approaches

- **Picked: a small in-repo Vite plugin** that reads the bundle's module ids in `generateBundle`. It is exact, needs no dependency, and runs on every build path.
- *A licence plugin package (`rollup-plugin-license`).* Rejected: a new dependency for about 60 lines of logic.
- *A post-build script over `package.json` dependencies.* Rejected: it lists what is declared, not what ships. It would miss eventemitter3 and include anything tree-shaken away.

## Left to the builder

- The exact section layout of the text file. It must stay plain text and readable.
- How the plugin reads module ids, for example `this.getModuleIds()` filtered to those in the output chunks, or each chunk's `modules` plus the CSS-imported font packages. Whichever choice is made must include the `@fontsource` packages, whose CSS is imported.
