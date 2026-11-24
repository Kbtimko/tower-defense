# Release Tooling Tidy-ups (#86) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the seven release-tooling defects from backlog #86, each with a test that fails first.

**Architecture:** `package-itch.mjs`'s inline logic moves into pure, injectable functions in `src/systems/itchPackage.js`. The capture and media scripts get targeted fixes: `release-media.mjs` gains an entry-point guard so `recordClip` can be imported.

**Tech Stack:** Node ES modules, Vitest, Info-ZIP `zip`.

**Spec:** `docs/superpowers/specs/2026-11-24-release-tooling-tidy-design.md`

## Global Constraints

- Every fix ships with a test written first and seen failing. After it passes, revert the fix, confirm that specific test fails, then restore. Paste both outputs in the report.
- No test may create, change or delete anything under the repo's `release/` folder. Use temp dirs (`mkdtempSync(join(tmpdir(), …))`) or injected fakes.
- No change to game code (`src/scenes`, `src/entities`, `src/data` other than what a task names).
- Match the existing style: plain ES modules and the existing test files' conventions. Comments explain why, not what.
- Stage explicit paths only.

## Review Focus

1. **A partial zip surviving a failed `zip`.** After any non-zero `zip` exit, `release/<name>.zip` must not exist. Task 1 tests this with an injected spawn that writes the file and fails.
2. **Arguments that look like flags taken as values.** `--devices --no-verify` must be an error, not a device list named `--no-verify` (Task 1). `--serve --no-build` must be an error (Task 2).
3. **URL-finder over-matching.** The broader regex must still ignore `//cdn…`, `https:` and `./rel`, including in their uppercase and unquoted forms (Task 1).
4. **A test that can't fail.** Each deadline test must actually reach the deadline branch. Control `Date.now` rather than waiting 30+ s of real time (Task 2).
5. **The entry-point guard.** After Task 2, `npm run release:media` must still run `main()`. Verify by running `node scripts/release-media.mjs` with `ffmpeg` absent from `PATH`, so it reaches `requireTool` and exits 2 rather than doing nothing.

---

### Task 1: package-itch (spec goals 1, 2, 6, 7)

**Files:**
- Modify: `src/systems/itchPackage.js`, `src/systems/itchPackage.test.js`, `scripts/package-itch.mjs`

**Interfaces (produces):**
- `zipArgs(name: string): string[]` returns `['-r', '-X', '-D', '-q', path.join('..', name), '.']`, the exact argument list for `zip`, run from the build folder.
- `parsePackageArgs(argv: string[]): { verify: boolean, devices: string }` defaults `devices` to `'desktop,iphone'`. It throws `Error('--devices needs a value')` when `--devices` is last or followed by an argument starting with `--`.
- `zipBundle({ spawn, rm, cwd, name, zipPath }): boolean` runs `spawn('zip', zipArgs(name), { cwd, stdio: 'inherit' })`. On a non-zero `status`, or when `spawn` returns an `error`, it calls `rm(zipPath, { force: true })` and returns `false`. On success it returns `true`.
- `findAbsoluteUrls` is extended: `src`/`href` match case-insensitively, with or without quotes, and optional whitespace around `=`.

**Steps:**
- [ ] **Step 1: Failing tests** in `src/systems/itchPackage.test.js`:
  - `zipArgs('z.zip')` contains `'-D'` and ends with `['../z.zip', '.']`. Compare with `path.join('..', 'z.zip')`.
  - `parsePackageArgs([])` returns `{ verify: true, devices: 'desktop,iphone' }`.
  - `parsePackageArgs(['--no-verify', '--devices', 'iphone'])` returns `{ verify: false, devices: 'iphone' }`.
  - `parsePackageArgs(['--devices'])` and `parsePackageArgs(['--devices', '--no-verify'])` both throw `/--devices needs a value/`.
  - `zipBundle` with a fake `spawn` returning `{ status: 12 }` calls the fake `rm` once with `(zipPath, { force: true })` and returns `false`.
  - The same with `{ status: null, error: new Error('ENOENT') }`.
  - With `{ status: 0 }`, `rm` is not called and the result is `true`.
  - `findAbsoluteUrls('<IMG SRC="/a.png"><script src=/b.js></script><a HREF = \'/c\'>')` returns `['/a.png', '/b.js', '/c']`.
  - `findAbsoluteUrls('<IMG SRC="//cdn/x.png"><a HREF=https://x.io/><img src=./rel.png>')` returns `[]`.
  - Run `npx vitest run src/systems/itchPackage.test.js` and expect the new tests to fail.
- [ ] **Step 2: Implement** the three functions and the regex change. Note that an unquoted value ends at whitespace, `>`, or a quote.
- [ ] **Step 3: Wire `package-itch.mjs`:**
  - `const { verify, devices } = parsePackageArgs(process.argv.slice(2))` inside a try. On an error, print its message and `process.exit(1)` before any build.
  - Replace the inline `zip` spawn with `zipBundle({ spawn: spawnSync, rm: fs.rmSync, cwd: OUT, name, zipPath })`. If it returns false, print `zip failed; partial zip removed` and exit 1.
  - Update the header comment's `--devices` line to say the value is required.
