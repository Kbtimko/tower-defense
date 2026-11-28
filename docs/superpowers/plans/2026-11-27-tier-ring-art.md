# Tier Ring on Art Towers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Towers with sprite art no longer draw the r=18 tier stroke ring; art-less fallback towers keep the disc and the ring.

**Architecture:** Move the stroke into `Tower._redraw`'s existing no-art branch.

**Tech Stack:** Vanilla JS, Vitest + jsdom.

**Spec:** `docs/superpowers/specs/2026-11-27-tier-ring-art-design.md`

## Global Constraints

- Only `src/entities/Tower.js` and `src/entities/Tower.test.js` change.
- Fallback stroke widths stay `[1.5, 2, 3, 4][level - 1]`, radius 18, colour `def.color`.
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Stage explicit paths only. Never pipe test output through tail or head.

## Review Focus

1. An upgrade with art on (which calls `_redraw` again) must not bring the stroke back.
2. The range ring (`_rangeRing`) must still be drawn when art is on.

---

### Task 1: stroke only on the fallback

**Files:**
- Modify: `src/entities/Tower.js` (`_redraw` ~95-110 and the constructor comment ~54-55)
- Test: `src/entities/Tower.test.js` (`describe('Tower tier ring with sprite art active', ...)` ~109-134)

- [ ] **Step 1: Rewrite the tests in that describe.** Rename the describe to `'Tower tier ring (#66: fallback only)'`. Replace its three tests with:

```js
  it('draws neither the ring nor the fill disc when sprite art is active', () => {
    const t = makeTower(makeScene(ARCHER_KEYS));
    expect(t._sprite.active).toBe(true);
    expect(sinceLastClear(t._bg).some(c => c[0] === 'fillCircle')).toBe(false);
    expect(sinceLastClear(t._bg).some(c => c[0] === 'strokeCircle')).toBe(false);
    expect(t._icon.visible).toBe(false);
  });

  it('keeps the ring off after upgrades with art, but still draws the range ring', () => {
    const t = makeTower(makeScene(ARCHER_KEYS));
    t.upgrade(3);
    expect(sinceLastClear(t._bg).some(c => c[0] === 'strokeCircle')).toBe(false);
    t.upgrade(4, 'A');
    expect(sinceLastClear(t._bg).some(c => c[0] === 'strokeCircle')).toBe(false);
    expect(sinceLastClear(t._rangeRing).some(c => c[0] === 'strokeCircle')).toBe(true);
  });

  it('fills the disc and strokes the ring when there is no sprite art (Graphics fallback)', () => {
    const t = makeTower(makeScene([]));
    expect(t._sprite.active).toBe(false);
    expect(sinceLastClear(t._bg).some(c => c[0] === 'fillCircle')).toBe(true);
    expect(sinceLastClear(t._bg).some(c => c[0] === 'strokeCircle')).toBe(true);
    expect(t._icon.visible).toBe(true);
  });

  it('thickens the fallback ring as the tower upgrades', () => {
    const t = makeTower(makeScene([]));
    expect(strokeWidths(t._bg)).toEqual([1.5]);
    t.upgrade(3);
    expect(strokeWidths(t._bg)).toEqual([3]);
  });
```

  If `_rangeRing`'s mock does not record `_calls` the same way `_bg`'s does, assert on what it does record. Say so in the report.

- [ ] **Step 2: Run to verify they fail.** `npx vitest run src/entities/Tower.test.js`. Expected: the first two new tests FAIL (strokeCircle found on `_bg`); the fallback tests pass.

- [ ] **Step 3: Implement.** In `_redraw`, move `this._bg.lineStyle(sw, def.color, 1);` and `this._bg.strokeCircle(0, 0, 18);` inside the `if (!this._sprite?.active)` block. Replace that block's comment with one saying *why*: with art on, the disc would be an opaque plate and the ring clutter over the art; tier reads from the pips, badge and T4 ring instead, which fallback towers lack. In the constructor, change "The tier ring stays." to say the redraw drops the fallback disc and ring.

- [ ] **Step 4: Run the file, then `npm run test`.** Expected: all PASS. Record file/test counts and the exit code.

- [ ] **Step 5: Mutation check.** Move the two stroke lines back outside the block: the two art tests fail. Paste the raw failure, restore, and show `git diff --stat` covers only the two files.

- [ ] **Step 6: Commit**

```bash
git add src/entities/Tower.js src/entities/Tower.test.js
git commit -m "fix(towers): drop the tier stroke ring on towers with art; fallback keeps it (#66)"
```
