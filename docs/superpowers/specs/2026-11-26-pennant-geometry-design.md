# Pennant geometry out of GameScene — design (#65b)

**Backlog:** #65(b) `[auto]` (from the #48 final reviews). Self-approved under the `[auto]` rule. Small change: a pure refactor, no behaviour change.

## The ask, literally

> (b) `pennantCorners`/`growTriangle` are pure geometry inside GameScene — move to `src/systems/`.

## Why

`GameScene.js` is ~2,500 lines, and CLAUDE.md asks that pure logic live outside the scene so Vitest can exercise it directly. Today these two functions are module-private, so they're covered only through the scene's Graphics mock (`expectFlagOnHalo` in `GameScene.rally.test.js`). Moving them gives the incentre maths its own unit tests.

## Design

- New module `src/systems/pennantGeometry.js` exporting:
  - `pennantCorners(x, top, { w, h })`: returns the pennant's three corners: pole top `{x, y: top}`, tip `{x: x + w, y: top + h/2}`, and down the pole `{x, y: top + h}`. The size is now a parameter, so the module has no data import. This matches `rallyTarget.js`, which takes `range` and `tapRadius` in.
  - `growTriangle([A, B, C], d)`: unchanged body and comment, moved verbatim.
- `GameScene.js` deletes both local functions, imports the two exports, and passes `RALLY_FLAG.pennant` at its two `pennantCorners` call sites (`_drawFlagHalo`, `_drawFlagMarks`).
- No drawing changes. The scene tests stay unchanged and must pass untouched. They are the proof that nothing moved on screen.

## Approaches

1. **New `pennantGeometry.js` (chosen).** One concern per module, matching `rallyTarget.js` and `soldierMarch.js`.
2. Fold into `soldierMarch.js`. That module is about marching and route dots, not flag shape, so it would mix concerns.
3. A generic `triangle.js` for `growTriangle` alone. Speculative: it has one caller.

## Rulings (mine)

- **`pennantCorners` takes the pennant size as a parameter** instead of importing `RALLY_FLAG`. That keeps the module pure. If wrong: one import, and the call sites drop an argument.
- **No guard for a degenerate triangle** (inradius 0 divides by zero). The only input is the frozen `RALLY_FLAG.pennant` `{ w: 10, h: 7 }`, which `soldiers.test.js` pins exactly. If wrong: a one-line guard later.

## Edge cases

| Case | Expected |
|---|---|
| `growTriangle(t, 0)` | returns the same corners |
| `growTriangle(t, d)`, any non-degenerate t | each edge moves out by exactly d (parallel, inradius r → r + d, same incentre) |
| scalene vs. isoceles input (pennant is isoceles) | both hold; the test uses a 3-4-5 right triangle as well as the pennant |
| scene drawing, every rally/move/route state | pixel calls identical; the existing scene tests pass unchanged |
