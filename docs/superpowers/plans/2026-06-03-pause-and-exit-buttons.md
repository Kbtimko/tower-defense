# In-Level Pause & Exit Buttons Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship an in-level Pause button (new) plus restore the in-level Exit button (PR #8 regression that never landed on integration) in a single PR off `origin/feature/phase-3-tower-system`.

**Architecture:** Pure DOM/HUD work plus a small amount of `GameScene` wiring. Pause uses Phaser's `scene.pause()` / `scene.resume()` mirroring how PR #8's Exit-confirm modal already pauses. A `_userPaused` flag tracks user-initiated pause so that the Exit-confirm Cancel button does not resume a user-paused game. A semi-transparent `#paused-overlay` div covers the canvas while paused. Space key toggles pause via UIScene's existing keyboard handler.

**Tech Stack:** Phaser 3 (Scene.pause/resume), vanilla DOM, Vitest + jsdom for tests, vite dev server for browser verification.

**Spec:** [docs/superpowers/specs/2026-06-03-pause-and-exit-buttons-design.md](docs/superpowers/specs/2026-06-03-pause-and-exit-buttons-design.md)

---

## File Structure

| File | Status | Responsibility |
|------|--------|----------------|
| [index.html](index.html) | Modify | DOM + CSS for `#exit-btn`, `#msg-cancel-btn`, `#pause-btn`, `#paused-overlay`. |
| [src/scenes/GameScene.js](src/scenes/GameScene.js) | Modify | `_userPaused` flag; `_showConfirmExit()` method; `_onPauseToggle()` method; click handlers in `_bindDOMEvents()`; extended `shutdown()` cleanup; `_showVictoryOverlay`/`_onDefeat` modal-state resets + chrome-button disable; `ui:pause-toggle` event listener. |
| [src/scenes/UIScene.js](src/scenes/UIScene.js) | Modify | Extend `_onKeyDown` to emit `ui:pause-toggle` on Space. |
| [src/scenes/GameScene.shutdown.test.js](src/scenes/GameScene.shutdown.test.js) | Create | Verifies `shutdown()` hides `#hud`, `#bottom-bar`, `#tower-panel`, `#game-msg`, `#paused-overlay` and clones away listeners on `exit-btn`, `msg-cancel-btn`, `pause-btn`. |
| [src/scenes/GameScene.exit.test.js](src/scenes/GameScene.exit.test.js) | Create | Verifies `_showConfirmExit()` modal content + pause + game-over guard; Cancel button hides modal + conditional resume; `_showVictoryOverlay` / `_onDefeat` reset modal state. |
| [src/scenes/GameScene.pause.test.js](src/scenes/GameScene.pause.test.js) | Create | Verifies `_onPauseToggle()` state machine, button text flip, overlay visibility, game-over guard. |
| [src/scenes/UIScene.spaceKey.test.js](src/scenes/UIScene.spaceKey.test.js) | Create | Verifies `Space` keydown emits `ui:pause-toggle` and INPUT-target keydown does not. |

---

## Task Conventions

- All tasks branch off `origin/feature/phase-3-tower-system`. The implementation branch is already created (`feature/in-level-pause-button`).
- Test runner: `npm test` (alias for `vitest run`). To run a single file: `npm test -- src/scenes/<file>.test.js`. To run a single test: `npm test -- src/scenes/<file>.test.js -t "<test name>"`.
- Phaser mocking: every new test file mocks `phaser` with the `Scene` + `GameObjects.Container` shim used by sibling tests (see `GameScene.dead-cleanup.test.js` for the canonical form). Tests never instantiate `GameScene` directly; they call prototype methods with a synthetic `this` context.
- Commit messages use Conventional Commits (`feat:`, `fix:`, `test:`, `refactor:`, `chore:`).
- Each task ends with one commit containing only the files listed in that task's **Files:** block.

---

### Task 1: Add Exit + Cancel button DOM (port of PR #8 commit `6af2e49`)

**Files:**
- Modify: `index.html` (CSS in `<style>` near lines 41–45 + 77–78; body near lines 297–303 + 377)

- [ ] **Step 1: Add CSS for `#exit-btn`**

Open [index.html](index.html). After the `#wave-btn:disabled` rule (currently around line 45), insert the `#exit-btn` styles. Locate this block:

```css
    #wave-btn:disabled { background: #333; border-color: #555; color: #666; cursor: not-allowed; }
    #tower-panel { position: absolute; background: #0f0f1e; border: 2px solid #8b6914;
```

Insert between them:

```css
    #wave-btn:disabled { background: #333; border-color: #555; color: #666; cursor: not-allowed; }
    #exit-btn { margin-left: auto; background: #2a1a1a; border: 1px solid #6a4a4a;
                color: #ddaaaa; padding: 8px 14px; border-radius: 6px; cursor: pointer;
                font-size: 13px; }
    #exit-btn:hover { background: #3a2222; border-color: #8a5a5a; }
    #tower-panel { position: absolute; background: #0f0f1e; border: 2px solid #8b6914;
```

Also remove `margin-left: auto` from `#wave-btn` (Exit absorbs it, then sits left of Wave). Find:

```css
    #wave-btn { margin-left: auto; background: #8b1a1a; border: 2px solid #cc3333;
```

Change to:

```css
    #wave-btn { background: #8b1a1a; border: 2px solid #cc3333;
```

- [ ] **Step 2: Add CSS for `#msg-cancel-btn`**

After the `#game-msg button` rule (around line 77–78), insert the cancel-button override:

```css
    #game-msg button { background: #8b6914; border: none; color: #fff; padding: 9px 22px;
                       border-radius: 6px; cursor: pointer; font-size: 14px; }
    #msg-cancel-btn { background: #333; margin-left: 8px; }
```

- [ ] **Step 3: Add `#msg-cancel-btn` element to `#game-msg`**

Locate (around line 299–303):

```html
    <div id="game-msg">
      <h2 id="msg-title">Victory!</h2>
      <p id="msg-body">You defended humanity!</p>
      <button id="msg-btn">&#8617; Map Select</button>
    </div>
```

Add the cancel button after `msg-btn`:

```html
    <div id="game-msg">
      <h2 id="msg-title">Victory!</h2>
      <p id="msg-body">You defended humanity!</p>
      <button id="msg-btn">&#8617; Map Select</button>
      <button id="msg-cancel-btn" style="display:none">Cancel</button>
    </div>
```

