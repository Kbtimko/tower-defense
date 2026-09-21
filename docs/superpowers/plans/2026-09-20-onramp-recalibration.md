# Level 1–3 On-Ramp Recalibration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Level 1 the gentlest map in the campaign and give maps 0–2 a monotonically increasing difficulty ramp, so a new player is not stopped by the first map they meet.

**Architecture:** Pure data change. Two wave tables in `src/data/waves.js` are retuned and two per-map economy numbers in `src/data/maps.js` are nudged. No game logic, no new fields, no new systems. One new model-free regression test pins the ramp so the inversion cannot silently return, and one pre-existing test that hardcodes the broken state is repointed at a synthetic fixture.

**Tech Stack:** Plain ES modules (JavaScript, no TypeScript). Vitest 2 + jsdom. Balance simulator via `npm run balance`. Phaser 3 game verified in a browser through `npm run build && npm run preview`.

**Spec:** `docs/superpowers/specs/2026-09-20-onramp-recalibration-design.md`

---

## Context you need before starting

**"Level 1" is map id 0.** `src/scenes/MapSelectScene.js:109` renders `String(node.id + 1)`, so map 0 is Level 1, map 1 is Level 2, map 2 is Level 3. Every "Level N" in this plan maps to id N−1.

**Two numbers are load-bearing beyond the maps themselves.** `totalEnemyHpForMap(id)` (`src/data/waves.js:187`) feeds `heroXpThresholds` in `src/systems/heroLeveling.js`, which paces hero levelling as *fractions* of a map's total HP (`HERO_LEVEL_DAMAGE_FRACTIONS = [0.07, 0.13, 0.21, 0.30]`). Changing a wave table therefore moves that map's hero levelling curve. This has been measured for map 0 and is benign — thresholds fall from `[616, 1144, 1848, 2640]` to `[505, 939, 1516, 2166]`, hero damage dealt is essentially unchanged (3036 → 3091) and the hero still reaches L5. Do not "fix" this; it is the self-normalizing design working. But do not let it pass unnoticed either — that is what the `EXPECTED` table in Task 3 exists for.

**Baseline before you start:** 84 test files, **1168 tests, all passing**. Applying the full data change breaks **exactly 3** of them, all addressed by Tasks 3 and 4. If you see a fourth failure, stop and investigate rather than adjusting a test to match.

**The ramp guard stops at map 2, and that is deliberate.** Map 3 ships 898 HP per wave, below map 2's post-change 917. That 2→3 inversion already exists on `main` (1028 vs 898, 14.5%); this change shrinks it to 2.1% but does not remove it, because maps 3–9 are out of scope. Do not widen the test to map 3 — it will fail, and the fix is a separate recalibration.

**Run everything from the worktree root**, not the primary checkout:
`/Users/keithtimko/.config/superpowers/worktrees/tower-defense/onramp-recalibration`

**Never pipe test or build output through `head` or `tail`** — it masks the exit code. Capture full output and check it.

---

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `src/data/waves.js` | Modify — replace the `0:` and `2:` wave arrays | The campaign's per-map spawn tables |
| `src/data/maps.js` | Modify — `rewardMult` on map 0; `startGold` + `rewardMult` on map 2 | Per-map economy and layout config |
| `src/data/waves.test.js` | Modify — update `EXPECTED` HP table; add on-ramp ramp + brute-debut tests | Data-table invariants |
| `src/sim/deficit.test.js` | Modify — replace hardcoded map-0 fixture with a synthetic one | `findWinMultiplier` unit behaviour |

---

## Task 1: Pin the on-ramp ramp with a failing test

The regression guard the original economy calibration lacked. This test is deliberately **model-free** — it reads only `MAP_WAVES` and `ENEMY_DEFS`, never the simulator — so it holds regardless of whether the balance model is trusted.

**Files:**
- Test: `src/data/waves.test.js` (append a new `describe` at the end of the file)

- [ ] **Step 1: Write the failing test**

Append to the end of `src/data/waves.test.js`:

