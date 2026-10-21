# Percent-based Logistics Starting Gold Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Supply Cache / Deep Reserves grant +15% / +25% of the map's `startGold` instead of a flat +40 / +80 (backlog #31).

**Architecture:** The percentages move onto the two upgrade nodes as data (`startGoldPct`). `UpgradeManager.getModifiers` sums them into a renamed `startGoldPct` modifier. A pure `startingGold(baseGold, pct)` helper turns that into an integer gold amount at the one call site in `GameScene.create`.

**Tech Stack:** Vanilla JS ES modules, Phaser 3, Vitest 2 + jsdom.

**Spec:** `docs/superpowers/specs/2026-10-21-percent-logistics-gold-design.md`

## Global Constraints

- Supply Cache `startGoldPct: 0.15`, effect `'+15% starting gold'`. Deep Reserves `startGoldPct: 0.25`, effect `'+25% starting gold'`.
- Node IDs, `cost` (2 / 3), `requires` and `starThreshold` unchanged.
- The modifier key is `startGoldPct` (default `0`). The name `startGoldBonus` must not survive anywhere in `src/`.
- Round the bonus, not the total: `baseGold + Math.round(baseGold * pct)`.
- Tunables live in `src/data/`, never in logic. `src/data/maps.js` is untouched.
- Run tests with `npx vitest run <path>`; never pipe test output through `tail`/`head`.

## Review Focus

1. **A stale `startGoldBonus` reader:** `map.startGold + undefined` is `NaN` gold, and the HUD shows `NaN`. Task 2 Step 6 greps `src/` for the old name and expects zero hits.
2. **Effect text drifting from the applied number:** a future edit to one but not the other misleads the player. Task 1 pins every node that carries `startGoldPct` to its text.
3. **Half-gold starting amounts** (130 × 0.15 = 19.5): Task 2's helper tests pin integer output with a `.5` case.
4. **Deep Reserves owned alone** (a hand-edited or legacy save): it should give 25%, not 0 or 40%. Task 2 pins it.
5. **Nodes with no `startGoldPct`** (the other 23) must contribute 0, not `NaN`. Task 2's "only non-logistics nodes owned" test pins it.

---

### Task 1: Percentages on the upgrade nodes

**Files:**
- Modify: `src/data/upgrades.js:48-51` (the `log_supply_cache` and `log_deep_reserves` entries)
- Test: `src/data/upgrades.test.js`

**Interfaces:**
- Produces: `UPGRADES` entries `log_supply_cache` and `log_deep_reserves` gain a numeric `startGoldPct` field (0.15 and 0.25). No other node has the field.

- [ ] **Step 1: Write the failing tests** in a new `describe('UPGRADES — logistics starting gold', …)` block:

```js
const byId = id => UPGRADES.find(u => u.id === id);

it('Supply Cache grants 15% and Deep Reserves 25% of starting gold', () => {
  expect(byId('log_supply_cache').startGoldPct).toBe(0.15);
  expect(byId('log_deep_reserves').startGoldPct).toBe(0.25);
});

it('only the two logistics gold nodes carry startGoldPct', () => {
  const ids = UPGRADES.filter(u => u.startGoldPct !== undefined).map(u => u.id).sort();
  expect(ids).toEqual(['log_deep_reserves', 'log_supply_cache']);
});

it('effect text states the same percentage the game applies', () => {
  for (const u of UPGRADES.filter(n => n.startGoldPct !== undefined)) {
    expect(u.effect).toBe(`+${Math.round(u.startGoldPct * 100)}% starting gold`);
  }
});
```

- [ ] **Step 2: Run and confirm all three fail**

Run: `npx vitest run src/data/upgrades.test.js`
Expected: the three new tests FAIL (`startGoldPct` undefined, ids `[]`). The effect-text test passes vacuously at this point because no node carries the field. That is expected, and Step 4 must show it running against two nodes.

- [ ] **Step 3: Add `startGoldPct` and the new `effect` strings to the two entries.** Leave `cost`/`requires` untouched.

- [ ] **Step 4: Run and confirm pass.** Then prove the effect-text test bites: temporarily change Supply Cache's effect back to `'+40 starting gold'`, run, see that test FAIL, and revert.

Run: `npx vitest run src/data/upgrades.test.js`
Expected: PASS (all tests in file)

- [ ] **Step 5: Commit**

```bash
git add src/data/upgrades.js src/data/upgrades.test.js
git commit -m "feat(upgrades): logistics gold nodes carry a starting-gold percentage"
```

---

### Task 2: Modifier, helper and call site