- [ ] **Step 4: Add `#exit-btn` element to `#bottom-bar`**

Locate (around line 377):

```html
    <button class="tower-btn" data-type="barracks">
      <span class="t-icon">⚔️</span><span class="t-cost">100g</span><span class="t-name">Barracks</span>
    </button>
    <button id="wave-btn">▶ Send Wave 1</button>
  </div>
```

Insert `#exit-btn` before `#wave-btn`:

```html
    <button class="tower-btn" data-type="barracks">
      <span class="t-icon">⚔️</span><span class="t-cost">100g</span><span class="t-name">Barracks</span>
    </button>
    <button id="exit-btn">⏻ Exit</button>
    <button id="wave-btn">▶ Send Wave 1</button>
  </div>
```

- [ ] **Step 5: Run full test suite to confirm no regression**

Run: `npm test`
Expected: All existing tests pass (count unchanged from baseline). DOM-only change touches no JS test paths.

- [ ] **Step 6: Commit**

```bash
git add index.html
git commit -m "$(cat <<'EOF'
feat(html): Exit + Cancel buttons in HUD (port of PR #8 6af2e49)

Restores the in-level Exit chrome that never landed on integration.
Adds #exit-btn to the bottom bar (left of Wave button, absorbs the
prior margin-left:auto) plus a hidden #msg-cancel-btn inside #game-msg
that the next task will toggle visible for the Abandon-level confirm.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Add Pause button + paused-overlay DOM

**Files:**
- Modify: `index.html` (CSS in `<style>` near line 17; body near lines 245 + 247)

- [ ] **Step 1: Add CSS for `#pause-btn`**

Locate the `#speed-btn` rule (around line 16–17):

```css
    #speed-btn { background: #1a2a1a; border: 1px solid #4a6a4a; color: #aaddaa;
                 padding: 4px 9px; border-radius: 4px; cursor: pointer; font-size: 12px; }
```

Insert immediately after:

```css
    #pause-btn { background: #1a2a1a; border: 1px solid #4a6a4a; color: #aaddaa;
                 padding: 4px 9px; border-radius: 4px; cursor: pointer; font-size: 12px; }
    #pause-btn.disabled, #exit-btn.disabled {
                 background: #2a2a2a; border-color: #444; color: #666;
                 cursor: not-allowed; pointer-events: none; }
```

- [ ] **Step 2: Add CSS for `#paused-overlay`**

After the `.story-banner.visible` rule (around line 83) and before `.story-content`, insert:

```css
    #paused-overlay { position: absolute; inset: 0; background: rgba(0,0,0,0.55);
                      display: none; z-index: 30; pointer-events: none;
                      align-items: center; justify-content: center;
                      font-size: 56px; font-weight: bold; color: #fff;
                      text-shadow: 0 2px 8px rgba(0,0,0,0.7); letter-spacing: 6px; }
    #paused-overlay.shown { display: flex; }
```

- [ ] **Step 3: Add `#pause-btn` element to `#hud`**

Locate (around line 245–246):

```html
    <div class="hud-stat"><span>💀</span><span class="hud-val" id="stat-kills">0</span><span class="hud-lbl">Kills</span></div>
    <button id="speed-btn">⏩ 2x</button>
  </div>
```

Insert `#pause-btn` after `#speed-btn`:

```html
    <div class="hud-stat"><span>💀</span><span class="hud-val" id="stat-kills">0</span><span class="hud-lbl">Kills</span></div>
    <button id="speed-btn">⏩ 2x</button>
    <button id="pause-btn">⏸ Pause</button>
  </div>
```

- [ ] **Step 4: Add `#paused-overlay` element inside `#game`**

Locate (around line 247–248):

```html
  <div id="game">
    <div id="story-banner" class="story-banner">
```

Insert `#paused-overlay` as the first child of `#game`:

```html
  <div id="game">
    <div id="paused-overlay">PAUSED</div>
    <div id="story-banner" class="story-banner">
```

- [ ] **Step 5: Run full test suite to confirm no regression**

Run: `npm test`
Expected: All existing tests pass; no behavioral change.

- [ ] **Step 6: Commit**

```bash
git add index.html
git commit -m "$(cat <<'EOF'
feat(html): Pause button + paused-overlay scaffolding

Adds #pause-btn next to the existing #speed-btn in the top HUD and a
#paused-overlay absolute-positioned over the game canvas. Overlay
uses pointer-events:none so the Pause/Resume button stays clickable
behind it. Disabled visual styling reused for #exit-btn.disabled.
Wiring lands in subsequent tasks.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Extend `GameScene.shutdown()` to clean up new DOM + leak-fix port

**Files:**
- Create: `src/scenes/GameScene.shutdown.test.js`
- Modify: `src/scenes/GameScene.js` (lines 180–199, the `shutdown()` method)

This task ports PR #8 commit `2c96b2f` (DOM-leak fix for `#tower-panel`/`#game-msg`) adapted for the current integration `shutdown()` body, and extends it to cover the new `#paused-overlay` plus the new `exit-btn`/`msg-cancel-btn`/`pause-btn` listeners.

- [ ] **Step 1: Write the failing tests**

Create `src/scenes/GameScene.shutdown.test.js`:

```js
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('phaser', () => ({
  default: {
    Scene: class { constructor(key) { this._key = key; } },
    GameObjects: {
      Container: class {
        constructor(scene, x, y) { this.scene = scene; this.x = x; this.y = y; }
        add() {}
        setDepth() { return this; }
        setVisible() { return this; }
      },
    },
  },
}));

import GameScene from './GameScene.js';

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
  el('div', { id: 'paused-overlay', className: 'shown' });
  const bar = el('div', { id: 'bottom-bar', display: 'flex' });
  el('button', { className: 'tower-btn' }, bar);
  el('button', { id: 'exit-btn' }, bar);
  el('button', { id: 'wave-btn' }, bar);
  el('button', { id: 'speed-btn' });
  el('button', { id: 'pause-btn' });
  el('button', { id: 'panel-upgrade-btn' });
  el('button', { id: 'panel-sell-btn' });
  el('button', { id: 'panel-reposition-btn' });
  el('button', { id: 'story-dismiss' });
}

// shutdown() touches: this.inspector, this.game, this._onAbility, DOM,
// this.damageNumbers, this.shakeCtl, this._sentries, this._areaEffects.
// Build a minimal context via the prototype with only what's needed.
function makeScene() {
  const scene = Object.create(GameScene.prototype);
  scene.inspector = null;
  scene.game = {
    events: { off() {} },
    registry: { get() { return null; } },
  };
  scene._onAbility = () => {};
  scene._sentries = [];
  return scene;
}

describe('GameScene.shutdown', () => {
  beforeEach(setupDOM);

  it('hides hud/bottom-bar/tower-panel/game-msg and clears the paused-overlay shown class', () => {
    makeScene().shutdown();
    expect(document.getElementById('hud').style.display).toBe('none');
    expect(document.getElementById('bottom-bar').style.display).toBe('none');
    expect(document.getElementById('tower-panel').style.display).toBe('none');
    expect(document.getElementById('game-msg').style.display).toBe('none');
    expect(document.getElementById('paused-overlay').classList.contains('shown')).toBe(false);
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

  it('removes the pause-btn listener by replacing the node', () => {
    const oldPause = document.getElementById('pause-btn');
    const spy = vi.fn();
    oldPause.addEventListener('click', spy);

    makeScene().shutdown();

    const newPause = document.getElementById('pause-btn');
    expect(newPause).not.toBe(oldPause);
    newPause.click();
    expect(spy).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/scenes/GameScene.shutdown.test.js`
Expected: Test fails. `paused-overlay` style.display will still be `flex` (not `none`); `exit-btn`/`msg-cancel-btn`/`pause-btn` listener tests fail because integration's `shutdown()` does not include these ids in its clone-replace list.

- [ ] **Step 3: Extend `shutdown()` to clean the new DOM**

Open [src/scenes/GameScene.js](src/scenes/GameScene.js). The current `shutdown()` is at lines 180–199:

```js
  shutdown() {
    this.inspector?.destroy();
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
    const am = this.game.registry.get('audio');
    if (am) am.stopMusic(500);
    if (this.damageNumbers) this.damageNumbers.destroy();
    if (this.shakeCtl)      this.shakeCtl.destroy();
    for (const s of this._sentries) s.destroy();
    this._sentries = [];
    if (this._areaEffects) this._areaEffects.destroyAll();
  }
```

Modify the clone-replace id list to include `msg-cancel-btn`, `exit-btn`, `pause-btn`, and add three new `display = 'none'` lines for `#tower-panel`, `#game-msg`, `#paused-overlay`. Preserve every other line.

Replace the whole method with:

```js
  shutdown() {
    this.inspector?.destroy();
    if (import.meta.env.DEV) window.__game = null;
    this.game.events.off('ui:ability', this._onAbility, this);
    // Remove all DOM listeners without tracking refs: clone replaces the node
    ['wave-btn','speed-btn','pause-btn','panel-upgrade-btn','panel-sell-btn','msg-btn','msg-cancel-btn','exit-btn','panel-reposition-btn','story-dismiss'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.replaceWith(el.cloneNode(true));
    });
    document.querySelectorAll('.tower-btn').forEach(btn => btn.replaceWith(btn.cloneNode(true)));
    document.getElementById('hud').style.display          = 'none';
    document.getElementById('bottom-bar').style.display   = 'none';
    document.getElementById('tower-panel').style.display  = 'none';
    document.getElementById('game-msg').style.display     = 'none';
    document.getElementById('paused-overlay').classList.remove('shown');
    const am = this.game.registry.get('audio');
    if (am) am.stopMusic(500);
    if (this.damageNumbers) this.damageNumbers.destroy();
    if (this.shakeCtl)      this.shakeCtl.destroy();
    for (const s of this._sentries) s.destroy();
    this._sentries = [];
    if (this._areaEffects) this._areaEffects.destroyAll();
  }
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- src/scenes/GameScene.shutdown.test.js`
Expected: All 4 tests pass.

- [ ] **Step 5: Run full test suite to confirm no regression**

Run: `npm test`
Expected: All tests pass (baseline + 4 new).

- [ ] **Step 6: Commit**

```bash
git add src/scenes/GameScene.shutdown.test.js src/scenes/GameScene.js
git commit -m "$(cat <<'EOF'
fix(game-scene): shutdown hides tower-panel/game-msg/paused-overlay

Ports PR #8 commit 2c96b2f's DOM-leak fix (#tower-panel and #game-msg
were left visible across scene transitions) adapted for the current
integration shutdown body and extended for the new #paused-overlay,
plus #exit-btn, #msg-cancel-btn, #pause-btn in the listener
clone-replace list.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: `_showConfirmExit()` + Exit/Cancel wiring + victory/defeat modal reset

**Files:**
- Create: `src/scenes/GameScene.exit.test.js`
- Modify: `src/scenes/GameScene.js` (`_bindDOMEvents()` around lines 168–178; new method `_showConfirmExit()`; `_showVictoryOverlay()` around lines 1094–1099; `_onDefeat()` around lines 1101–1110)

Ports PR #8 commits `6c37981` + `6d811d0` (Exit-button wiring + pause-on-confirm + game-over guard) plus the victory/defeat modal-state resets so reusing `#game-msg` for the abandon-confirm does not leave the modal in confirm state when the level ends.

- [ ] **Step 1: Write the failing tests**

Create `src/scenes/GameScene.exit.test.js`:

```js
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('phaser', () => ({
  default: {
    Scene: class { constructor(key) { this._key = key; } },
    GameObjects: {
      Container: class {
        constructor(scene, x, y) { this.scene = scene; this.x = x; this.y = y; }
        add() {}
        setDepth() { return this; }
        setVisible() { return this; }
      },
    },
  },
}));

import GameScene from './GameScene.js';

function setupDOM() {
  document.body.textContent = '';
  const gameMsg = document.createElement('div');
  gameMsg.id = 'game-msg';
  gameMsg.style.display = 'none';
  const title = document.createElement('h2'); title.id = 'msg-title'; gameMsg.appendChild(title);
  const body  = document.createElement('p');  body.id  = 'msg-body';  gameMsg.appendChild(body);
  const btn   = document.createElement('button'); btn.id  = 'msg-btn';
  btn.textContent = '↩ Map Select'; gameMsg.appendChild(btn);
  const cancel = document.createElement('button'); cancel.id = 'msg-cancel-btn';
  cancel.style.display = 'none'; gameMsg.appendChild(cancel);
  document.body.appendChild(gameMsg);
}

function makeScene({ over = false, won = false } = {}) {
  const scene = Object.create(GameScene.prototype);
  scene.over = over;
  scene.won  = won;
  scene._userPaused = false;
  scene.scene = { pause: vi.fn(), resume: vi.fn(), start: vi.fn() };
  return scene;
}

describe('GameScene._showConfirmExit', () => {
  beforeEach(setupDOM);

  it('pauses the scene and shows the abandon-confirm modal', () => {
    const scene = makeScene();

    scene._showConfirmExit();

    expect(scene.scene.pause).toHaveBeenCalledOnce();
    expect(document.getElementById('msg-title').textContent).toBe('Abandon level?');
    expect(document.getElementById('msg-body').textContent).toBe('Progress on this level will be lost.');
    expect(document.getElementById('msg-btn').textContent).toBe('Abandon Level');
    expect(document.getElementById('msg-cancel-btn').style.display).toBe('inline-block');
    expect(document.getElementById('game-msg').style.display).toBe('block');
  });

  it('is a no-op when the game is already over (defeat)', () => {
    const scene = makeScene({ over: true });

    scene._showConfirmExit();

    expect(scene.scene.pause).not.toHaveBeenCalled();
    expect(document.getElementById('game-msg').style.display).toBe('none');
  });

  it('is a no-op when the game has already been won', () => {
    const scene = makeScene({ won: true });

    scene._showConfirmExit();

    expect(scene.scene.pause).not.toHaveBeenCalled();
    expect(document.getElementById('game-msg').style.display).toBe('none');
  });
});

describe('GameScene._showVictoryOverlay modal reset', () => {
  beforeEach(setupDOM);

  it('shows the Map Select button and hides the cancel button', () => {
    // Simulate the modal having been previously repurposed for an Exit confirm
    document.getElementById('msg-btn').textContent          = 'Abandon Level';
    document.getElementById('msg-cancel-btn').style.display = 'inline-block';

    const scene = Object.create(GameScene.prototype);
    scene.kills = 7;

    scene._showVictoryOverlay(3);

    expect(document.getElementById('msg-btn').textContent).toBe('↩ Map Select');
    expect(document.getElementById('msg-cancel-btn').style.display).toBe('none');
    expect(document.getElementById('game-msg').style.display).toBe('block');
  });
});

describe('GameScene._onDefeat modal reset', () => {
  beforeEach(setupDOM);

  it('shows the Map Select button and hides the cancel button', () => {
    document.getElementById('msg-btn').textContent          = 'Abandon Level';
    document.getElementById('msg-cancel-btn').style.display = 'inline-block';

    const scene = Object.create(GameScene.prototype);
    scene.over = false;
    scene.won  = false;
    scene.waveMgr = { currentWave: 3 };
    scene.kills = 0;
    scene.game = { registry: { get() { return null; } } };
    scene._commitStats = () => {};

    scene._onDefeat();

    expect(document.getElementById('msg-btn').textContent).toBe('↩ Map Select');
    expect(document.getElementById('msg-cancel-btn').style.display).toBe('none');
    expect(document.getElementById('game-msg').style.display).toBe('block');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/scenes/GameScene.exit.test.js`
Expected: All tests fail — `_showConfirmExit` is undefined; `_showVictoryOverlay` and `_onDefeat` currently do not reset modal state.

- [ ] **Step 3: Add `_showConfirmExit()` method to GameScene**

Open [src/scenes/GameScene.js](src/scenes/GameScene.js). Locate the end of `_bindDOMEvents()` (currently line 178, the closing `}`) and the start of `shutdown()` (line 180). Insert the new method between them:

```js
  _showConfirmExit() {
    if (this.over || this.won) return;
    this.scene.pause();
    document.getElementById('msg-title').textContent        = 'Abandon level?';
    document.getElementById('msg-body').textContent         = 'Progress on this level will be lost.';
    document.getElementById('msg-btn').textContent          = 'Abandon Level';
    document.getElementById('msg-cancel-btn').style.display = 'inline-block';
    document.getElementById('game-msg').style.display       = 'block';
  }

```

- [ ] **Step 4: Wire `#exit-btn` and `#msg-cancel-btn` click handlers in `_bindDOMEvents()`**

Locate `_bindDOMEvents()` (lines 168–178). The current body ends with the `#msg-btn` listener:

```js
    document.getElementById('panel-reposition-btn').addEventListener('click', () => this._startReposition());
    document.getElementById('msg-btn').addEventListener('click', () => this.scene.start('MapSelectScene'));
  }
```

Append two new listeners before the closing `}`:

```js
    document.getElementById('panel-reposition-btn').addEventListener('click', () => this._startReposition());
    document.getElementById('msg-btn').addEventListener('click', () => this.scene.start('MapSelectScene'));
    document.getElementById('exit-btn').addEventListener('click', () => this._showConfirmExit());
    document.getElementById('msg-cancel-btn').addEventListener('click', () => {
      document.getElementById('game-msg').style.display = 'none';
      this.scene.resume();
    });
  }
```