```js
// The on-ramp is the first three maps, and it is the stretch a new player is
// judged by. Before this guard existed, map 0 shipped HARDER than map 1 on HP,
// reward rate, peak pressure and brute count -- the 2026-06-17 economy spec
// tuned each map against a board-fill curve and never compared maps to one
// another, so nothing caught the inversion.
//
// HP per wave, not total HP: maps 0 and 1 run 10 waves and map 2 runs 12, so
// totals alone would call map 2 harder purely for being longer.
//
// Scoped to maps 0-2 on purpose. Map 3 ships 898 HP per wave, BELOW map 2's
// 917, so a 0 < 1 < 2 < 3 assertion would fail. That inversion is pre-existing
// and out of scope here -- this change shrinks it from 14.5% (1028 vs 898) to
// 2.1% rather than introducing it. Extend this test past map 2 only as part of
// recalibrating maps 3-9.
describe('on-ramp difficulty ramp (maps 0-2)', () => {
  const hpPerWave = (mapId) => totalEnemyHpForMap(mapId) / MAP_WAVES[mapId].length;

  it('increases strictly from map 0 to map 1 to map 2', () => {
    const ramp = [0, 1, 2].map(hpPerWave);
    expect(ramp[0]).toBeLessThan(ramp[1]);
    expect(ramp[1]).toBeLessThan(ramp[2]);
  });

  it('makes map 0 the gentlest map in the campaign per wave', () => {
    const others = [1, 2, 3, 4, 5, 6, 7, 8, 9].map(hpPerWave);
    for (const hp of others) expect(hpPerWave(0)).toBeLessThan(hp);
  });
});

// Map 0 is where the brute is introduced, and the archer -- what 130 starting
// gold and a naive damage-per-gold read both pick -- lands 5 DPS on one once
// flat armour and the 0.75 weakness multiplier compound. That mismatch has to
// be REVEALED on a small isolated wave before it is PUNISHED on a big mixed
// one, or the player is beaten for a reasonable inference with no warning.
describe('map 0 introduces the brute before it tests it', () => {
  const waves = MAP_WAVES[0];
  const waveHp = (w) => w.reduce((s, g) => s + ENEMY_DEFS[g.type].hp * g.count, 0);
  const bruteWaves = waves
    .map((w, i) => ({ w, i }))
    .filter(({ w }) => w.some(g => g.type === 'brute'));

  it('debuts the brute on a wave of nothing but brutes', () => {
    expect(bruteWaves.length).toBeGreaterThan(1);
    const debut = bruteWaves[0].w;
    expect(debut.every(g => g.type === 'brute')).toBe(true);
  });

  it('makes that debut smaller than the next wave carrying brutes', () => {
    expect(waveHp(bruteWaves[0].w)).toBeLessThan(waveHp(bruteWaves[1].w));
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run src/data/waves.test.js
```

Expected: **4 failures**, for the reasons below. Confirm each message before continuing — a different failure means the file was appended in the wrong place.

| Test | Expected failure |
|---|---|
| `increases strictly from map 0 to map 1` | `expected 880 to be less than 812` |
| `makes map 0 the gentlest map` | `expected 880 to be less than 812` |
| `debuts the brute on a wave of nothing but brutes` | passes already — map 0 wave 4 is `4 brute` alone |
| `makes that debut smaller than the next wave carrying brutes` | `expected 480 to be less than 920` — passes already |

Only the first two fail; the brute-debut pair already holds on the shipped table and is pinned here so Task 2 cannot break it. **Expected: 2 failed, 2 passed.**

- [ ] **Step 3: Commit the failing test**

```bash
git add src/data/waves.test.js
git commit -m "test(waves): pin the map 0-2 difficulty ramp and the brute debut

Map 0 currently ships 880 HP per wave against map 1's 812, so the first
map a new player meets is harder than the second. These tests fail on
that inversion and will hold once the wave tables are retuned."
```

---

## Task 2: Retune Level 1 (map 0)

Trims total HP 8,800 → 7,220 and brutes 25 → 15, moves the brute debut from wave 4 to wave 5 as a solo 3-brute wave, and nudges `rewardMult` off a cliff edge.

**Files:**
- Modify: `src/data/waves.js` — the `0:` array
- Modify: `src/data/maps.js` — map id 0, `rewardMult`

