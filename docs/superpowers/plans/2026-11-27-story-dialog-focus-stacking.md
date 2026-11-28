# Story Dialog Focus and Stacking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Story Log replay hands focus back to `#open-story-log`, and the story dialog stacks above every in-page floater.

**Architecture:**
- (a) Focus the opener before hiding the list, so `StoryDialogOverlay`'s existing restore returns there.
- (b) One CSS value, plus a test that derives every z-index in `index.html`.

**Tech Stack:** Vanilla JS, Vitest + jsdom.

**Spec:** `docs/superpowers/specs/2026-11-27-story-dialog-focus-stacking-design.md`

## Global Constraints

- `.story-dialog-overlay` gets `z-index:55`. Only `#title-screen` (60) and `#rotate-prompt` (1000) may be at or above it.
- `StoryDialogOverlay.js` gets a comment fix only; its behaviour doesn't change.
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Stage explicit paths only. Never pipe test output through tail or head. Never `git stash`.

## Review Focus

1. A keyboard-finished replay (Escape) must also land on `#open-story-log`, not only a Skip click.
2. The z-index test must derive values from the real `index.html` `<style>`, including the `@media` blocks. It must not use a hand list of floaters.

---

### Task 1: Story Log replay returns focus to `#open-story-log` (#55a)