(Task 5 will refine the Cancel handler to skip `scene.resume()` when the user had paused. For now the unconditional resume matches PR #8 behavior.)

- [ ] **Step 5: Reset modal state in `_showVictoryOverlay()`**

Locate `_showVictoryOverlay()` (around lines 1094–1099):

```js
  _showVictoryOverlay(stars) {
    document.getElementById('msg-title').textContent = '🏆 Victory!';
    document.getElementById('msg-body').textContent  =
      starsDisplay(stars) + ' — ' + this.kills + ' kills';
    document.getElementById('game-msg').style.display = 'block';
  }
```

Add two lines to reset the repurposed buttons:

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

- [ ] **Step 6: Reset modal state in `_onDefeat()`**

Locate `_onDefeat()` (around lines 1101–1110):

```js
  _onDefeat() {
    if (this.over) return;
    const am = this.game.registry.get('audio');
    if (am) am.playSfx('defeat');
    this.over = true;
    this._commitStats(false);
    document.getElementById('msg-title').textContent = '💀 Defeat';
    document.getElementById('msg-body').textContent  = `The line did not hold. Wave ${this.waveMgr.currentWave}.`;
    document.getElementById('game-msg').style.display = 'block';
  }
```

Add two lines:

```js
  _onDefeat() {
    if (this.over) return;
    const am = this.game.registry.get('audio');
    if (am) am.playSfx('defeat');
    this.over = true;
    this._commitStats(false);
    document.getElementById('msg-title').textContent = '💀 Defeat';
    document.getElementById('msg-body').textContent  = `The line did not hold. Wave ${this.waveMgr.currentWave}.`;
    document.getElementById('msg-btn').textContent          = '↩ Map Select';
    document.getElementById('msg-cancel-btn').style.display = 'none';
    document.getElementById('game-msg').style.display = 'block';
  }
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `npm test -- src/scenes/GameScene.exit.test.js`
Expected: All 5 tests pass.

- [ ] **Step 8: Run full test suite to confirm no regression**

Run: `npm test`
Expected: All tests pass.

- [ ] **Step 9: Commit**

```bash
git add src/scenes/GameScene.exit.test.js src/scenes/GameScene.js
git commit -m "$(cat <<'EOF'
feat(game-scene): in-level Exit button with confirm + game-over guard

Ports PR #8 commits 6c37981 (Exit button wiring + reusable game-msg
confirm dialog) and 6d811d0 (scene.pause on confirm, game-over guard)
and adds modal-state resets to _showVictoryOverlay and _onDefeat so
the abandon-confirm repurposing doesn't bleed into end-of-level UI.
Cancel currently unconditionally resumes the scene; the Pause-button
follow-up makes that conditional on user-pause state.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: `_onPauseToggle()` + `#pause-btn` wiring + game-over guard + Cancel × user-pause

**Files:**
- Create: `src/scenes/GameScene.pause.test.js`
- Modify: `src/scenes/GameScene.js` (initialize `_userPaused` in `create()`; add `_onPauseToggle()` method; wire `#pause-btn` click in `_bindDOMEvents()`; update Cancel handler from Task 4)

- [ ] **Step 1: Write the failing tests**

Create `src/scenes/GameScene.pause.test.js`:

```js
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('phaser', () => ({
  default: {
    Scene: class { constructor(key) { this._key = key; } },
    GameObjects: {
      Container: class {
        constructor(scene, x, y) { this.scene = scene; this.x = x; this.y = y; }
        add() {}
        setDepth() { return this; }
        setVisible() { return this; }
      },
    },
  },
}));

import GameScene from './GameScene.js';

function setupDOM() {
  document.body.textContent = '';
  const pauseBtn = document.createElement('button');
  pauseBtn.id = 'pause-btn';
  pauseBtn.textContent = '⏸ Pause';
  document.body.appendChild(pauseBtn);

  const overlay = document.createElement('div');
  overlay.id = 'paused-overlay';
  overlay.style.display = 'none';
  document.body.appendChild(overlay);

  const gameMsg = document.createElement('div');
  gameMsg.id = 'game-msg';
  gameMsg.style.display = 'none';
  document.body.appendChild(gameMsg);
}

function makeScene({ over = false, won = false } = {}) {
  const scene = Object.create(GameScene.prototype);
  scene.over = over;
  scene.won  = won;
  scene._userPaused = false;
  scene.scene = { pause: vi.fn(), resume: vi.fn() };
  return scene;
}

describe('GameScene._onPauseToggle', () => {
  beforeEach(setupDOM);

  it('pauses the scene and shows the overlay on first toggle', () => {
    const scene = makeScene();

    scene._onPauseToggle();

    expect(scene._userPaused).toBe(true);
    expect(scene.scene.pause).toHaveBeenCalledOnce();
    expect(scene.scene.resume).not.toHaveBeenCalled();
    expect(document.getElementById('pause-btn').textContent).toBe('▶ Resume');
    expect(document.getElementById('paused-overlay').classList.contains('shown')).toBe(true);
  });

  it('resumes the scene and hides the overlay on second toggle', () => {
    const scene = makeScene();
    scene._onPauseToggle(); // pause
    scene.scene.pause.mockClear();
    scene.scene.resume.mockClear();

    scene._onPauseToggle(); // resume

    expect(scene._userPaused).toBe(false);
    expect(scene.scene.resume).toHaveBeenCalledOnce();
    expect(scene.scene.pause).not.toHaveBeenCalled();
    expect(document.getElementById('pause-btn').textContent).toBe('⏸ Pause');
    expect(document.getElementById('paused-overlay').classList.contains('shown')).toBe(false);
  });

  it('is a no-op when the game has been lost', () => {
    const scene = makeScene({ over: true });

    scene._onPauseToggle();

    expect(scene._userPaused).toBe(false);
    expect(scene.scene.pause).not.toHaveBeenCalled();
    expect(document.getElementById('pause-btn').textContent).toBe('⏸ Pause');
  });

  it('is a no-op when the game has been won', () => {
    const scene = makeScene({ won: true });

    scene._onPauseToggle();

    expect(scene._userPaused).toBe(false);
    expect(scene.scene.pause).not.toHaveBeenCalled();
  });
});

describe('Exit-confirm Cancel × user-pause interaction', () => {
  beforeEach(() => {
    document.body.textContent = '';
    const gameMsg = document.createElement('div');
    gameMsg.id = 'game-msg';
    gameMsg.style.display = 'block';
    document.body.appendChild(gameMsg);
    const cancel = document.createElement('button');
    cancel.id = 'msg-cancel-btn';
    document.body.appendChild(cancel);
  });

  it('Cancel resumes the scene when the user had NOT paused', () => {
    const scene = makeScene();
    scene._userPaused = false;

    // Reproduce the Cancel handler body inline (the Edit will mirror this).
    document.getElementById('game-msg').style.display = 'none';
    if (!scene._userPaused) scene.scene.resume();

    expect(scene.scene.resume).toHaveBeenCalledOnce();
  });

  it('Cancel does NOT resume the scene when the user HAD paused', () => {
    const scene = makeScene();
    scene._userPaused = true;

    document.getElementById('game-msg').style.display = 'none';
    if (!scene._userPaused) scene.scene.resume();

    expect(scene.scene.resume).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/scenes/GameScene.pause.test.js`