**Files:**
- Modify: `src/systems/UpgradeManager.js:87-110` (`getModifiers`; add a named export `startingGold`)
- Modify: `src/scenes/GameScene.js:16` (import) and `:87` (EconomyManager start gold)
- Test: `src/systems/UpgradeManager.test.js:127-145`

**Interfaces:**
- Consumes: `UPGRADES[].startGoldPct` from Task 1 (via the existing `BY_ID` / `UPGRADES` import in `UpgradeManager.js`).
- Produces: `export function startingGold(baseGold: number, pct: number): number` in `src/systems/UpgradeManager.js`. `getModifiers(heroId)` returns `startGoldPct: number` (sum of owned nodes' `startGoldPct`, default `0`) in place of `startGoldBonus`.

- [ ] **Step 1: Update and add the failing tests** in `src/systems/UpgradeManager.test.js`:
  - In `'returns all defaults when nothing is purchased'`, replace `startGoldBonus: 0` with `startGoldPct: 0`.
  - Replace `'aggregates additive starting gold from both logistics nodes'` with:

```js
it('Supply Cache alone grants 15% starting gold', () => {
  const um = new UpgradeManager(saveWithStars(10));
  um.purchase('log_supply_cache');
  expect(um.getModifiers('rael').startGoldPct).toBeCloseTo(0.15, 10);
});

it('both logistics nodes add to 40% starting gold', () => {
  const um = new UpgradeManager(saveWithStars(10));
  um.purchase('log_supply_cache');
  um.purchase('log_deep_reserves');
  expect(um.getModifiers('rael').startGoldPct).toBeCloseTo(0.40, 10);
});

it('Deep Reserves owned alone (legacy save) grants 25%', () => {
  const sm = saveWithStars(10);
  sm.setPurchasedUpgrades(['log_deep_reserves']);
  expect(new UpgradeManager(sm).getModifiers('rael').startGoldPct).toBeCloseTo(0.25, 10);
});

it('nodes without a starting-gold percentage contribute nothing', () => {
  const um = new UpgradeManager(saveWithStars(20));
  um.purchase('rael_hp');
  um.purchase('ars_munitions');
  expect(um.getModifiers('rael').startGoldPct).toBe(0);
});
```

  - Add a `describe('startingGold', …)` block (import `startingGold` alongside `UpgradeManager`):

```js
it('returns the base unchanged at 0%', () => {
  expect(startingGold(180, 0)).toBe(180);
});
it('adds the rounded percentage of the base', () => {
  expect(startingGold(180, 0.40)).toBe(252);
  expect(startingGold(300, 0.40)).toBe(420);   // map 9: same as today's 300 + 120
});
it('rounds a half-gold bonus to a whole number', () => {
  expect(startingGold(130, 0.15)).toBe(150);   // 19.5 -> 20
  expect(Number.isInteger(startingGold(210, 0.15))).toBe(true);
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `npx vitest run src/systems/UpgradeManager.test.js`
Expected: FAIL. `startingGold` is not exported, and the defaults object and percentage tests mismatch.

- [ ] **Step 3: Implement.** In `getModifiers`, rename the default key to `startGoldPct: 0`. Delete the two hardcoded `log_supply_cache` / `log_deep_reserves` lines. Sum `startGoldPct` over the owned node ids (`BY_ID.get(id)?.startGoldPct ?? 0`, so an unknown id in a save contributes 0). Add `export function startingGold(baseGold, pct)` returning `baseGold + Math.round(baseGold * pct)`.

- [ ] **Step 4: Run and confirm pass**

Run: `npx vitest run src/systems/UpgradeManager.test.js`
Expected: PASS

- [ ] **Step 5: Call site.** In `src/scenes/GameScene.js`, import `startingGold` from `'../systems/UpgradeManager.js'` (extend the existing line 16 import). Pass `startingGold(map.startGold, mods.startGoldPct)` as the first `EconomyManager` argument at line 87.

- [ ] **Step 6: Confirm the old name is gone and the whole suite is green**

Run: `grep -rn "startGoldBonus" src/ ; echo "grep exit $?"`
Expected: no matches, `grep exit 1`

Run: `npx vitest run > /tmp/vitest-full.txt 2>&1; echo "exit $?"; grep -E "Test Files|Tests " /tmp/vitest-full.txt`
Expected: `exit 0`, all files passed. The test count is the 1505 baseline plus the new tests, minus the one replaced test.

- [ ] **Step 7: Commit**

```bash
git add src/systems/UpgradeManager.js src/systems/UpgradeManager.test.js src/scenes/GameScene.js
git commit -m "feat(upgrades): logistics starting gold scales with each map's base gold"
```
