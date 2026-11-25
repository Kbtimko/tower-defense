# Damage-number pool priority Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When the damage-number pool is full, a big or AoE number evicts the oldest in-flight absorbed (`🛡`) number instead of being dropped.

**Architecture:** A single change to `src/systems/DamageNumberOverlay.js`. An insertion-ordered `Set` of in-flight absorbed texts is kept in step with `_inUse`, and an eviction branch runs before the existing "pool full → return".

**Tech Stack:** Vanilla JS ES modules, Phaser 3.90, Vitest + jsdom.

**Spec:** `docs/superpowers/specs/2026-11-24-damage-number-priority-design.md`

## Global Constraints

- No change to `POOL_SIZE` (24), `THRESHOLD` (30), `ABSORBED_COOLDOWN_MS` (700), `STYLES`, the labels or the tween shape.
- An absorbed number never evicts anything. A big (amount ≥ 30) or AoE number evicts only an absorbed number, and only the oldest in flight.
- The evicted text's tweens are killed with `scene.tweens.killTweensOf(text)`, and it leaves both `_inUse` and the absorbed set before it is reused.
- A text that completes its tween leaves the absorbed set.

## Review Focus

- A text that finished as an absorbed number and was reused for a big number is evicted as if still absorbed (stale tracking). Test 4 pins this.
- Eviction picks the newest absorbed instead of the oldest. Test 2 pins this.
- An absorbed hit evicts another absorbed number. Test 3 pins this.
- After an eviction the in-use count drifts (the text is counted twice, or not at all), so the pool over- or under-fills. Test 5 pins this.

---

### Task 1: Absorbed numbers yield their pool slot

**Files:**
- Modify: `src/systems/DamageNumberOverlay.js`
- Test: `src/systems/DamageNumberOverlay.test.js` (add a new `describe('pool priority', …)` block)

**Interfaces:**
- Consumes: the existing `'damage-dealt'` payload `{ target, amount, isAoe, abilityLabel, absorbedBand }`.
- Produces: nothing new for other modules.

**Test harness for this block.** The file's `makeScene()` tween fake completes tweens synchronously, so nothing stays in flight. For this block, write a local fake that records each `tweens.add` config per target, never completes it unless the test asks, and whose `killTweensOf(t)` drops that target's recorded tweens *without* calling their `onComplete`. Add a helper `complete(text)` that runs the recorded `onComplete` of the text's first tween (the one that has it). Give targets distinct identities (`{ x: i, y: i }` objects) so the per-enemy throttle never blocks a fill. Find texts by their last `setText` value (the fake text in `makeText()` stores it on `.text`).

- [ ] **Step 1: Write the failing tests** in `describe('pool priority', …)`:
  1. `a big hit evicts an absorbed number when the pool is full`: fill with 24 absorbed (`amount: 1, absorbedBand: 'floored'`, distinct targets), then emit `{ amount: 50 }`. Expect `scene.add.text` called exactly 24 times, `killTweensOf` called once, and exactly one live text reading `'50'`.
  2. `evicts the OLDEST absorbed number`: emit 12 big (`amount: 50`), then 12 absorbed with distinct amounts `1..12` (`absorbedBand: 'heavy'`), then an AoE `{ amount: 7, isAoe: true }`. Expect `killTweensOf` called with the text that showed `🛡1`, and that text now reads `'7'`.
  3. `an absorbed hit never evicts`: fill with 24 absorbed, then emit a 25th absorbed on a new target. Expect `killTweensOf` not called and no text reading the 25th label (use amount `99` with `absorbedBand: 'heavy'` → label `🛡99`).
  4. `a completed absorbed number is no longer evictable`: emit one absorbed (`amount: 3`), `complete()` it, then emit 24 big hits with distinct amounts `30..53` (the first reuses the pooled text). Then emit one more big hit `{ amount: 77 }`. Expect `killTweensOf` not called, no text reading `'77'`, and the reused text still reading `'30'`.
  5. `the pool stays at 24 across evictions`: fill with 24 absorbed, emit 3 big hits (`amount: 60, 61, 62`), then 1 absorbed on a new target (`amount: 5`). Expect `scene.add.text` called exactly 24 times, exactly 3 live texts reading `'60'`/`'61'`/`'62'`, and no text reading `🛡5`.
  6. `a big hit is still dropped when the pool holds no absorbed numbers`: fill with 24 big, emit `{ amount: 88 }`. Expect `killTweensOf` not called and no text reading `'88'`.

- [ ] **Step 2: Run** `npx vitest run src/systems/DamageNumberOverlay.test.js`. Expected: tests 1, 2 and 5 FAIL (no eviction). Tests 3, 4 and 6 may pass on the old code (they pin the guards). Paste the raw output in the report.

- [ ] **Step 3: Implement** in `DamageNumberOverlay`:
  - the constructor adds `this._absorbedInUse = new Set();`
  - in `_handle`, replace the pool-full early return and the text-acquisition chain so that, with no free pooled text and `_inUse.size >= POOL_SIZE`:
    - an absorbed hit returns;
    - otherwise take the first entry of `_absorbedInUse`. If there is none, return. Otherwise `killTweensOf` it, delete it from `_absorbedInUse` and `_inUse`, and use it as `txt`;
  - after `this._inUse.add(txt)`, add `txt` to `_absorbedInUse` when the hit is absorbed;
  - in `onComplete`, also `this._absorbedInUse.delete(txt)`;
  - `destroy()` clears `_absorbedInUse`.
  - Keep the throttle-window write where it is: it runs only once a text has been secured.

- [ ] **Step 4: Run** `npx vitest run src/systems/DamageNumberOverlay.test.js`, then the full suite `npx vitest run`. Expected: all pass, exit 0. Do not pipe through `tail` or `head`.

- [ ] **Step 5: Mutation checks.** Paste the raw failing output for each, then restore:
  - (a) delete the eviction (always return when full) → tests 1, 2 and 5 fail;
  - (b) take the *last* entry of `_absorbedInUse` instead of the first → test 2 fails;
  - (c) remove the `_absorbedInUse.delete(txt)` from `onComplete` → test 4 fails;
  - (d) let absorbed hits evict too → test 3 fails.

- [ ] **Step 6: Commit**

```bash
git add src/systems/DamageNumberOverlay.js src/systems/DamageNumberOverlay.test.js
git commit -m "fix(fx): absorbed damage numbers yield their pool slot to big and AoE hits (#23)"
```