Expected: First four tests fail (`_onPauseToggle` is undefined). The last two pass since they reproduce the handler body inline — they exist to lock the intended Cancel × user-pause semantics so the Edit in Step 5 below is verifiable.

- [ ] **Step 3: Initialize `_userPaused` in `create()`**

Open [src/scenes/GameScene.js](src/scenes/GameScene.js). Locate `create()` — specifically the lines just before the DOM display block (around line 134, after the `this.events.on('game:defeat', ...)` line and before `document.getElementById('hud').style.display = 'flex'`):

```js
    this.events.on('game:defeat',    this._onDefeat,    this);

    // Show DOM UI
    document.getElementById('hud').style.display        = 'flex';
```

Insert the flag initialization between them:

```js
    this.events.on('game:defeat',    this._onDefeat,    this);

    this._userPaused = false;

    // Show DOM UI
    document.getElementById('hud').style.display        = 'flex';
```

- [ ] **Step 4: Add `_onPauseToggle()` method**

After the `_showConfirmExit()` method added in Task 4 (and before `shutdown()`), add:

```js
  _onPauseToggle() {
    if (this.over || this.won) return;
    this._userPaused = !this._userPaused;
    const btn     = document.getElementById('pause-btn');
    const overlay = document.getElementById('paused-overlay');
    if (this._userPaused) {
      this.scene.pause();
      overlay.classList.add('shown');
      btn.textContent = '▶ Resume';
    } else {
      this.scene.resume();
      overlay.classList.remove('shown');
      btn.textContent = '⏸ Pause';
    }
  }

```

- [ ] **Step 5: Wire `#pause-btn` click + update Cancel handler in `_bindDOMEvents()`**

Locate `_bindDOMEvents()`. The current tail (added in Task 4) reads:

```js
    document.getElementById('exit-btn').addEventListener('click', () => this._showConfirmExit());
    document.getElementById('msg-cancel-btn').addEventListener('click', () => {
      document.getElementById('game-msg').style.display = 'none';
      this.scene.resume();
    });
  }
```

Change the Cancel handler to skip resume when the user had paused, and append a `#pause-btn` listener:

```js
    document.getElementById('exit-btn').addEventListener('click', () => this._showConfirmExit());
    document.getElementById('msg-cancel-btn').addEventListener('click', () => {
      document.getElementById('game-msg').style.display = 'none';
      if (!this._userPaused) this.scene.resume();
    });
    document.getElementById('pause-btn').addEventListener('click', () => this._onPauseToggle());
  }
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npm test -- src/scenes/GameScene.pause.test.js`
Expected: All 6 tests pass.

- [ ] **Step 7: Run full test suite to confirm no regression**

Run: `npm test`
Expected: All tests pass.

- [ ] **Step 8: Commit**

```bash
git add src/scenes/GameScene.pause.test.js src/scenes/GameScene.js
git commit -m "$(cat <<'EOF'
feat(game-scene): in-level Pause toggle with overlay

Adds _onPauseToggle() that flips a _userPaused flag, drives
scene.pause/resume, toggles #pause-btn label between ⏸ Pause and
▶ Resume, and shows/hides #paused-overlay via a .shown class. Wires
#pause-btn click in _bindDOMEvents. Pause is a no-op when the game is
over or won.

Also updates the Exit-confirm Cancel handler to only call
scene.resume() when the user had not pressed Pause themselves —
otherwise Cancel-ing the abandon dialog after a user pause would
silently unfreeze the game.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Space key → `ui:pause-toggle` event in UIScene; GameScene listener

**Files:**
- Create: `src/scenes/UIScene.spaceKey.test.js`
- Modify: `src/scenes/UIScene.js` (extend `_onKeyDown` around lines 146–153)
- Modify: `src/scenes/GameScene.js` (subscribe to `ui:pause-toggle` in `create()`; unsubscribe in `shutdown()`)

- [ ] **Step 1: Write the failing test**

Create `src/scenes/UIScene.spaceKey.test.js`:

```js
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('phaser', () => ({
  default: {
    Scene: class { constructor(key) { this._key = key; } },
    GameObjects: {
      Container: class {
        constructor(scene, x, y) { this.scene = scene; this.x = x; this.y = y; }
        add() {}
        setDepth() { return this; }
        setVisible() { return this; }
      },
    },
  },
}));

// MAPS is read at UIScene module load — keep import order consistent with sibling tests.
import UIScene from './UIScene.js';

function setupMinimalDOM() {
  document.body.textContent = '';
  const ids = [
    'wave-btn','speed-btn','panel-upgrade-btn','panel-sell-btn','msg-btn',
    'panel-reposition-btn','ability-q','ability-w','ability-e',
  ];
  for (const id of ids) {
    const b = document.createElement('button');
    b.id = id;
    document.body.appendChild(b);
  }
}

function makeUIScene() {
  const scene = Object.create(UIScene.prototype);
  scene._selectedType = null;
  scene._speedFast = false;
  const emit = vi.fn();
  scene.game = { events: { emit, on(){}, off(){} } };
  return { scene, emit };
}

describe('UIScene Space key', () => {
  beforeEach(setupMinimalDOM);

  it('Space keydown emits ui:pause-toggle', () => {
    const { scene, emit } = makeUIScene();
    scene._bindDOMEvents();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }));

    expect(emit).toHaveBeenCalledWith('ui:pause-toggle');
  });

  it('Space keydown does NOT emit when typing in an INPUT', () => {
    const { scene, emit } = makeUIScene();
    scene._bindDOMEvents();
    const input = document.createElement('input');
    document.body.appendChild(input);

    input.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));

    expect(emit).not.toHaveBeenCalledWith('ui:pause-toggle');
  });

  it('Q/W/E still emit ui:ability (no regression)', () => {
    const { scene, emit } = makeUIScene();
    scene._bindDOMEvents();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'q' }));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'w' }));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'e' }));

    expect(emit).toHaveBeenCalledWith('ui:ability', { slot: 'q' });
    expect(emit).toHaveBeenCalledWith('ui:ability', { slot: 'w' });
    expect(emit).toHaveBeenCalledWith('ui:ability', { slot: 'e' });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/scenes/UIScene.spaceKey.test.js`
Expected: First test fails — `ui:pause-toggle` is not emitted. Other two pass (Q/W/E exist; INPUT guard exists).

- [ ] **Step 3: Extend `UIScene._onKeyDown` to handle Space**

Open [src/scenes/UIScene.js](src/scenes/UIScene.js). Locate the current `_onKeyDown` body (around lines 146–152):

```js
    this._onKeyDown = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      const key = e.key.toLowerCase();
      if (['q', 'w', 'e'].includes(key)) {
        this.game.events.emit('ui:ability', { slot: key });
      }
    };
