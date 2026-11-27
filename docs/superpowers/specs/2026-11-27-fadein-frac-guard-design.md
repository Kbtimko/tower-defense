# Ember fade-in edge values — design (#69d)

**Backlog:** #69(d) `[auto]` (from the #49 final reviews). Self-approved under the `[auto]` rule. Small change: a test only.

## The ask, literally

> (d) `fadeInFrac` 0/1 would NaN the ember envelope.

## What I found

The claim doesn't hold for the current code. `emberPose` (`src/systems/tierLookMath.js:44`) reads:

```js
alpha = phase < cfg.fadeInFrac ? phase / cfg.fadeInFrac : (1 - phase) / (1 - cfg.fadeInFrac);
```

- `fadeInFrac = 0`: `phase < 0` is never true, so it never divides by 0. The alpha is `1 − phase`, an instant pop-in followed by a linear fade.
- `fadeInFrac = 1`: `phase` comes from `frac(x)`, which is in `[0, 1)` for `x ≥ 0`, so `phase < 1` always holds and it never divides by `1 − 1`. The alpha is `phase`, a linear rise followed by a pop-out at the seam.

**Measured:** I called `emberPose` with the shipped `TIER_EMBERS`, overriding `fadeInFrac` to 0 and then to 1. That's 100,001 time steps across one period × 3 embers, or 300,003 samples per value. Both gave **0 non-finite alphas**, with alphas in [0, 1].

A NaN needs `phase === 1` with `fadeInFrac === 1`. In floating point, `frac(x)` returns exactly 1 only for a tiny *negative* `x` (`-1e-17 − floor(-1e-17) === 1`). The clock is `GameScene._fxTime`, which starts at 0 and only adds `delta / 1000`. Phaser's `TimeStep.step` clamps that delta with `Math.max(0, time - this.lastTime)` (`node_modules/phaser/src/core/TimeStep.js`), and `i / count ≥ 0`, so this is unreachable. The only production caller is `TowerTierLook.updateLook`, which passes the frozen `TIER_EMBERS`. Values outside [0, 1] are already rejected by `tierLooks.test.js` ("fractions and alphas lie in [0,1]").

**Root cause of the backlog entry:** it read the two divisions without the branch that guards each one.

## Design

Close the item as not a bug, and pin the guard with one test in `src/systems/tierLookMath.test.js`: for `fadeInFrac` 0 and 1, `emberPose` returns a finite alpha in [0, 1] across a full period, for every ember. This is a regression pin, not a bug fix. A refactor to `Math.min(phase / f, (1 − phase) / (1 − f))` would produce `Infinity`/`NaN` at those values, and this test is what would catch it.

## Approaches

1. **Pin with a test, no code change (chosen).** The behaviour is already correct.
2. Add a clamp or guard in `emberPose`. That would be defensive code for an unreachable input (YAGNI).
3. Close the item in notes only. Then the next refactor could reintroduce the bug the item feared, unseen.

## Rulings (mine)

- **Close #69(d) as not a bug instead of "fixing" it.** If wrong: approach 2 is a one-line clamp.
- **No failing-first test.** There is no bug to reproduce. The test's strength is shown by a mutation instead: rewriting the envelope in the `Math.min` form must make it fail.
- **No live browser check.** Nothing at runtime changes. The measurement above ran against the real module and the shipped data.

## Edge cases

| Case | Expected |
|---|---|
| `fadeInFrac` 0 | finite, in [0, 1], 1 at phase 0 |
| `fadeInFrac` 1 | finite, in [0, 1], 0 at phase 0 |
| the shipped 0.15 | unchanged (existing tests) |
| a negative clock | unreachable (`_fxTime ≥ 0`); not pinned |
