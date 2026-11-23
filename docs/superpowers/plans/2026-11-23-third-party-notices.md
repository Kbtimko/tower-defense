# Third-party Notices (#81) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every production build ships a generated `THIRD_PARTY_NOTICES.txt` with the full licence text of everything bundled, and `package:itch` refuses a zip without it.

**Architecture:** A pure module resolves bundle module ids to npm package directories and formats the notices. A small Vite plugin (`apply: 'build'`) gathers the bundle's packages in `generateBundle`, reads each package's `package.json` and licence file, appends the hand-kept vendored entries, and emits the file. The packager checks that the file is present and complete.

**Tech Stack:** Node ESM, Vite 5 plugin API (Rollup hooks), Vitest + jsdom.

**Spec:** `docs/superpowers/specs/2026-11-23-third-party-notices-design.md`

## Global Constraints

- The output file is named exactly `THIRD_PARTY_NOTICES.txt` and sits at the build root, next to `index.html`.
- No new npm dependencies.
- The output is deterministic: sections are sorted by package name, with no timestamps.
- A bundled package with no `LICENSE`/`LICENCE`/`COPYING` file (any case, any extension) fails the build with an error naming it.
- The vendored entries live in `src/data/vendoredNotices.js`:
  - Earcut 2.2.4, ISC, `Copyright (c) 2016, Mapbox`, with the full ISC text as it appears in `node_modules/phaser/src/geom/polygon/Earcut.js`;
  - the Vite modulepreload polyfill, MIT, with the copyright line and MIT text from the top of `node_modules/vite/LICENSE.md` (the "Vite core license" part only).
- Pure logic gets Vitest tests and mutation checks: break the code, show the specific test fails, restore, and paste both outputs.
- Never pipe test or build output through `tail`/`head`. Stage explicit paths only.

## Review Focus

1. **A scoped package path** (`node_modules/@fontsource/orbitron/...`) must resolve to `@fontsource/orbitron`, not `@fontsource`. This is tested in Task 1.
2. **Nested `node_modules`** (`node_modules/a/node_modules/b/x.js`) resolve to the innermost package `b`. This is tested in Task 1.
3. **Ids Vite decorates** (a leading `\0`, a `?query` suffix such as `?commonjs-proxy`, or a Windows path) don't break resolution. Virtual ids with no `node_modules` segment are ignored. This is tested in Task 1.
4. **The font packages are included,** even though they enter the build through CSS. This is proven live in Task 2 by reading the built file.
5. **The capture build gets the file too.** Harmless, but it confirms `apply: 'build'` covers every mode. This is checked in Task 2.

---

### Task 1: Pure notices logic and the vendored data

**Files:**
- Create: `src/systems/thirdPartyNotices.js`, `src/systems/thirdPartyNotices.test.js`, `src/data/vendoredNotices.js`

