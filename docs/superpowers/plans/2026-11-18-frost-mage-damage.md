# Frost Mage Damage (backlog #72) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Frost Mage (mage tier4B) damage 60 → 85, so every tier out-damages the one below; pin the rule for all towers.

**Architecture:** One number in `src/data/towers.js`; one data test folding tier stats through the sim's own `towerSpecAt`.

**Tech Stack:** Vanilla JS ES modules, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-18-frost-mage-damage-design.md`

## Global Constraints
- Mage `tier4B.damage` is `85`; no other field of any tower changes.
- Single-target DPS = `damage × fireRate` from `towerSpecAt(type, tier, branch)` (`src/sim/matchupValue.js`); tiers 1–3 use branch `null`, tier 4 uses `'A'` / `'B'`.
- Tower list derived from `TOWER_DEFS`, excluding towers whose T1 `damage` is 0 (barracks).

## Review Focus
- An empty derived tower list would pass vacuously — guard it (expect the list to contain `mage` and have length `Object.keys(TOWER_DEFS).length - 1`).
- Equal DPS between tiers must fail (strictly greater).

---

### Task 1: Monotonic tier DPS + Frost Mage 85

**Files:** Modify `src/data/towers.js:29`; Test `src/data/towers.test.js`.

**Interfaces:** Consumes `towerSpecAt(type, tier, branch) -> { damage, fireRate, ... }` from `src/sim/matchupValue.js`.

- [ ] **Step 1: Failing test** in `src/data/towers.test.js`, a new `describe('tier damage ladder')` with `it('every attacking tower out-damages the tier below, both T4 branches above T3')`: for each derived type, DPS at T1 < T2 < T3 < 4A and T3 < 4B (`expect(next, \`${type} ${label}\`).toBeGreaterThan(prev)`), plus the vacuity guard from Review Focus.
- [ ] **Step 2:** `npx vitest run src/data/towers.test.js` → FAIL only on `mage T3<4B` (51 expected after fix; today 36 vs 48).
- [ ] **Step 3:** set mage `tier4B.damage` to `85`.
- [ ] **Step 4:** file passes; `npm test` green.
- [ ] **Step 5: Commit** `fix(balance): Frost Mage out-damages Sorcery; pin a rising damage ladder for every tower`.
