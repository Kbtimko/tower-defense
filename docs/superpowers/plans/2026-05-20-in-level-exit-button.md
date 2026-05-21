# In-Level Exit Button Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an in-game "Exit" button that lets the player abandon a level mid-run and return to `MapSelectScene`, with a confirmation dialog and fixes for two related DOM-leak bugs.

**Architecture:** A muted Exit button in the `#bottom-bar` HUD opens a confirmation in the existing `#game-msg` modal. The modal gains a second (Cancel) button so it serves both the Victory/Defeat flow and the new exit-confirm flow. `GameScene.shutdown()` is extended to hide `#tower-panel` and `#game-msg` so GameScene DOM no longer leaks onto subsequent scenes.

**Tech Stack:** Phaser 3.88, vanilla DOM, Vite, Vitest + jsdom.

**Spec:** `docs/superpowers/specs/2026-05-20-in-level-exit-button-design.md`

---

## File Structure

- `index.html` — bottom-bar markup + CSS, `#game-msg` markup (Exit button, Cancel button).
- `src/scenes/GameScene.js` — `_bindDOMEvents()`, new `_showConfirmExit()`, `_showVictoryOverlay()` / `_onDefeat()` state-leak guard, `shutdown()` fixes.
- `src/scenes/GameScene.shutdown.test.js` — new test file for `shutdown()` DOM cleanup.

---

## Task 1: Add Exit and Cancel buttons to index.html

**Files:**
- Modify: `index.html` (CSS block ~line 30; `#game-msg` markup ~line 225; `#bottom-bar` markup ~line 277)

This task is markup/CSS only — no automated test. Verified in Task 4's browser pass.

- [ ] **Step 1: Move `margin-left: auto` off `#wave-btn`**

In the CSS block, replace this rule:

```css
    #wave-btn { margin-left: auto; background: #8b1a1a; border: 2px solid #cc3333;
                color: #fff; padding: 8px 16px; border-radius: 6px; cursor: pointer;
                font-size: 13px; font-weight: bold; }
```

with (drop `margin-left: auto;`):

```css
    #wave-btn { background: #8b1a1a; border: 2px solid #cc3333;
                color: #fff; padding: 8px 16px; border-radius: 6px; cursor: pointer;
                font-size: 13px; font-weight: bold; }
```

- [ ] **Step 2: Add `#exit-btn` CSS**

Immediately after the `#wave-btn:disabled { ... }` rule, add:

```css
    #exit-btn { margin-left: auto; background: #2a1a1a; border: 1px solid #6a4a4a;
                color: #ddaaaa; padding: 8px 14px; border-radius: 6px; cursor: pointer;
                font-size: 13px; }
    #exit-btn:hover { background: #3a2222; border-color: #8a5a5a; }
```

`margin-left: auto` now lives on `#exit-btn`, which is the DOM-first of the
Exit/Send-Wave pair, so both buttons group together at the right edge.

- [ ] **Step 3: Add `#msg-cancel-btn` CSS**

After the `#game-msg button { ... }` rule, add:

```css
    #msg-cancel-btn { background: #333; margin-left: 8px; }
```

- [ ] **Step 4: Add the Exit button to the bottom bar**

In the `#bottom-bar` markup, find:

```html
    <button id="wave-btn">▶ Send Wave 1</button>
  </div>
```

and change it to:

```html
    <button id="exit-btn">⏻ Exit</button>
    <button id="wave-btn">▶ Send Wave 1</button>
  </div>
```

- [ ] **Step 5: Add the Cancel button to `#game-msg`**

In the `#game-msg` markup, find:

```html
    <div id="game-msg">
      <h2 id="msg-title">Victory!</h2>
      <p id="msg-body">You defended humanity!</p>
      <button id="msg-btn">&#8617; Map Select</button>
    </div>
```

and change it to:

```html
    <div id="game-msg">
      <h2 id="msg-title">Victory!</h2>
      <p id="msg-body">You defended humanity!</p>
      <button id="msg-btn">&#8617; Map Select</button>
      <button id="msg-cancel-btn" style="display:none">Cancel</button>
    </div>
```

- [ ] **Step 6: Verify the build**

Run: `npm run build`
Expected: build completes with no errors.

- [ ] **Step 7: Commit**

```bash
git add index.html
git commit -m "feat: add Exit and Cancel buttons to game DOM"
```