**Interfaces:**
- Produces:
  - `packageDirOf(moduleId) -> string | null`. It strips a leading `\0` and any `?…` suffix, normalises `\` to `/`, and returns the path up to and including the **innermost** `node_modules/<name>` or `node_modules/@scope/<name>`. It returns `null` when there is no `node_modules` segment.
  - `formatNotices(entries) -> string`. Each entry is `{ name, version, license, text }`. The function sorts by `name`. Each section reads:
    ```
    ====
    <name> <version> (<license>)
    ====
    <text, trimmed>
    ```
    Sections are separated by one blank line. The output starts with a one-paragraph header naming the game and saying these components are bundled in it, and ends with a single newline.
  - `VENDORED_NOTICES`: an array of `{ name: 'Earcut (vendored in Phaser)', version: '2.2.4', license: 'ISC', text }` and `{ name: 'Vite modulepreload polyfill', version: null, license: 'MIT', text }` (the plugin fills the Vite version from the installed `vite` at build time), in `src/data/vendoredNotices.js`.

- [ ] **Step 1: Write the failing tests:**
  - `packageDirOf('/p/node_modules/phaser/dist/phaser.esm.js')` returns `'/p/node_modules/phaser'`.
  - `packageDirOf('/p/node_modules/@fontsource/orbitron/400.css')` returns `'/p/node_modules/@fontsource/orbitron'` (Review Focus 1).
  - `packageDirOf('/p/node_modules/a/node_modules/b/x.js')` returns `'/p/node_modules/a/node_modules/b'` (Review Focus 2).
  - `packageDirOf('\0/p/node_modules/eventemitter3/index.mjs?commonjs-proxy')` returns `'/p/node_modules/eventemitter3'`.
  - `packageDirOf('C:\\p\\node_modules\\phaser\\x.js')` returns `'C:/p/node_modules/phaser'`.
  - `packageDirOf('/p/src/main.js')` returns `null`, and so does `packageDirOf('\0vite/modulepreload-polyfill.js')` (Review Focus 3).
  - `formatNotices([{name:'zeta',version:'1.0.0',license:'MIT',text:'  Z text \n'}, {name:'alpha',version:'2.0.0',license:'ISC',text:'A text'}])`:
    - contains `alpha 2.0.0 (ISC)` before `zeta 1.0.0 (MIT)`;
    - contains `Z text` trimmed;
    - ends with exactly one `\n`;
    - is equal on two calls with the entries in reversed order (deterministic).
  - `VENDORED_NOTICES` has an Earcut entry whose text contains `ISC License` and `Copyright (c) 2016, Mapbox`, and a Vite entry whose text contains `MIT License`.
- [ ] **Step 2:** Run `npx vitest run src/systems/thirdPartyNotices.test.js`. Expected: FAIL (module not found).
- [ ] **Step 3:** Implement per Interfaces. Copy the Earcut ISC text verbatim from the header comment of `node_modules/phaser/src/geom/polygon/Earcut.js`, without the ` * ` prefixes. Copy the Vite MIT text from the "Vite core license" part at the top of `node_modules/vite/LICENSE.md`.
- [ ] **Step 4:** Run the same command. Expected: PASS.
- [ ] **Step 4b: Mutation check.** (a) Make `packageDirOf` use the first `node_modules` instead of the innermost, and confirm the nested test FAILS. (b) Drop the sort, and confirm the ordering test FAILS. Restore both and paste the outputs.
- [ ] **Step 5: Commit:** `git add src/systems/thirdPartyNotices.js src/systems/thirdPartyNotices.test.js src/data/vendoredNotices.js && git commit -m "feat(licences): pure third-party notice resolution and formatting"`

---

### Task 2: The Vite plugin, the packager check, and the ledger

**Files:**
- Create: `scripts/vitePluginNotices.mjs`
- Modify:
  - `vite.config.js`: add `plugins: [thirdPartyNotices()]`, keeping the existing `test` block;
  - `scripts/package-itch.mjs`: the notices check;
  - `src/systems/itchPackage.js` and its test, if the completeness check is pure (see Step 2);
  - `docs/licenses.md`.

**Interfaces:**
- Consumes: from Task 1, `packageDirOf`, `formatNotices` and `VENDORED_NOTICES`.
- Produces:
  - `thirdPartyNotices() -> VitePlugin`, the default export of `scripts/vitePluginNotices.mjs`. It sets `name: 'third-party-notices'` and `apply: 'build'`. In `generateBundle(_, bundle)` it:
    1. collects module ids from every chunk's `modules` keys, plus `this.getModuleIds()` for CSS-imported packages (filter to ids whose package actually contributed output; if unsure, include every resolved package from `getModuleIds()`, since a tree-shaken-away package being listed is harmless while a missing one is not);
    2. maps each id with `packageDirOf` and de-duplicates;
    3. reads each `package.json` (`name`, `version`, `license`) and the first file matching `/^(licen[cs]e|copying)(\..*)?$/i`, throwing `third-party-notices: <name> has no licence file` if there is none;
    4. appends `VENDORED_NOTICES`, filling the Vite entry's version from `node_modules/vite/package.json`;
    5. calls `this.emitFile({ type: 'asset', fileName: 'THIRD_PARTY_NOTICES.txt', source: formatNotices(entries) })`.
  - `missingNotices(noticesText, required) -> string[]`, pure, in `src/systems/itchPackage.js`. It returns the names in `required` that don't appear in a section header line of `noticesText`.

- [ ] **Step 1:** Write the plugin and register it.
  - Run `npx vite build --outDir release/try-notices --emptyOutDir`.
  - Read `release/try-notices/THIRD_PARTY_NOTICES.txt`. Confirm it has sections for `@fontsource/orbitron`, `@fontsource/rajdhani`, `eventemitter3`, `phaser`, Earcut and Vite, each with full licence text: the OFL text for the fonts, MIT for phaser and eventemitter3 (Review Focus 4).
  - Build twice and `cmp` the two files to confirm they are byte-identical.
  - Paste the section header lines in the report.
- [ ] **Step 2: Failing test first** for `missingNotices`, in `src/systems/itchPackage.test.js`:
  - a text with headers `phaser 3.90.0 (MIT)` and `eventemitter3 5.0.4 (MIT)`, checked against `['phaser','eventemitter3','@fontsource/orbitron']`, returns `['@fontsource/orbitron']`;
  - a name that appears only in a licence body, not in a header, still counts as missing.

  Then implement it and run a mutation check: match anywhere in the text, and confirm the body-only test FAILS.
- [ ] **Step 3:** In `package-itch.mjs`, after the limit check, read `release/itch/THIRD_PARTY_NOTICES.txt`. Required names are the keys of `package.json` `dependencies` plus `eventemitter3`, `Earcut` and `Vite`. If the file is missing, or `missingNotices` returns any names, print them and exit 1. Prove that path by temporarily removing the plugin from `vite.config.js`: run `npm run package:itch -- --no-verify`, expect exit 1 naming the notices file, then restore.
- [ ] **Step 4:** Run the happy path (check `uptime`, load < 6): `npm run package:itch` exits 0, verified on desktop and iphone, and `unzip -l` lists `THIRD_PARTY_NOTICES.txt` at the root. Also run `npx vite build --mode capture --outDir release/try-capture --emptyOutDir` and confirm the file is there too (Review Focus 5).
- [ ] **Step 5:** Update `docs/licenses.md`:
  - the intro and the Code and Fonts sections say every build ships a generated `THIRD_PARTY_NOTICES.txt`, generated by `scripts/vitePluginNotices.mjs` from the bundle, with Earcut and the Vite polyfill from `src/data/vendoredNotices.js`;
  - remove or close any "ships none" or "to do before release" line about notices in the checklist.

  Run `npx vitest run src/assets/licenseLedger.test.js` and expect it to PASS.
- [ ] **Step 6:** Run `npm test` and `npm run build`, both exit 0.
- [ ] **Step 7: Commit:** `git add scripts/vitePluginNotices.mjs vite.config.js scripts/package-itch.mjs src/systems/itchPackage.js src/systems/itchPackage.test.js docs/licenses.md && git commit -m "feat(licences): every build ships THIRD_PARTY_NOTICES.txt; package:itch requires it"`