- [ ] **Step 1: Replace the map 0 wave table**

In `src/data/waves.js`, replace the entire `0: [ ... ],` block with:

```js
  // Level 1 is the gentlest map in the campaign by construction: the lowest
  // HP-per-wave of any map, and the brute debuts ALONE on wave 5 (360 HP)
  // before wave 6 doubles up (780 HP). That ordering is the point -- an archer
  // opening does 5 DPS to a brute, so the mismatch has to be shown on a wave
  // the player can survive learning from. Pinned by waves.test.js.
  0: [
    [{ type: 'drone',   count: 6,  interval: 1200 }],
    [{ type: 'drone',   count: 8,  interval: 1100 }, { type: 'skitter', count: 3, interval: 950  }],
    [{ type: 'skitter', count: 8,  interval: 850  }],
    [{ type: 'drone',   count: 10, interval: 1000 }],
    [{ type: 'brute',   count: 3,  interval: 1400 }],
    [{ type: 'drone',   count: 6,  interval: 1000 }, { type: 'brute',   count: 3, interval: 1400 }],
    [{ type: 'drone',   count: 8,  interval: 950  }, { type: 'skitter', count: 5, interval: 750  }],
    [{ type: 'brute',   count: 5,  interval: 1150 }, { type: 'skitter', count: 5, interval: 700  }],
    [{ type: 'drone',   count: 8,  interval: 900  }, { type: 'brute',   count: 4, interval: 1050 }, { type: 'skitter', count: 6, interval: 750 }],
    [{ type: 'drone',   count: 16, interval: 750  }],
  ],
```

- [ ] **Step 2: Nudge map 0's `rewardMult`**

In `src/data/maps.js`, inside the map with `id: 0` (Outpost Sigma), change:

```js
    rewardMult: 0.30,
```

to:

```js
    // 0.35, matching Lunar Gate, is not about the gold -- the trimmed wave
    // table clears this map at 0.30 too. It is about where the calibration
    // SITS: at 0.30 a 5g drop takes the map from 64% of lives kept to 24%,
    // so it balanced one step above a cliff. At 0.35 the 125-140g band is a
    // uniform 64-76% and survives small future changes to rewards or the
    // wave-clear bonus.
    rewardMult: 0.35,
```

Leave `startGold: 130` and `startLives: 25` untouched.

- [ ] **Step 3: Verify the ramp tests now pass**

```bash
npx vitest run src/data/waves.test.js
```

Expected: the two `on-ramp difficulty ramp` tests and both `brute before it tests it` tests **pass**. The `totalEnemyHpForMap > map 0 ships 8800 base enemy HP` test now **fails** with `expected 7220 to be 8800` — that is Task 3's job. Do not touch it yet.

- [ ] **Step 4: Confirm the numbers landed**

```bash
node --input-type=module -e "
import { MAPS } from './src/data/maps.js';
import { MAP_WAVES, totalEnemyHpForMap } from './src/data/waves.js';
const brutes = MAP_WAVES[0].flat().filter(g => g.type === 'brute').reduce((s, g) => s + g.count, 0);
console.log('hp', totalEnemyHpForMap(0), 'brutes', brutes, 'rewardMult', MAPS[0].rewardMult, 'gold', MAPS[0].startGold);
"
```

Expected output exactly: `hp 7220 brutes 15 rewardMult 0.35 gold 130`

- [ ] **Step 5: Commit**

```bash
git add src/data/waves.js src/data/maps.js
git commit -m "balance(map0): make Level 1 the gentlest map in the campaign

Trims total HP 8800 -> 7220 and brutes 25 -> 15, and moves the brute
debut from wave 4 (four at once, 480 HP) to wave 5 (three alone, 360 HP)
so the archer mismatch is revealed before it is punished.

rewardMult 0.30 -> 0.35 buys robustness rather than power: the trimmed
table clears at 0.30 as well, but 0.30 sits one 5g step above a 40-point
cliff, where 0.35 is a uniform plateau across 125-140g.

Moves map 0's hero XP thresholds with it (they are fractions of map HP);
measured as benign -- the hero still reaches L5 on the same damage."
```

