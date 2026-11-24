# Drop Core Glow (backlog #73a) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Towers with real art show no core glow; art-less fallback towers keep it.

**Architecture:** `TowerTierLook` gates the core on `!sprite.active`; `expectedTowerLook` learns an `art` option; the capture passes `{ art: true }`.

**Tech Stack:** Vanilla JS ES modules, Vitest, Playwright capture harness.

**Spec:** `docs/superpowers/specs/2026-11-19-drop-core-glow-design.md`

## Global Constraints
- Only the core changes. Embers, pips/badge, T4 ring, `TIER_CORE` values and the #66 stroke circle are untouched.
- `expectedTowerLook(level, branch, { art = false } = {})` — default keeps today's result for every existing caller.

## Review Focus
- A tower re-tiered after its sprite becomes active (upgrade path) must drop an existing core, not just skip creating one.
- `snapshot().core` must reflect the real objects (`this._glow != null`), not the rule.

---

### Task 1: Core only on art-less towers

**Files:** Modify `src/systems/TowerTierLook.js` (`setTier`, header comment), `src/systems/tierLookMath.js` (`expectedTowerLook`), `scripts/capture.mjs:1668`, `src/data/tierLooks.js` (comment on `TIER_CORE`); Test `src/systems/TowerTierLook.test.js`, `src/systems/tierLookMath.test.js`.

**Interfaces:** `expectedTowerLook(level, branch, { art } = {}) -> { scale, core, embers, ring, pips }`.

- [ ] **Step 1: Failing tests:**
  - TowerTierLook: with the file's active-sprite stand-in, `setTier(2, null)` gives `snapshot().core === false`, and `setTier(4, 'A')` keeps embers 3. With an inactive sprite, `setTier(2, null)` gives `core === true`.
  - tierLookMath: `expectedTowerLook(n, b, { art: true }).core === false` for all five rows, with the other fields unchanged; with no option, today's table holds.
  - Update any existing active-sprite test that asserts a core at T2+.
- [ ] **Step 2:** run both files and confirm they FAIL on the new cases.
- [ ] **Step 3: Implement:** `this._setCore(level >= TIER_CORE.fromTier && !this.sprite.active)`. `expectedTowerLook` gets `core: marked && !art`. In capture, `expectedTowerLook(t.level, t.branch, { art: true })`. Update the comments.
- [ ] **Step 4:** both files pass, and `npm test` is green (run `npm ci` first in a fresh worktree).
- [ ] **Step 5: Commit** `feat(tiers): drop the core glow over tower art; keep it for art-less towers`.
