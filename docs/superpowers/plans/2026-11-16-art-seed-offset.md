# Art seed offset Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pipeline v2's default job seed can never reproduce a shipped reference.

**Architecture:** Export `LEGACY_SEED` and a new `DEFAULT_SEED` from `src/assets/artJob.js`; the legacy generator imports `LEGACY_SEED`; tests assert the invariant through `planCandidates`.

**Tech Stack:** Vanilla JS ES modules, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-16-art-seed-offset-design.md`

## Global Constraints
- `LEGACY_SEED = 77021`; `DEFAULT_SEED = 88001`.
- An explicit job `seed` is used as written.
- Legacy `npm run art` (no `--job`) behaviour is unchanged: default seed 77021, `--seed N` still overrides.
- No new dependencies; comments explain why, not what.

## Review Focus
- A reroll round (round ≥ 1) must also never land on the legacy seed — covered by the invariant test across rounds.
- Existing tests that hard-code 77021/77022/77023 for v2 jobs must derive from `DEFAULT_SEED`, not swap one literal for another.

---

### Task 1: Separate the v2 default seed from the legacy seed

**Files:**
- Modify: `src/assets/artJob.js:10-11`
- Modify: `scripts/generate-art.mjs:62`
- Modify: `scripts/art/README.md` (Flags or "Things that bite")
- Test: `src/assets/artJob.test.js`, `scripts/art/runJob.test.js`

**Interfaces:**
- Produces: `export const LEGACY_SEED = 77021;` and `export const DEFAULT_SEED = 88001;` from `src/assets/artJob.js`.
- Consumes: `planCandidates({ existing, candidates, seed, reroll })` from `src/assets/candidates.js` (seeds = `seed + round*1000 + inRound + k`).

- [ ] **Step 1: Write the failing tests** in `src/assets/artJob.test.js`:
  - `it('defaults to a seed that never reproduces the legacy references')`: simulate rounds 0–20 at 16 candidates by calling `planCandidates` with the previous rounds' entries as `existing` (`reroll: true` after round 0); assert no planned seed equals `LEGACY_SEED`, and `resolveJob(...)` with no `seed` returns `seed: DEFAULT_SEED`.
  - `it('keeps an explicit job seed as written')`: job `seed: LEGACY_SEED` resolves to `LEGACY_SEED`.
  - Change the existing `toMatchObject({ ..., seed: 77021 })` to `seed: DEFAULT_SEED`.
  - In `scripts/art/runJob.test.js` replace the literal 77021-based expectations (lines ~72, ~123, ~155) with values derived from `DEFAULT_SEED`.
- [ ] **Step 2: Run** `npx vitest run src/assets/artJob.test.js scripts/art/runJob.test.js` — expect FAIL (`LEGACY_SEED`/`DEFAULT_SEED` not exported, or seed still 77021).
- [ ] **Step 3: Implement**: export both constants in `artJob.js` with a why-comment (deterministic FLUX + legacy seed → candidate #0 duplicated shipped art; any default above the legacy seed is safe because planned seeds only grow); `generate-art.mjs` uses `String(LEGACY_SEED)` as the `--seed` default and its comment stays about the legacy set. README: one line that v2 defaults to a different seed on purpose and `"seed": 77021` in a job reproduces today's art.
- [ ] **Step 4: Run** the two files, then `npm test` — expect all PASS. Prove the invariant test fails by temporarily setting `DEFAULT_SEED = LEGACY_SEED`, then restore.
- [ ] **Step 5: Commit** `fix(art): give pipeline v2 its own default seed so candidate #0 is not today's art` with explicit paths.