---

## Task 2: Fix GameScene.shutdown() DOM leaks (TDD)

**Files:**
- Create: `src/scenes/GameScene.shutdown.test.js`
- Modify: `src/scenes/GameScene.js` (`shutdown()`, lines ~137-148)

`shutdown()` currently hides only `#hud` and `#bottom-bar`, and clones a
hardcoded list of button ids to drop their listeners. This task makes it also
hide `#tower-panel` and `#game-msg`, and adds `exit-btn` / `msg-cancel-btn` to
the clone list.

- [ ] **Step 1: Write the failing test**

Create `src/scenes/GameScene.shutdown.test.js`:

```js
import { describe, it, expect, vi, beforeEach } from 'vitest';

// GameScene and its transitive entity imports extend Phaser classes at
// module-load time, so the mock must supply Scene and GameObjects.Container.
vi.mock('phaser', () => ({
  default: {
    Scene: class {},
    GameObjects: {
      Container: class {
        setDepth() { return this; }
        setVisible() { return this; }
        add() {}
      },
    },
  },
}));

const { default: GameScene } = await import('./GameScene.js');

// Build the DOM fixture programmatically (no innerHTML).
function el(tag, attrs, parent) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'display') node.style.display = v;
    else node[k] = v;
  }
  (parent || document.body).appendChild(node);
  return node;
}

function setupDOM() {
  document.body.textContent = '';
  el('div', { id: 'hud', display: 'flex' });
  el('div', { id: 'tower-panel', display: 'block' });
  const gameMsg = el('div', { id: 'game-msg', display: 'block' });
  el('button', { id: 'msg-btn' }, gameMsg);
  el('button', { id: 'msg-cancel-btn' }, gameMsg);
  const bar = el('div', { id: 'bottom-bar', display: 'flex' });
  el('button', { className: 'tower-btn' }, bar);
  el('button', { id: 'exit-btn' }, bar);
  el('button', { id: 'wave-btn' }, bar);
  el('button', { id: 'speed-btn' });
  el('button', { id: 'panel-upgrade-btn' });
  el('button', { id: 'panel-sell-btn' });
  el('button', { id: 'panel-reposition-btn' });
  el('button', { id: 'story-dismiss' });
}

// shutdown() reads this.game.events.off and this._onAbility; everything else
// it touches is DOM. Build a minimal instance via the prototype.
function makeScene() {
  const scene = Object.create(GameScene.prototype);
  scene.game = { events: { off() {} } };
  scene._onAbility = () => {};
  return scene;
}

describe('GameScene.shutdown', () => {
  beforeEach(setupDOM);

  it('hides hud, bottom-bar, tower-panel and game-msg', () => {
    makeScene().shutdown();
    expect(document.getElementById('hud').style.display).toBe('none');
    expect(document.getElementById('bottom-bar').style.display).toBe('none');
    expect(document.getElementById('tower-panel').style.display).toBe('none');
    expect(document.getElementById('game-msg').style.display).toBe('none');
  });

  it('removes the exit-btn listener by replacing the node', () => {
    const oldExit = document.getElementById('exit-btn');
    const spy = vi.fn();
    oldExit.addEventListener('click', spy);

    makeScene().shutdown();

    const newExit = document.getElementById('exit-btn');
    expect(newExit).not.toBe(oldExit);
    newExit.click();
    expect(spy).not.toHaveBeenCalled();
  });

  it('removes the msg-cancel-btn listener by replacing the node', () => {
    const oldCancel = document.getElementById('msg-cancel-btn');
    const spy = vi.fn();
    oldCancel.addEventListener('click', spy);

    makeScene().shutdown();

    const newCancel = document.getElementById('msg-cancel-btn');
    expect(newCancel).not.toBe(oldCancel);
    newCancel.click();
    expect(spy).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/scenes/GameScene.shutdown.test.js`
Expected: the `hides ... tower-panel and game-msg` test FAILS (`#tower-panel`
and `#game-msg` still `block`), and the `exit-btn` / `msg-cancel-btn` tests
FAIL (those ids are not in the clone list, so the nodes are not replaced).

- [ ] **Step 3: Update `shutdown()` in GameScene.js**

Replace the current `shutdown()` method:

```js
  shutdown() {
    if (import.meta.env.DEV) window.__game = null;
    this.game.events.off('ui:ability', this._onAbility, this);
    // Remove all DOM listeners without tracking refs: clone replaces the node
    ['wave-btn','speed-btn','panel-upgrade-btn','panel-sell-btn','msg-btn','panel-reposition-btn','story-dismiss'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.replaceWith(el.cloneNode(true));
    });
    document.querySelectorAll('.tower-btn').forEach(btn => btn.replaceWith(btn.cloneNode(true)));
    document.getElementById('hud').style.display        = 'none';
    document.getElementById('bottom-bar').style.display = 'none';
  }
```

with:

```js
  shutdown() {
    if (import.meta.env.DEV) window.__game = null;
    this.game.events.off('ui:ability', this._onAbility, this);
    // Remove all DOM listeners without tracking refs: clone replaces the node
    ['wave-btn','speed-btn','panel-upgrade-btn','panel-sell-btn','msg-btn','msg-cancel-btn','exit-btn','panel-reposition-btn','story-dismiss'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.replaceWith(el.cloneNode(true));
    });
    document.querySelectorAll('.tower-btn').forEach(btn => btn.replaceWith(btn.cloneNode(true)));
    document.getElementById('hud').style.display         = 'none';
    document.getElementById('bottom-bar').style.display  = 'none';
    document.getElementById('tower-panel').style.display = 'none';
    document.getElementById('game-msg').style.display    = 'none';
  }
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/scenes/GameScene.shutdown.test.js`
Expected: all 3 tests PASS.

- [ ] **Step 5: Run the full suite for regressions**

Run: `npm test`
Expected: all tests pass (was 169; now 172 with the 3 new tests).

- [ ] **Step 6: Commit**

```bash
git add src/scenes/GameScene.shutdown.test.js src/scenes/GameScene.js
git commit -m "fix: hide tower-panel and game-msg on GameScene shutdown"
```

---

## Task 3: Wire the Exit confirmation flow

**Files:**
- Modify: `src/scenes/GameScene.js` (`_bindDOMEvents()` ~lines 125-135; `_showVictoryOverlay()` ~lines 733-738; `_onDefeat()` ~lines 740-748; add `_showConfirmExit()`)

The Exit flow is DOM + scene-transition behavior verified in the browser
(Task 4), not unit-tested. The `shutdown()` listener cleanup for the new
buttons is already covered by Task 2.

- [ ] **Step 1: Add the Exit and Cancel listeners in `_bindDOMEvents()`**

Find the end of `_bindDOMEvents()`:

```js
    document.getElementById('panel-reposition-btn').addEventListener('click', () => this._startReposition());
    document.getElementById('msg-btn').addEventListener('click', () => this.scene.start('MapSelectScene'));
  }
```

and change it to:

```js
    document.getElementById('panel-reposition-btn').addEventListener('click', () => this._startReposition());
    document.getElementById('msg-btn').addEventListener('click', () => this.scene.start('MapSelectScene'));
    document.getElementById('exit-btn').addEventListener('click', () => this._showConfirmExit());
    document.getElementById('msg-cancel-btn').addEventListener('click', () => {
      document.getElementById('game-msg').style.display = 'none';
    });
  }
```

`#msg-btn`'s existing handler navigates to `MapSelectScene` — it is reused
as-is for the exit-confirm "Abandon Level" action; only its label text differs
between modes.

- [ ] **Step 2: Add the `_showConfirmExit()` method**

Add this method immediately after `_bindDOMEvents()` (before `shutdown()`):

```js
  _showConfirmExit() {
    document.getElementById('msg-title').textContent        = 'Abandon level?';
    document.getElementById('msg-body').textContent         = 'Progress on this level will be lost.';
    document.getElementById('msg-btn').textContent          = 'Abandon Level';
    document.getElementById('msg-cancel-btn').style.display = 'inline-block';
    document.getElementById('game-msg').style.display       = 'block';
  }
```

- [ ] **Step 3: Add the state-leak guard to `_showVictoryOverlay()`**

Find `_showVictoryOverlay()`:

```js
  _showVictoryOverlay(stars) {
    document.getElementById('msg-title').textContent = '🏆 Victory!';
    document.getElementById('msg-body').textContent  =
      starsDisplay(stars) + ' — ' + this.kills + ' kills';
    document.getElementById('game-msg').style.display = 'block';
  }
```

and change it to (reset the shared dialog to single-button mode):

