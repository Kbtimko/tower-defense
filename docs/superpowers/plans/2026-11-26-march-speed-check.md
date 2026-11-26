# March Speed Check Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The rally capture run fails when the squad's march takes the wrong amount of game time for its distance.

**Architecture:** A pure `marchTimeProblem` in `scripts/captureCore.mjs`, called from `captureRally` in `scripts/capture.mjs` with the measured `simMs` span and the walked distance.

**Tech Stack:** Node ESM scripts, Playwright, Vitest (node environment for `scripts/*.test.js`).

**Spec:** `docs/superpowers/specs/2026-11-26-march-speed-check-design.md`

## Global Constraints

- The tolerance is `PHASER_MAX_DELTA_MS` (already defined in `scripts/capture.mjs`, 200). The bound is inclusive.
- The distance is `Math.abs(done.target - before.target) * plan.totalPx`. Don't use `plan.marchArcPx`.
- The existing `untilGameTime` budgets and labels stay unchanged.
- Game code (`src/`) is untouched.
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Stage explicit paths only. Never pipe test output through tail or head.

## Review Focus

1. `(d)`'s wait must still resolve truthy on the first marching frame. Returning a bare `simMs` would be falsy if it's 0, so return an object.
2. `before.target` is read before the tap, and `done.target` after arrival. Swapping them gives the same absolute value, but reading `before` after the tap gives 0 px.
3. The error message carries the measured, expected and tolerance numbers, so a flake can be diagnosed from the log alone.

---

### Task 1: marchTimeProblem and its use in the rally run

**Files:**
- Modify: `scripts/captureCore.mjs` (add the export)
- Modify: `scripts/captureCore.test.js` (add a describe)
- Modify: `scripts/capture.mjs`:
  - `rallyPlan()` return object (~line 1498): add `totalPx: total`;
  - `captureRally` steps (d)/(e) (~1558-1577);
  - import `marchTimeProblem` from `./captureCore.mjs` (~line 43).

**Interfaces:**
- Produces: `export function marchTimeProblem({ elapsedMs, arcPx, speed, frameMs })` → `string | null`.

- [ ] **Step 1: Write the failing tests** in `scripts/captureCore.test.js` (add `marchTimeProblem` to the existing import):

```js
describe('marchTimeProblem', () => {
  // 150 px at 60 px/s is 2500 ms of game time.
  const base = { arcPx: 150, speed: 60, frameMs: 200 };
  it('passes an on-speed march, and one frame either side (inclusive)', () => {
    expect(marchTimeProblem({ ...base, elapsedMs: 2500 })).toBeNull();
    expect(marchTimeProblem({ ...base, elapsedMs: 2300 })).toBeNull();
    expect(marchTimeProblem({ ...base, elapsedMs: 2700 })).toBeNull();
  });
  it('flags a march one ms past a frame late or early', () => {
    expect(marchTimeProblem({ ...base, elapsedMs: 2701 })).toMatch(/2701/);
    expect(marchTimeProblem({ ...base, elapsedMs: 2299 })).toMatch(/2299/);
  });
  it('flags a slow march (0.7x speed) and a near-teleport, naming expected and tolerance', () => {
    const slow = marchTimeProblem({ ...base, elapsedMs: 3571 });
    expect(slow).toMatch(/3571/);
    expect(slow).toMatch(/150 px/);
    expect(slow).toMatch(/2500/);
    expect(slow).toMatch(/200/);
    expect(marchTimeProblem({ ...base, elapsedMs: 17 })).toMatch(/17 ms/);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run scripts/captureCore.test.js`
Expected: FAIL. `marchTimeProblem` is not exported (it's undefined, so it isn't a function).

- [ ] **Step 3: Implement `marchTimeProblem`** in `scripts/captureCore.mjs`. Add a comment explaining *why* the tolerance is one frame: the first and last polls each land on a frame boundary. Round numbers in the message to whole ms and px. The message format is `march took ${elapsed} ms of game time for ${arcPx} px; at ${speed} px/s that is ${expected} ± ${frameMs} ms`.

- [ ] **Step 4: Wire it into `captureRally`.**
  - `rallyPlan()` returns `totalPx: total`.
  - The `(d)` "never marched" wait's cond becomes `() => window.__capture.rally[0]?.marching === true && { sim: window.__capture.simMs }`. Keep the result as `started`.
  - The `(e)` arrival cond returns `r.marching === false && { r, sim: window.__capture.simMs }`. Destructure it to `done` and the arrival sim. The existing on-the-flag check keeps using `done`.
  - After the on-the-flag check: compute `arcPx = Math.abs(done.target - before.target) * plan.totalPx`, then call `marchTimeProblem({ elapsedMs: arrivalSim - started.sim, arcPx, speed: SOLDIER_MARCH.speed, frameMs: PHASER_MAX_DELTA_MS })`. If it returns a message, `throw new Error(\`(e) ${problem}\`)`.
  - Update the comment above `walkMs` to say the budgets bound a hang and the speed is checked in (e).

- [ ] **Step 5: Run tests.** Run `npx vitest run scripts/captureCore.test.js scripts/captureArgs.test.js` (expected PASS), then `npm run test`. Record the counts and exit code. Also run `node --check scripts/capture.mjs` (expected exit 0).

- [ ] **Step 6: Mutation check.** Paste the raw failure for each, and restore after each.
  - (a) Change the inclusive `<=`/`>` comparison so exactly expected ± frameMs fails. Expected: the inclusive test fails.
  - (b) Return `null` unconditionally. Expected: the "flags" tests fail.

  The controller runs the live capture A/B (a slowed march), so you don't need to run Playwright.

- [ ] **Step 7: Commit**

```bash
git add scripts/captureCore.mjs scripts/captureCore.test.js scripts/capture.mjs
git commit -m "test(capture): rally run checks march speed in game time (#65c)"
```
