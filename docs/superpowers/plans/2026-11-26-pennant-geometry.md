# Pennant Geometry Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move `pennantCorners` and `growTriangle` out of `GameScene.js` into a pure, unit-tested `src/systems/pennantGeometry.js`, with no change on screen.

**Architecture:** A new pure module. GameScene imports it and passes `RALLY_FLAG.pennant` explicitly.

**Tech Stack:** Vanilla JS ES modules, Vitest + jsdom.

**Spec:** `docs/superpowers/specs/2026-11-26-pennant-geometry-design.md`

## Global Constraints

- No behaviour change. `src/scenes/GameScene.rally.test.js` and `src/scenes/GameScene.reposition.test.js` must pass **without edits**.
- `growTriangle`'s body and its explanatory comment move verbatim.
- `pennantCorners(x, top, { w, h })` takes the size as its third argument. `pennantGeometry.js` imports nothing.
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Stage explicit paths only. Never pipe test output through tail or head.

## Review Focus

1. Both GameScene call sites pass `RALLY_FLAG.pennant`. A missing argument would destructure `undefined` and throw on the first rally draw. The scene tests catch this, so confirm they ran.
2. The local copies are deleted from GameScene, not left as dead duplicates.
3. The new tests assert the geometric property (edges move out by exactly d), not only one snapshot of coordinates.

---

### Task 1: pennantGeometry module

**Files:**
- Create: `src/systems/pennantGeometry.js`
- Create: `src/systems/pennantGeometry.test.js`
- Modify: `src/scenes/GameScene.js`. Delete the local `pennantCorners` and `growTriangle` (~lines 114-133), add an import beside the other `../systems/` imports (~line 96), and change the call sites in `_drawFlagHalo` (~2547) and `_drawFlagMarks` (~2554) to `pennantCorners(x, top, RALLY_FLAG.pennant)`.

**Interfaces:**
- Produces: `export function pennantCorners(x, top, { w, h })` → `[{x,y}, {x,y}, {x,y}]` (pole top, tip, down the pole); `export function growTriangle([A, B, C], d)` → `[{x,y}, {x,y}, {x,y}]`.

- [ ] **Step 1: Write the failing tests** in `src/systems/pennantGeometry.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { pennantCorners, growTriangle } from './pennantGeometry.js';

// Signed distance from point p to the line through a→b, positive on the side away from c.
function outwardDist(p, a, b, c) {
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  const cross = (q) => ((b.x - a.x) * (q.y - a.y) - (b.y - a.y) * (q.x - a.x)) / len;
  return -Math.sign(cross(c)) * cross(p);
}

describe('pennantCorners', () => {
  it('puts the pole top, the tip w out at half height, and the foot h down the pole', () => {
    expect(pennantCorners(100, 50, { w: 10, h: 7 })).toEqual([
      { x: 100, y: 50 }, { x: 110, y: 53.5 }, { x: 100, y: 57 },
    ]);
  });
});

describe('growTriangle', () => {
  const pennant = pennantCorners(100, 50, { w: 10, h: 7 });
  const right = [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 0, y: 3 }];

  it('returns the same corners for d = 0', () => {
    growTriangle(right, 0).forEach((p, i) => {
      expect(p.x).toBeCloseTo(right[i].x, 9);
      expect(p.y).toBeCloseTo(right[i].y, 9);
    });
  });

  for (const [name, tri] of [['pennant', pennant], ['3-4-5', right]]) {
    for (const d of [2, 3]) {
      it(`moves every edge of the ${name} triangle out by exactly ${d}`, () => {
        const g = growTriangle(tri, d);
        for (const [i, j, k] of [[0, 1, 2], [1, 2, 0], [2, 0, 1]]) {
          // The grown edge's endpoints both sit d outside the original edge: parallel and d out.
          expect(outwardDist(g[i], tri[i], tri[j], tri[k])).toBeCloseTo(d, 9);
          expect(outwardDist(g[j], tri[i], tri[j], tri[k])).toBeCloseTo(d, 9);
        }
      });
    }
  }
});
```

- [ ] **Step 2: Run the new test to verify it fails**

Run: `npx vitest run src/systems/pennantGeometry.test.js`
Expected: FAIL. The import fails because `./pennantGeometry.js` doesn't exist.

- [ ] **Step 3: Implement.** Create `src/systems/pennantGeometry.js` holding the two exports. Move `growTriangle` and its comment verbatim. `pennantCorners` keeps its comment and destructures `{ w, h }` from the third argument. Then edit `GameScene.js` as listed under Files.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/systems/pennantGeometry.test.js src/scenes/GameScene.rally.test.js src/scenes/GameScene.reposition.test.js`
Expected: all PASS, with no edits to the two scene test files.
Then run `npm run test` and record the file and test counts and the exit code.

- [ ] **Step 5: Mutation check.** Paste the raw failure for each, then restore.
  - (a) In `growTriangle`, change `const k = (r + d) / r;` to `const k = (r + 2 * d) / r;`. Expected: the "moves every edge … by exactly" tests fail.
  - (b) In `pennantCorners`, change the tip to `top + h / 3`. Expected: the `pennantCorners` test fails.
  - (c) In GameScene, drop the third argument at the `_drawFlagMarks` call site. Expected: `GameScene.rally.test.js` fails (it throws destructuring undefined).

- [ ] **Step 6: Commit**

```bash
git add src/systems/pennantGeometry.js src/systems/pennantGeometry.test.js src/scenes/GameScene.js
git commit -m "refactor(barracks): move pennant geometry to src/systems (#65b)"
```