---

## Task 3: Retune Level 3 (map 2) and update the HP budget table

Trims map 2 from 12,330 to 11,000 HP and raises its economy. **These numbers are provisional** — the spec records that the simulator shows 5 monotonicity inversions in 11 steps on this map, so it cannot resolve map 2 at this granularity. `170 / 0.40` is the most stable cell found, not a derived answer. Carry that uncertainty into the comment.

**Files:**
- Modify: `src/data/waves.js` — the `2:` array
- Modify: `src/data/maps.js` — map id 2, `startGold` and `rewardMult`
- Modify: `src/data/waves.test.js` — the `EXPECTED` table

- [ ] **Step 1: Replace the map 2 wave table**

In `src/data/waves.js`, replace the entire `2: [ ... ],` block with:

```js
  // Trimmed 12330 -> 11000 to smooth the on-ramp: HP per wave now runs
  // 722 -> 812 -> 917 across maps 0-2 instead of 880 -> 812 -> 1028.
  2: [
    [{ type: 'drone',   count: 8,  interval: 1100 }],
    [{ type: 'skitter', count: 6,  interval: 900  }],
    [{ type: 'drone',   count: 10, interval: 1000 }, { type: 'skitter', count: 4, interval: 850 }],
    [{ type: 'brute',   count: 4,  interval: 1300 }],
    [{ type: 'drone',   count: 10, interval: 950  }, { type: 'brute',   count: 3, interval: 1300 }],
    [{ type: 'skitter', count: 8,  interval: 800  }, { type: 'brute',   count: 3, interval: 1200 }],
    [{ type: 'drone',   count: 10, interval: 900  }, { type: 'skitter', count: 6, interval: 780  }],
    [{ type: 'brute',   count: 6,  interval: 1100 }],
    [{ type: 'drone',   count: 10, interval: 850  }, { type: 'brute',   count: 4, interval: 1100 }],
    [{ type: 'skitter', count: 10, interval: 750  }, { type: 'brute',   count: 5, interval: 1000 }],
    [{ type: 'drone',   count: 14, interval: 800  }, { type: 'skitter', count: 8, interval: 700  }],
    [{ type: 'drone',   count: 18, interval: 650  }, { type: 'brute',   count: 6, interval: 900  }],
  ],
```

- [ ] **Step 2: Raise map 2's economy**

In `src/data/maps.js`, inside the map with `id: 2` (The Crater), change `startGold: 130,` to `startGold: 170,` and `rewardMult: 0.30,` to `rewardMult: 0.40,`, with this comment above them:

```js
    // PROVISIONAL -- playtest-tunable, not derived. The balance simulator
    // cannot resolve this map: sweeping startGold in 5g steps gives five
    // monotonicity inversions in eleven (more gold, worse outcome), because
    // greedyBuildPlan's towerValue ignores armour and the weakness matrix and
    // this map's 11 slots and tier-3 cap compound that mis-ranking. 170/0.40
    // is the most stable cell found (a three-wide plateau at 165/170/175g).
    // Expect to retune after a human plays it.
    startGold: 170,
```

- [ ] **Step 3: Update the HP budget table**

In `src/data/waves.test.js`, in the `totalEnemyHpForMap` describe, change the `EXPECTED` map to:

```js
  const EXPECTED = {
    0:  7220, 1:  8120, 2: 11000, 3: 10770, 4: 18500,
    5: 18080, 6: 24440, 7: 31430, 8: 40970, 9: 59780,
  };
```

Only entries `0` and `2` change. Leave the explanatory comment above it as it is — it is what made this coupling visible, and it is still accurate.

- [ ] **Step 4: Run the data tests**

```bash
npx vitest run src/data/waves.test.js src/data/maps.test.js
```

Expected: **all pass**. `maps.test.js` asserts only that `rewardMult` is a number in `(0, 1]`, which 0.35 and 0.40 both satisfy.

- [ ] **Step 5: Confirm the ramp**