```js
  _showVictoryOverlay(stars) {
    document.getElementById('msg-title').textContent = '🏆 Victory!';
    document.getElementById('msg-body').textContent  =
      starsDisplay(stars) + ' — ' + this.kills + ' kills';
    document.getElementById('msg-btn').textContent          = '↩ Map Select';
    document.getElementById('msg-cancel-btn').style.display = 'none';
    document.getElementById('game-msg').style.display = 'block';
  }
```

(`↩` is the same glyph as the existing `&#8617;` entity in the `#msg-btn`
markup.)

- [ ] **Step 4: Add the state-leak guard to `_onDefeat()`**

Find `_onDefeat()`:

```js
  _onDefeat() {
    if (this.over) return;
    this.over = true;
    this._commitStats(false);
    document.getElementById('msg-title').textContent = '💀 Defeat';
    document.getElementById('msg-body').textContent  = `The line did not hold. Wave ${this.waveMgr.currentWave}.`;
    document.getElementById('game-msg').style.display = 'block';
  }
```

and change it to:

```js
  _onDefeat() {
    if (this.over) return;
    this.over = true;
    this._commitStats(false);
    document.getElementById('msg-title').textContent = '💀 Defeat';
    document.getElementById('msg-body').textContent  = `The line did not hold. Wave ${this.waveMgr.currentWave}.`;
    document.getElementById('msg-btn').textContent          = '↩ Map Select';
    document.getElementById('msg-cancel-btn').style.display = 'none';
    document.getElementById('game-msg').style.display = 'block';
  }
```

- [ ] **Step 5: Verify the build and full suite**

Run: `npm run build && npm test`
Expected: build succeeds; all 172 tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/scenes/GameScene.js
git commit -m "feat: wire in-level Exit button with confirmation dialog"
```

---

## Task 4: Browser verification and notes update

**Files:**
- Modify: `.claude/notes.md`

- [ ] **Step 1: Start the dev server**

Run: `npm run dev`
Note the local URL (typically `http://localhost:5173`).

- [ ] **Step 2: Verify the Abandon path**

In the browser: pick a map and start a level. Place a tower and click it so
`#tower-panel` opens. Click **⏻ Exit** → confirm the `#game-msg` dialog shows
"Abandon level?" with **Abandon Level** + **Cancel** buttons. Click **Abandon
Level**.
Expected: lands on Map Select with NO leftover `#tower-panel` and NO leftover
`#game-msg`.

- [ ] **Step 3: Verify the Cancel path**

Start a level, click **⏻ Exit**, then click **Cancel**.
Expected: the dialog closes and the level resumes (towers still placed, wave
state intact).

- [ ] **Step 4: Verify the Victory path has no stale Cancel button**

Play through and win a map (or use `window.__game` in DEV to reach victory).
Expected: the Victory dialog shows only the single "↩ Map Select" button — no
stray Cancel button. Click it, then open the Upgrades overlay from Map Select.
Expected: no leftover `#game-msg` floating over the upgrade overlay.

- [ ] **Step 5: Update `.claude/notes.md`**

In `.claude/notes.md`:
- Move backlog item 2 ("Add an in-level 'Exit' button...") from the
  Prioritized Backlog to the Completed section as
  `~~In-level Exit button — abandon a run, return to Map Select~~ (2026-05-20)`.
- Remove both entries under "Known Bugs" (the `#tower-panel` leak and the
  `#game-msg` leak) — both are fixed by Task 2.
- Renumber the remaining backlog items.

- [ ] **Step 6: Commit**

```bash
git add .claude/notes.md
git commit -m "docs: mark Exit button done, clear fixed DOM-leak bugs"
```

---

## Self-Review Notes

- **Spec coverage:** Exit button (Task 1) · confirmation via `#game-msg`
  (Tasks 1, 3) · `_showConfirmExit` + wiring (Task 3) · state-leak guard
  (Task 3 Steps 3-4) · `shutdown()` hides `#tower-panel`/`#game-msg` + clones
  new buttons (Task 2) · shutdown tests (Task 2) · browser verification +
  notes follow-up (Task 4). All spec sections mapped.
- **Type consistency:** `_showConfirmExit` and the button ids (`exit-btn`,
  `msg-cancel-btn`, `msg-btn`, `game-msg`, `tower-panel`) are used identically
  across all tasks.