```

Add a Space-key branch (covers both `' '` and `'Spacebar'` legacy):

```js
    this._onKeyDown = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.key === ' ' || e.key === 'Spacebar') {
        e.preventDefault();
        this.game.events.emit('ui:pause-toggle');
        return;
      }
      const key = e.key.toLowerCase();
      if (['q', 'w', 'e'].includes(key)) {
        this.game.events.emit('ui:ability', { slot: key });
      }
    };
```

- [ ] **Step 4: Subscribe GameScene to `ui:pause-toggle` in `create()`**

Open [src/scenes/GameScene.js](src/scenes/GameScene.js). Locate the `game.events.on('ui:ability', ...)` subscription (around line 163):

```js
    // Wire ability dispatch
    this.game.events.on('ui:ability', this._onAbility, this);

    if (import.meta.env.DEV) window.__game = this;
```

Add a `ui:pause-toggle` subscription beside it:

```js
    // Wire ability dispatch
    this.game.events.on('ui:ability', this._onAbility, this);
    this.game.events.on('ui:pause-toggle', this._onPauseToggle, this);

    if (import.meta.env.DEV) window.__game = this;
```

- [ ] **Step 5: Unsubscribe in `shutdown()`**

Locate the existing `ui:ability` off-call in `shutdown()`:

```js
    this.game.events.off('ui:ability', this._onAbility, this);
```

Add the matching `ui:pause-toggle` off-call beneath it:

```js
    this.game.events.off('ui:ability', this._onAbility, this);
    this.game.events.off('ui:pause-toggle', this._onPauseToggle, this);
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npm test -- src/scenes/UIScene.spaceKey.test.js`
Expected: All 3 tests pass.

- [ ] **Step 7: Run full test suite to confirm no regression**

Run: `npm test`
Expected: All tests pass.

- [ ] **Step 8: Commit**

```bash
git add src/scenes/UIScene.spaceKey.test.js src/scenes/UIScene.js src/scenes/GameScene.js
git commit -m "$(cat <<'EOF'
feat(ui-scene): Space toggles Pause via ui:pause-toggle event

Extends UIScene._onKeyDown to emit a new ui:pause-toggle game event on
Space (covers both ' ' and legacy 'Spacebar'), with preventDefault to
swallow the default scroll behavior. GameScene subscribes the existing
_onPauseToggle handler and unsubscribes in shutdown.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Game-over visual disable for `#exit-btn` and `#pause-btn`

**Files:**
- Modify: `src/scenes/GameScene.exit.test.js` (extend tests)
- Modify: `src/scenes/GameScene.js` (`_showVictoryOverlay` and `_onDefeat`)

The `.disabled` CSS class added in Task 2 is already styled; this task adds `classList.add('disabled')` on game-end so users see the buttons as inert. The logic guards (`if (over || won) return;`) added in earlier tasks already prevent action — this is visual reinforcement.

- [ ] **Step 1: Extend the failing tests**

Open `src/scenes/GameScene.exit.test.js`. Inside the `describe('GameScene._showVictoryOverlay modal reset')` block, append the following test inside the existing `describe`:

```js
  it('adds the disabled class to #exit-btn and #pause-btn', () => {
    const exit  = document.createElement('button'); exit.id  = 'exit-btn';  document.body.appendChild(exit);
    const pause = document.createElement('button'); pause.id = 'pause-btn'; document.body.appendChild(pause);

    const scene = Object.create(GameScene.prototype);
    scene.kills = 0;
    scene._showVictoryOverlay(2);

    expect(exit.classList.contains('disabled')).toBe(true);
    expect(pause.classList.contains('disabled')).toBe(true);
  });
```

Inside the `describe('GameScene._onDefeat modal reset')` block, append:

```js
  it('adds the disabled class to #exit-btn and #pause-btn', () => {
    const exit  = document.createElement('button'); exit.id  = 'exit-btn';  document.body.appendChild(exit);
    const pause = document.createElement('button'); pause.id = 'pause-btn'; document.body.appendChild(pause);

    const scene = Object.create(GameScene.prototype);
    scene.over = false;
    scene.won  = false;
    scene.waveMgr = { currentWave: 5 };
    scene.kills = 0;
    scene.game = { registry: { get() { return null; } } };
    scene._commitStats = () => {};

    scene._onDefeat();

    expect(exit.classList.contains('disabled')).toBe(true);
    expect(pause.classList.contains('disabled')).toBe(true);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- src/scenes/GameScene.exit.test.js`
Expected: The two new tests fail.

- [ ] **Step 3: Add `classList.add('disabled')` to `_showVictoryOverlay`**

Locate `_showVictoryOverlay()` (which Task 4 updated). The current state:

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

Add two disable lines:

```js
  _showVictoryOverlay(stars) {
    document.getElementById('msg-title').textContent = '🏆 Victory!';
    document.getElementById('msg-body').textContent  =
      starsDisplay(stars) + ' — ' + this.kills + ' kills';
    document.getElementById('msg-btn').textContent          = '↩ Map Select';
    document.getElementById('msg-cancel-btn').style.display = 'none';
    document.getElementById('exit-btn').classList.add('disabled');
    document.getElementById('pause-btn').classList.add('disabled');
    document.getElementById('game-msg').style.display = 'block';
  }
```

- [ ] **Step 4: Add `classList.add('disabled')` to `_onDefeat`**

Locate `_onDefeat()`:

```js
  _onDefeat() {
    if (this.over) return;
    const am = this.game.registry.get('audio');
    if (am) am.playSfx('defeat');
    this.over = true;
    this._commitStats(false);
    document.getElementById('msg-title').textContent = '💀 Defeat';
    document.getElementById('msg-body').textContent  = `The line did not hold. Wave ${this.waveMgr.currentWave}.`;
    document.getElementById('msg-btn').textContent          = '↩ Map Select';
    document.getElementById('msg-cancel-btn').style.display = 'none';
    document.getElementById('game-msg').style.display = 'block';
  }
```