```bash
node --input-type=module -e "
import { MAP_WAVES, totalEnemyHpForMap } from './src/data/waves.js';
const r = [0,1,2].map(i => Math.round(totalEnemyHpForMap(i) / MAP_WAVES[i].length));
console.log('HP per wave, maps 0-2:', r.join(' -> '));
"
```

Expected output exactly: `HP per wave, maps 0-2: 722 -> 812 -> 917`

- [ ] **Step 6: Commit**

```bash
git add src/data/waves.js src/data/maps.js src/data/waves.test.js
git commit -m "balance(map2): smooth Level 3 into the on-ramp

Trims 12330 -> 11000 HP so HP per wave runs 722 -> 812 -> 917 across
maps 0-2 rather than spiking 27% at map 2, and raises startGold 130 ->
170 and rewardMult 0.30 -> 0.40 so the map is winnable at all.

Flags these numbers PROVISIONAL in the source: the simulator shows five
monotonicity inversions in eleven steps on this map, so it cannot resolve
map 2 and these are a playtest starting point, not a derived answer."
```

---

## Task 4: Fix the deficit test's hardcoded assumption

`src/sim/deficit.test.js` asserts that map 0 "needs help" — it hardcodes the brokenness this change removes, exactly like the old `VALID_TYPES` list that made the suite enforce dead content. `findWinMultiplier`'s contract is "find the multiplier that wins", which is a property of the function, not of any shipped map's calibration. Repoint it at a synthetic under-resourced map so no future balance change can break it again.

**Files:**
- Modify: `src/sim/deficit.test.js:25-32` (the `returns a multiplier above 1 for a map that needs help` test)

- [ ] **Step 1: Confirm the test fails for the expected reason**

```bash
npx vitest run src/sim/deficit.test.js
```

Expected: `returns a multiplier above 1 for a map that needs help` fails with `expected 1 to be greater than 1` — map 0 is now winnable unmodified, which is the goal of this whole change.

- [ ] **Step 2: Replace the test**

In `src/sim/deficit.test.js`, replace this test:

```js
  it('returns a multiplier above 1 for a map that needs help', () => {
    const m = findWinMultiplier(map0, waves0, { buildPlan: greedyBuildPlan });
    if (m !== null) {
      expect(m).toBeGreaterThan(1);
      expect(m).toBeLessThanOrEqual(8);
    }
  });
```

with:

```js
  // Deliberately synthetic, not a shipped map. This used to pass map 0 and
  // assert the result was > 1 -- which quietly made the suite depend on map 0
  // being UNWINNABLE, so recalibrating it into a beatable first level broke a
  // test of arithmetic that has nothing to do with campaign balance. Starving
  // a map of gold is a property of the fixture, so it stays true whatever the
  // campaign is tuned to.
  it('returns a multiplier above 1 for a map that needs help', () => {
    const starved = { ...map0, startGold: 60, startLives: 5 };
    const m = findWinMultiplier(starved, waves0, { buildPlan: greedyBuildPlan });
    expect(m).not.toBeNull();
    expect(m).toBeGreaterThan(1);
    expect(m).toBeLessThanOrEqual(8);
  });
```

Note the assertion got *stronger*: the old `if (m !== null)` guard meant the whole test silently passed when `findWinMultiplier` returned null. The new version asserts non-null outright.

- [ ] **Step 3: Run the test**

```bash
npx vitest run src/sim/deficit.test.js
```

Expected: **4 passed**. The starved fixture yields a multiplier of ~1.96.

- [ ] **Step 4: Commit**

```bash
git add src/sim/deficit.test.js
git commit -m "test(sim): stop asserting that map 0 is unwinnable

findWinMultiplier's contract is about arithmetic, not about any shipped
map's calibration, but the test passed map 0 and required the result to
exceed 1 -- so making Level 1 beatable broke it. Uses a deliberately
starved synthetic map instead, and drops the if (m !== null) guard that
let the test pass silently when the helper returned null."
```

---

## Task 5: Full verification

A green suite is not a playable map. The shipped calibration passed every test.

- [ ] **Step 1: Full test suite**

```bash
npm run test
```

Expected: **84 test files, 1172 tests, 0 failures** (1168 baseline + 4 new from Task 1). Report the actual count. If anything fails, stop and investigate — do not adjust a test to match.