**Files:**
- Modify: `src/scenes/MapSelectScene.js` (`_bindStoryLog`, the entry click handler ~676-679)
- Modify: `src/ui/StoryDialogOverlay.js` (comment above `_restoreFocus` ~339-340 only)
- Test: `src/scenes/MapSelectScene.worldMap.test.js` (new describe at the end of the file's top-level `describe('MapSelectScene world map', ...)`, using its `beforeEach`/`afterEach`, `makeScene`, `seedSave`, `passGuard` and `scenes` array)

- [ ] **Step 1: Write the failing tests**

```js
  describe('Story Log replay focus (#55a)', () => {
    const replay = () => {
      seedSave(PARTIAL);
      const scene = makeScene();
      scenes.push(scene);
      scene.create({});
      passGuard();
      $('#open-story-log').click();
      $('.story-log-entry').click();
      expect($('#story-dialog').style.display).toBe('flex');
    };

    it('returns focus to #open-story-log when the replay is skipped', () => {
      replay();
      $('#story-dialog-skip').click();
      expect($('#story-dialog').style.display).toBe('none');
      expect(document.activeElement).toBe($('#open-story-log'));
    });

    it('returns focus to #open-story-log when the replay is closed by Escape', () => {
      replay();
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
      expect($('#story-dialog').style.display).toBe('none');
      expect(document.activeElement).toBe($('#open-story-log'));
    });
  });
```

  If Escape doesn't close the dialog in this harness, find the key that `StoryDialogOverlay._onKeyDown` treats as "finish" and use it. Say which one in the report.

- [ ] **Step 2: Run to verify they fail.** `npx vitest run src/scenes/MapSelectScene.worldMap.test.js -t "55a"`. Expected: both FAIL. `activeElement` is the `.story-log-entry` button, because jsdom lets a hidden button keep focus; in a browser it's `<body>`.

- [ ] **Step 3: Implement.** In the entry click handler, add `openBtn.focus();` as the first line, before `overlay.style.display = 'none';`. Add a one-line comment saying why: the clicked entry is about to be hidden, so the dialog must record the opener as its return target. In `StoryDialogOverlay.js`, change the comment above `_restoreFocus` so its example no longer says a Story Log entry falls to `<body>`. For example: "Back to where the player was, unless that element is gone: then focus falls to <body>."

- [ ] **Step 4: Run the file again.** Expected: all PASS.

- [ ] **Step 5: Mutation check.** Remove the `openBtn.focus()` line and confirm both new tests fail. Paste the raw output, then restore.

- [ ] **Step 6: Commit**

```bash
git add src/scenes/MapSelectScene.js src/ui/StoryDialogOverlay.js src/scenes/MapSelectScene.worldMap.test.js
git commit -m "fix(story-log): a replay returns focus to the Story Log button (#55a)"
```

### Task 2: the story dialog stacks above every in-page floater (#55b)

**Files:**
- Modify: `index.html` (`.story-dialog-overlay` rule, ~402: `z-index:18` → `z-index:55`)
- Create: `src/ui/storyDialogStacking.test.js`

- [ ] **Step 1: Write the failing test** in `src/ui/storyDialogStacking.test.js`:

```js
// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// The story dialog is a full-screen modal that traps Tab. #game makes no
// stacking context, so its z-index competes with every positioned element on
// the page (#55b: inspectors at 40 painted over the victory epilogue at 18).
const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
const css = html.match(/<style>([\s\S]*?)<\/style>/)[1].replace(/\/\*[\s\S]*?\*\//g, '');

// Every `selector { ... z-index: N ... }`, @media bodies included: the regex
// takes the innermost selector text before each declaration block.
const zRules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
  .map(([, sel, body]) => ({ sel: sel.trim(), z: body.match(/z-index\s*:\s*(-?\d+)/)?.[1] }))
  .filter(r => r.z !== undefined)
  .map(r => ({ sel: r.sel, z: Number(r.z) }));

const ABOVE_DIALOG = ['#title-screen', '#rotate-prompt'];
const dialogZ = zRules.find(r => r.sel === '.story-dialog-overlay')?.z;

describe('story dialog stacking (#55b)', () => {
  it('finds the dialog rule and a realistic number of z-index rules', () => {
    expect(dialogZ).toBeTypeOf('number');
    expect(zRules.length).toBeGreaterThan(20);
  });

  it('sits above every z-index on the page except the title screen and rotate prompt', () => {
    const over = zRules.filter(r => r.sel !== '.story-dialog-overlay'
      && !ABOVE_DIALOG.includes(r.sel) && r.z >= dialogZ);
    expect(over).toEqual([]);
  });

  it('stays below the title screen and the rotate prompt', () => {
    for (const sel of ABOVE_DIALOG) {
      const r = zRules.find(x => x.sel === sel);
      expect(r, sel).toBeDefined();
      expect(r.z, sel).toBeGreaterThan(dialogZ);
    }
  });
});
```

- [ ] **Step 2: Run it.** `npx vitest run src/ui/storyDialogStacking.test.js`. Expected:
  - the middle test FAILS, listing `.inspector-panel` (40), `#tower-tooltip` (50), `.story-banner` (25) and the others;
  - the other two tests PASS.

  Paste the failure. If the first test fails because the regex misses the dialog rule or finds ≤ 20 rules, fix the parsing (not the threshold), and explain the fix in the report.

- [ ] **Step 3: Implement.** In `index.html`, change `.story-dialog-overlay`'s `z-index:18` to `z-index:55`. Add a CSS comment on that rule saying why: it's a modal and must clear every in-page floater (≤ 50), but stays under `#title-screen` and `#rotate-prompt`. Extend the existing comment block just above the rule, which ends "src/ui/storyDialogCss.test.js guards all of this."; also name `src/ui/storyDialogStacking.test.js` for the z-index. Also update the stale `#rotate-prompt` comment (~918, "highest in-page z-index is 50") to say the highest in-page z-index is the story dialog's 55. The title-screen comment (~874-875) is still true; leave it.

- [ ] **Step 4: Run the new file, then `npm run test`.** Expected: all PASS. Record the file/test counts and the exit code.

- [ ] **Step 5: Mutation check.**
  - (a) Set the dialog back to 18: the middle test fails.
  - (b) Temporarily add `#fake-floater { position:absolute; z-index: 56; }` to the style block: the middle test fails and names `#fake-floater`.

  Paste both failures, restore, and show `git diff --stat` for only the intended files.

- [ ] **Step 6: Commit**

```bash
git add index.html src/ui/storyDialogStacking.test.js
git commit -m "fix(story-dialog): stack the dialog above every in-page floater (#55b)"
```
