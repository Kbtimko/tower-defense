# Bad Ghost Full Alpha Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rally and move ghost marks drawn in the bad colour (and their halos) render at full alpha; OK marks stay at `ghostAlpha`.

**Architecture:** A new `RALLY_FLAG.badAlpha` tunable; `GameScene._drawRallyOverlay` picks the alpha per mark from the same predicate that picks its colour.

**Tech Stack:** Phaser 3, Vitest + jsdom. Vanilla JS.

**Spec:** `docs/superpowers/specs/2026-11-26-bad-ghost-alpha-design.md`

## Global Constraints

- `RALLY_FLAG.badAlpha` is exactly `1`. `ghostAlpha` stays `0.6`. No other `RALLY_FLAG` value changes.
- **Alpha follows colour, per mark.** Any mark stroked or filled in `RALLY_BAD` uses `RALLY_FLAG.badAlpha`, and so does its halo. Any mark in `RALLY_OK` uses `RALLY_FLAG.ghostAlpha`, as does its halo.
- `_drawRallyRoutes` (route dots, the planted flag's fade) is unchanged.
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Stage explicit paths only. Never pipe test output through tail or head.

## Review Focus

1. Rally off the road: the flag is bad (alpha 1) while the ring stays OK (0.6). This mixed case is where a single shared alpha would be wrong.
2. Each halo's alpha matches its own mark's alpha, not the other mark's.
3. The #89 cancel ring (cursor on the barracks) is bad, so it uses alpha 1.
4. OK ghosts are unchanged at 0.6. A regression there would make the preview look committed.
5. The exact-value `RALLY_FLAG` test in `src/data/soldiers.test.js` is updated, not loosened.

---

### Task 1: badAlpha for bad ghost marks

**Files:**
- Modify: `src/data/soldiers.js` (add `badAlpha: 1` to `RALLY_FLAG`, next to `ghostAlpha`).
- Modify: `src/scenes/GameScene.js`, `_drawRallyOverlay` (both the rally and move branches).
- Modify tests:
  - `src/data/soldiers.test.js` (exact `toEqual` gains `badAlpha: 1`).
  - `src/scenes/GameScene.rally.test.js` (lines ~490, ~492, and the loop at ~818-828).
  - `src/scenes/GameScene.reposition.test.js` (the BAD ring assertions: no-slot ~168-169, the #89 cancel-ring tests ~300-302, and the 21 px ghost test).

**Interfaces:**
- Consumes `_drawFlag(g, pt, colour, alpha)`, which passes `alpha` to both the halo and the marks. Call it with `badAlpha` when the flag is bad.

- [ ] **Step 1: Update the tests to the new contract** (they must fail first).
  - `soldiers.test.js`: add `badAlpha: 1` to the exact object, and add an assertion that `RALLY_FLAG.badAlpha > RALLY_FLAG.ghostAlpha`.
  - `rally.test.js` ~490 and ~492: the BAD flag entries expect `alpha: RALLY_FLAG.badAlpha`. The OK entries (~477, ~487) stay at `ghostAlpha`.
  - The rally halo loop (~818): iterate `[where, ringColour, ringAlpha, flagColour, flagAlpha]` with these cases:
    - IN_RANGE → OK/ghostAlpha, OK/ghostAlpha
    - OUT_OF_RANGE → BAD/badAlpha, BAD/badAlpha
    - OFF_ROAD → OK/ghostAlpha, BAD/badAlpha

    Assert `rings[0]` (the halo) alpha = ringAlpha, `rings[1]` = `{ colour: ringColour, alpha: ringAlpha }`, and `expectFlagOnHalo(ms, flagColour, flagAlpha)`. Read `expectFlagOnHalo` first; if it can't take a separate alpha, extend it minimally.
  - `reposition.test.js`: every ring pair whose stroke is `BAD` expects alpha `RALLY_FLAG.badAlpha` on **both** the halo `r[0]` and the stroke `r[1]`. Every ring pair whose stroke is `OK` keeps `ghostAlpha` on both.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/data/soldiers.test.js src/scenes/GameScene.rally.test.js src/scenes/GameScene.reposition.test.js`
Expected: FAIL on the `badAlpha` assertions (`badAlpha` is undefined, or the alpha is 0.6 instead of 1). Note the count.

- [ ] **Step 3: Implement.** Add `badAlpha: 1` to `RALLY_FLAG`. In `_drawRallyOverlay`:
  - rally: compute `ringBad = t.onRoad && !t.inRange` before drawing. Draw the ring halo and stroke with `ringBad ? badAlpha : ghostAlpha`, and draw the flag with `t.valid ? ghostAlpha : badAlpha`.
  - move: use `slot ? ghostAlpha : badAlpha` for both the halo and the stroke.
  - Update the doc comment above `_drawRallyOverlay` with one clause: bad marks draw at full alpha.

- [ ] **Step 4: Run the three files, then `npm run test`.** Expected: all green. Record the full-suite counts and exit code.

- [ ] **Step 5: Mutation check.** Paste the raw failure for each, and restore after each.
  - (a) Set `badAlpha` to `0.6`: the rally and move bad-alpha assertions fail.
  - (b) Use the ring's alpha for the flag (one shared alpha): the OFF_ROAD halo-loop case fails.
  - (c) Leave the move-ring halo at `ghostAlpha`: a reposition halo assertion fails.

- [ ] **Step 6: Commit**

```bash
git add src/data/soldiers.js src/data/soldiers.test.js src/scenes/GameScene.js src/scenes/GameScene.rally.test.js src/scenes/GameScene.reposition.test.js
git commit -m "fix(barracks): bad rally/move ghosts draw at full alpha (#65a)"
```
