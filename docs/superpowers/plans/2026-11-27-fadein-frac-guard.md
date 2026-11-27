# Ember Fade-in Edge Pin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pin that `emberPose`'s alpha stays finite and in [0, 1] when `fadeInFrac` is 0 or 1.

**Architecture:** Test only. `src/systems/tierLookMath.js` is not changed.

**Tech Stack:** Vitest + jsdom.

**Spec:** `docs/superpowers/specs/2026-11-27-fadein-frac-guard-design.md`

## Global Constraints

- No production code changes. Only `src/systems/tierLookMath.test.js` changes.
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Stage explicit paths only. Never pipe test output through tail or head.

## Review Focus

1. The test samples the whole period, including `phase` near the seam, not just a few hand-picked times.
2. The mutation proves the test fails on the `Math.min` form of the envelope.

---

### Task 1: edge-value pin

**Files:**
- Modify: `src/systems/tierLookMath.test.js` (inside the existing `describe('emberPose', ...)`, after the "holds a still pose" test).

- [ ] **Step 1: Add the test**

```js
  // #69(d): each division sits behind the branch that keeps its divisor non-zero.
  it('stays finite and in [0, 1] at fadeInFrac 0 and 1', () => {
    for (const fadeInFrac of [0, 1]) {
      const cfg = { ...TIER_EMBERS, fadeInFrac };
      for (let k = 0; k <= 1000; k++) {
        for (let i = 0; i < cfg.count; i++) {
          const { alpha } = emberPose((k / 1000) * P * (1 - 1e-9), i, cfg, ground, false);
          expect(Number.isFinite(alpha)).toBe(true);
          expect(alpha).toBeGreaterThanOrEqual(0);
          expect(alpha).toBeLessThanOrEqual(1);
        }
      }
    }
    expect(emberPose(0, 0, { ...TIER_EMBERS, fadeInFrac: 0 }, ground, false).alpha).toBe(1);
    expect(emberPose(0, 0, { ...TIER_EMBERS, fadeInFrac: 1 }, ground, false).alpha).toBe(0);
  });
```

- [ ] **Step 2: Run it.** Run `npx vitest run src/systems/tierLookMath.test.js`. Expected: PASS. It's a pin; the current code is correct.

- [ ] **Step 3: Mutation check.** Paste the raw failure, then restore.
  - In `src/systems/tierLookMath.js:44`, replace the envelope line with `if (!reduced) alpha = Math.min(phase / cfg.fadeInFrac, (1 - phase) / (1 - cfg.fadeInFrac));`. Expected: the new test fails, with a non-finite or out-of-range alpha. Check whether any existing test also fails, and note it.
  - Restore the file, and run `git diff --stat src/systems/tierLookMath.js` to show it's empty.

- [ ] **Step 4: Full suite.** Run `npm run test` and record the file and test counts and the exit code.

- [ ] **Step 5: Commit**

```bash
git add src/systems/tierLookMath.test.js
git commit -m "test(tier-looks): pin ember alpha finite at fadeInFrac 0 and 1 (#69d)"
```