- [ ] **Step 2: Balance simulator**

```bash
npm run balance
```

Expected in the first table — maps 0, 1 and 2 all show a verdict of `OK`, none `UNWINNABLE`, and the `needs` column reads `1x` (or blank) for all three:

```
0  Outpost Sigma           10/10   ...  OK  kept ~68% of lives
1  Lunar Gate              10/10   ...  OK  kept ~35% of lives
2  The Crater              12/12   ...  OK  kept ~30% of lives
```

Maps 3–9 are **expected to remain UNWINNABLE** — they are explicitly out of scope. Do not tune them.

- [ ] **Step 3: Production build**

```bash
npm run build
```

Expected: exits 0, writes `dist/`. (Vite copies only `public/` — unrelated to this change, but the build must stay clean.)

- [ ] **Step 4: Live browser verification — the whole point of this change**

```bash
npm run preview
```

Open the preview URL the command prints (do **not** assume a port — 3000 and 4173 are frequently held by other projects; confirm you are hitting this app and unregister any stale service worker).

Play **Level 1 end to end** and confirm:
1. The overworld node for Outpost Sigma is labelled **1**.
2. Wave 4 is ten drones, and wave 5 is three brutes **alone**.
3. The map is beatable. Record how many of the 25 lives remain.
4. The hero reaches level 5 by the end (the XP bar under the HP bar fills four times).

Then start **Level 3 (The Crater)** and confirm it opens with **170 gold**.

- [ ] **Step 5: Record the two follow-ups the spec raises**

Append these to the Prioritized Backlog in `.claude/notes.md` (edit it directly — no permission needed; write atomically, since it is subject to read/write races):

```markdown
N. `[review]` **Make `greedyBuildPlan` matchup-aware** — `towerValue` in
   `src/sim/buildPolicy.js` is `damage * fireRate / cost`, ignoring armour and
   the weakness matrix. It is why the balance simulator shows 5 monotonicity
   inversions in 11 steps on map 2 and cannot be used to tune any map past
   map 1. Until this lands, every per-map number beyond the on-ramp is a guess
   dressed as a measurement. Raised by the 2026-09-20 on-ramp recalibration.
N+1. `[review]` **Re-examine maps 3–9 difficulty** — the sim calls 9 of 10 maps
   unwinnable, but it also plays badly (see above). Establish whether that is a
   real calibration problem or an artefact of the model, AFTER the build policy
   is fixed. Also closes the pre-existing map 2 -> map 3 HP-per-wave inversion
   (917 vs 898) that the on-ramp change shrank but did not remove.
```

Use the next free numbers in the existing list rather than the literal `N`.

- [ ] **Step 6: Report**

State, with raw output, not summary: the test count, the `npm run balance` verdict rows for maps 0–2, and the Level 1 playthrough result including lives remaining. If Level 1 is now *too* easy in real play, say so — the simulator is pessimistic and 68% kept may translate to a walkover, which is a real finding and the reason this task exists.

---

## Out of scope — do not do these

- **Map 1 (Level 2) — do not touch it, in `maps.js` or `waves.js`.** It is the only map the simulator currently rates healthy (`OK`, 35% of lives kept), so it is the fixed reference the other two are ordered against. Tuning it to "smooth the ramp" would remove the one calibrated point in the range and make the whole comparison circular. If the ramp test fails, change map 0 or map 2, never map 1.
- **Maps 3–9.** They will still report `UNWINNABLE`. That is expected and documented.
- **Tower or enemy constants** — the archer's 0.75-vs-brute multiplier, brute `armor: 8`, the floor-of-1 rule in `src/systems/damage.js`. Campaign-wide; would invalidate all ten maps.
- **`greedyBuildPlan`'s matchup-blindness** in `src/sim/buildPolicy.js`. It is the root cause of the simulator's unreliability and deserves its own backlog item, but it is not a prerequisite here.
- **`.claude/notes.md` status sections** — the Current Status, In Progress and Loose Ends prose is updated only after the PR is open, as the last step. Task 5 Step 5 appends two *backlog* items and is the one exception; do not rewrite the status narrative before then.
