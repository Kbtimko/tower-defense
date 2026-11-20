# Map 9 / Map 8 Starting Gold Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Map 9 opens with 690 gold and map 8 with 405 (#37), so the balance sim wins both at 1x.

**Architecture:** Two data values in `src/data/maps.js` as recorded per-map overrides, one guard-test adjustment, and two fixtures re-baselined for that reason only.

**Tech Stack:** Vanilla JS ES modules, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-19-map9-funding-design.md`

## Global Constraints

- Map 9 `startGold: 690` and map 8 `startGold: 405`. Every other map field, every other map, `rewardMult` and `src/data/waves.js` stay unchanged.
- Leave these `mapsEconomy.test.js` guards unedited, and they must pass:
  - "never shrinks the opening hand";
  - "two-tower opening hand";
  - "never makes a late map relatively richer";
  - "keeps gold-per-HP non-increasing";
  - "scales the opening hand with the board";
  - the on-ramp pin.
- Stage explicit paths only. Use Conventional Commits ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never pipe vitest through tail/head/grep when gating a commit.

## Review Focus

1. **The fixture diffs are limited to maps 8 and 9.**
   - In `legacyGolden.json`, only keys starting `8:` or `9:` may change. A change to any other key means something else moved: stop and report.
   - In the `t4Abilities.test.js` "below tier 4 is unchanged" inline snapshot, only the map 8 entry may change.
2. **The depth-spread exclusion is for map 9 only.** Map 8's ratio (about 0.578) still fits the 0.05 spread, so excluding map 8 as well would hide a real regression.
3. **The override comments name the derived values** (map 9: 300, map 8: 270) and the reason, so a future re-derivation doesn't silently undo them.

---

### Task 1: Starting-gold overrides for maps 8 and 9 (#37)

**Files:**
- Modify: `src/data/maps.js` (map 8 and map 9 blocks: `startGold` and the economy comment)
- Modify: `src/data/mapsEconomy.test.js` (new pin test; map 9 exclusion in the spread test)
- Modify: `src/systems/UpgradeManager.test.js:216` (comment only)
- Re-baseline: `src/sim/__fixtures__/legacyGolden.json`, and the inline snapshot in `src/sim/t4Abilities.test.js`

- [ ] **Step 1: Write the failing test** in `mapsEconomy.test.js`, inside `describe('campaign economy ramp')`, after the on-ramp pin:
  ```js
  it('late maps carry the #37 starting-gold overrides', () => {
    // User's call 2026-11-19 (backlog #37): map 9 died on wave 1 at the derived
    // 300 under every strategy; see maps.js and the 2026-11-19 map9-funding spec.
    expect(byId(8).startGold).toBe(405);
    expect(byId(9).startGold).toBe(690);
  });
  ```
- [ ] **Step 2: Run** `npx vitest run src/data/mapsEconomy.test.js`. Expected: the new test FAILS (270 / 300), and the others PASS.
- [ ] **Step 3: Implement** in `src/data/maps.js`:
  - Map 9: `startGold: 690`. Replace its `startGold = 25% of the cheap board...` comment line(s) with an `OVERRIDDEN from the derived 300` comment that says:
    - At 300 the map died on wave 1 with 3 of 20 towers under every barracks strategy (needed 1.36x).
    - Fewer enemies or a higher `rewardMult` did not help (fewer kills, less gold), but earlier gold did: 690 wins keeping 60% of lives, with or without the +40% logistics perk.
    - `rewardMult` stays derived.
  - Map 8: `startGold: 405` with an `OVERRIDDEN from the derived 270` comment: it needed 1.08x, and 405 wins keeping 33% (67% with the perk). Note that neighbouring values are noisy: 420 loses at 1.03x.
  - Keep the comment style of map 5's override (`maps.js` around line 193).
- [ ] **Step 4: Spread-test exclusion.** In "does not let purchasing power collapse across the late campaign", change the filter to `m.id !== 5 && m.id !== 9`. Add one comment paragraph: map 9's `startGold` is a recorded override (#37) that front-loads gold the board-based rule did not give it, which lifts its depth ratio to about 0.62. Run `npx vitest run src/data`. Expected: PASS.
- [ ] **Step 5: Comment fix.** In `UpgradeManager.test.js:216`, change the trailing comment to `// #31's sizing: map 9's old 300 + 120`.
- [ ] **Step 6: Re-baseline the fixtures.**
  - Run `node scripts/captureSimGolden.mjs`, then `git diff --stat src/sim/__fixtures__/legacyGolden.json`. Confirm with `node -e` (comparing the JSON at `git show HEAD:...` against the new file) that only keys starting `8:` / `9:` differ. Write the list of changed keys into the report.
  - Run `npx vitest run src/sim/t4Abilities.test.js -u`. Confirm with `git diff` that only the map 8 entry of the inline snapshot changed.
- [ ] **Step 7: Run** `npm test` and record the exit code and test count. Expected: exit 0.
- [ ] **Step 8: Commit** with the message `balance(maps): map 9 starts with 690 gold, map 8 with 405 (#37)`. The body says: user's call; the sweep numbers; the fixtures re-baselined because maps 8/9 economy changed (list the changed golden keys).

### Task 2 (controller): verification
- [ ] `npm run balance` before and after. Maps 8 and 9 become OK, and every other row is byte-identical. The auto-send "harder than before" count stays 0.
- [ ] `npm run balance -- --t4`: summarise the diff for maps 8 and 9.
- [ ] Production build + preview: map 9 opens with 690 gold and map 8 with 405, with 0 page errors.