- [ ] **Step 4:** Run `npx vitest run src/systems/itchPackage.test.js` and expect a pass. Then the mutation checks:
  1. drop `'-D'`; the `zipArgs` test fails;
  2. remove the `rm` call; both failure-path `zipBundle` tests fail;
  3. restore the old `ATTR_ABS`; the uppercase/unquoted test fails;
  4. make `parsePackageArgs` default silently; the throw tests fail.

  Restore after each.
- [ ] **Step 5: Live check:**
  - `node scripts/package-itch.mjs --devices` exits 1 with `--devices needs a value` and no build output.
  - `npm run package:itch -- --no-verify` exits 0, and `unzip -l release/<the -unverified zip>` lists no entry ending in `/`. Paste the count of `/`-ending entries (expected `0`) and the total number of entries.
  - Delete that `-unverified` zip afterwards. This is the worktree's own `release/`, so that's allowed.
- [ ] **Step 6:** Commit with the message `fix(release): zip without dir entries, strict --devices, partial-zip cleanup, wider absolute-URL scan (#86)`.

---

### Task 2: capture and media scripts (spec goals 3, 4, 5)

**Files:**
- Modify: `scripts/capture.mjs` (only the `--serve`/`--base-path` branch of `parseArgs`), `scripts/captureCore.mjs` (`shootBestFrame`), `scripts/release-media.mjs`
- Create: `scripts/captureCore.test.js`, `scripts/releaseMedia.test.js`, `scripts/captureArgs.test.js`

**Interfaces:**
- `capture.mjs` `parseArgs`: for `--serve` and `--base-path`, throws `` `${a} needs a value` `` when the next argument is missing or starts with `--`.
- `shootBestFrame` deadline message: `` `${label}: sim time never reached ${toSimMs} ms (stopped at ${lastSimMs} ms)` ``, where `lastSimMs` is the most recent `simMs` the page reported. The `simMs` returned for the best frame is unchanged.
- `release-media.mjs`:
  - exports `recordClip(browser, base, device)`;
  - `main()` runs only when the file is the entry point: `if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(…)`;
  - `recordClip`'s body after `newContext` sits in `try { … } finally { await context.close() }`, so every path closes the context exactly once.

**Steps:**
- [ ] **Step 1: Failing tests.**
  - `scripts/captureArgs.test.js`: spawn `node scripts/capture.mjs --flow --serve --no-build` with a 20 s timeout. Expect a non-zero exit and stderr matching `/--serve needs a value/`. Today this case gets past parsing, so the assertion fails (or the run times out). Add the same for `--flow --serve dist --base-path --no-build` → `/--base-path needs a value/`.
  - `scripts/captureCore.test.js`:
    - Call `shootBestFrame` with a fake page:
      - `waitForFunction` resolves;
      - the `evaluate` behind `boardRect` returns a valid rect (read `boardRect` to see the shape it needs);
      - crowd polls return `{ crowd: [], simMs }`, rising 100, 200, 300 and then stalling at 300;
      - `screenshot` and `waitForTimeout` are no-ops.
    - Spy `Date.now` so it passes the deadline after a few polls.
    - Expect the rejection message to contain `stopped at 300 ms`. Today the message reports the best frame's 100.
  - `scripts/releaseMedia.test.js`:
    - Import `recordClip`. Importing the module today runs `main()`, which is acceptable as a failure mode, but the test must fail for the right reason after the guard exists.
    - Give it a fake browser whose `newContext()` returns `{ newPage, close: vi.fn() }`. The fake page stalls below `RELEASE_MEDIA.clip.maxLeadSimMs` with an empty crowd.
    - Spy `Date.now` past the deadline.
    - Expect a rejection, and `close` called exactly once.
    - Mock out `rmSync` or point `VIDEO_DIR` at nothing harmful. It removes `.art-cache/release-video`, which is a gitignored scratch folder, so allowing it is acceptable.
  - Run the three files and expect them to fail.
- [ ] **Step 2: Implement** the three fixes per the Interfaces.
- [ ] **Step 3:** Run the three files and expect a pass. Mutation checks, restoring after each:
  1. remove `startsWith('--')` from the serve check; the capture-args test fails;
  2. report `simMs` again in the message; the captureCore test fails;
  3. remove the `finally`; the `close` assertion fails.
- [ ] **Step 4: Live check of the guard.** Run `env PATH=/usr/bin:/bin node scripts/release-media.mjs`, a PATH without Homebrew's ffmpeg (confirm with `env PATH=/usr/bin:/bin which ffmpeg`). Expect exit 2 and the `ffmpeg not found` message, which proves `main()` still runs as the entry point. If ffmpeg is in `/usr/bin`, use an empty-PATH variant that keeps `node`'s absolute path.
- [ ] **Step 5:** Run `npx vitest run` (the full suite) and expect exit 0. Paste the summary lines.
- [ ] **Step 6:** Commit with the message `fix(release): capture flag values, latest-simMs deadline message, clip context always closed (#86)`.