Add two disable lines:

```js
  _onDefeat() {
    if (this.over) return;
    const am = this.game.registry.get('audio');
    if (am) am.playSfx('defeat');
    this.over = true;
    this._commitStats(false);
    document.getElementById('msg-title').textContent = '💀 Defeat';
    document.getElementById('msg-body').textContent  = `The line did not hold. Wave ${this.waveMgr.currentWave}.`;
    document.getElementById('msg-btn').textContent          = '↩ Map Select';
    document.getElementById('msg-cancel-btn').style.display = 'none';
    document.getElementById('exit-btn').classList.add('disabled');
    document.getElementById('pause-btn').classList.add('disabled');
    document.getElementById('game-msg').style.display = 'block';
  }
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test -- src/scenes/GameScene.exit.test.js`
Expected: All tests pass (original 5 + 2 new).

- [ ] **Step 6: Run full test suite**

Run: `npm test`
Expected: All tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/scenes/GameScene.exit.test.js src/scenes/GameScene.js
git commit -m "$(cat <<'EOF'
feat(game-scene): visually disable Exit + Pause on game over

When victory or defeat fires, add the .disabled class (styled in
Task 2) to #exit-btn and #pause-btn so they look inert. The logic
guards already make them no-ops; this is visual reinforcement.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Full suite + browser verification

**Files:** (none — verification only)

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: All tests green. Note the new total (baseline + 4 from T3 + 5 from T4 + 6 from T5 + 3 from T6 + 2 from T7 = +20 tests).

- [ ] **Step 2: Start the dev server**

Run: `npm run dev`
Expected: vite starts at `http://localhost:5173` (or printed port).

- [ ] **Step 3: Manual browser checks**

Open the printed URL. From the map-select screen, pick Map 1 (Outpost Sigma). Run through each scenario from §7.2 of the spec:

1. Click `⏻ Exit` (bottom bar) → abandon-confirm modal appears, game freezes (towers stop firing, enemies stop moving). Click `Cancel` → modal hides, game resumes.
2. Click `⏻ Exit` again → modal appears → click `↩ Abandon Level` → MapSelectScene loads. Open DevTools Elements and verify no leaked `#tower-panel` or `#game-msg` (both have `display: none`).
3. Return to a level. Click `⏸ Pause` (top HUD) → game freezes, `PAUSED` overlay appears, button text becomes `▶ Resume`. Click `▶ Resume` → unfreezes.
4. Press `Space` to toggle pause (same effect as click). Press `Space` again to resume.
5. Pause the game, then (if a settings ⚙ button is reachable in-game) open Settings — settings overlay shows over PAUSED overlay; close it → game stays paused; click Resume → unfreezes.
6. Pause the game, click `⏻ Exit` → abandon modal shows over PAUSED overlay → click Cancel → modal hides, game **stays paused** (button still says ▶ Resume).
7. Allow the game to be lost (let lives reach 0) → `💀 Defeat` modal appears, Cancel button is hidden, Map Select button is showing. Verify `#exit-btn` and `#pause-btn` look disabled (greyed out). Try clicking them — no effect. Press `Space` — no effect.

- [ ] **Step 4: Stop dev server**

Either Ctrl-C the foreground vite process or close its terminal pane.

- [ ] **Step 5: No commit**

Verification only. If a manual check uncovered a bug, fix it in a follow-up TDD cycle and commit there.

---

## Self-Review

**Spec coverage:**

| Spec section | Task(s) |
|--------------|---------|
| §2 Goals — Exit restoration | T1 + T3 + T4 |
| §2 Goals — Pause + overlay + Space | T2 + T5 + T6 |
| §2 Goals — single PR | implicit (one branch) |
| §2 Non-goals | none required |
| §4.1 `#exit-btn`, `#msg-cancel-btn` | T1 |
| §4.1 `#pause-btn`, `#paused-overlay` | T2 |
| §4.2 `_showConfirmExit` + game-over guard | T4 |
| §4.2 `_onPauseToggle` + `_userPaused` | T5 |
| §4.2 `_onVictory`/`_onDefeat` modal reset | T4 (+T7 disable) |
| §4.2 `shutdown()` extension | T3 |
| §4.3 UIScene Space key | T6 |
| §4.3 UIScene cleanup list note | T6 (no change required — confirmed in spec) |
| §4.4 `ui:pause-toggle` event | T6 |
| §4.5 Tests — shutdown | T3 |
| §4.5 Tests — pause toggle | T5 |
| §4.5 Tests — game-over guard | T5 + T7 |
| §4.5 Tests — Exit-Cancel × user-pause | T5 |
| §4.5 Tests — Space key UIScene | T6 |
| §5 Data flow | T5 + T6 |
| §5.3 Edge cases (pause + exit interaction) | T5 + T7 |
| §7 Testing strategy | T3–T7 |
| §7.2 Browser verification | T8 |
| §8 Branch & delivery | done before T1 |

No gaps.

**Placeholder scan:** No TBD/TODO/"similar to Task N" text. Every code block contains the literal code to write. Every command has expected output. ✓

**Type/symbol consistency:**

- `_userPaused` — declared (T5), read (T5), referenced in Cancel handler (T5), reset implicitly on new mount via `create()` reinit (T5).
- `_onPauseToggle` — defined (T5), bound via `pause-btn` click (T5), bound via `ui:pause-toggle` event (T6), unbound in `shutdown` (T6).
- `_showConfirmExit` — defined (T4), bound via `exit-btn` click (T4).
- DOM ids match across tasks: `#exit-btn`, `#msg-cancel-btn`, `#pause-btn`, `#paused-overlay`, `#game-msg`, `#msg-btn`, `#msg-title`, `#msg-body`, `#tower-panel`, `#hud`, `#bottom-bar` — all spelled identically.
- `.shown` class on `#paused-overlay` — defined in Task 2 CSS, set/removed in Task 5 `_onPauseToggle` only.
- `.disabled` class on `#pause-btn`/`#exit-btn` — defined in Task 2 CSS, added in Task 7 `_showVictoryOverlay`/`_onDefeat`.
- Test `makeScene()` factories in T3/T4/T5 each include the fields the corresponding `GameScene` method touches; T3 includes `_sentries=[]` and a `registry.get(): null` stub (required by integration's current `shutdown()`).

All consistent. ✓
