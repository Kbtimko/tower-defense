// Codex reachability from inside a level: the pause handshake mirrors the
// exit-confirm dialog's existing rule (GameScene._showConfirmExit /
// msg-cancel-btn) — opening pauses a running game, but never overrides a
// deliberate player pause, and closing resumes ONLY if the player hadn't
// paused on their own. Reading a stat block must never cost lives.
//
// These tests drive the REAL GameScene.prototype._openCodex, _onPauseToggle
// and shutdown against a REAL CodexOverlay and real DOM — not a local
// replica of the handshake — the same approach GameScene.wavePreview.test.js
// uses for the wave-preview wiring.

vi.mock('phaser', () => ({
  default: {
    Scene: class { constructor(key) { this._key = key; } },
    GameObjects: {
      Container: class {
        constructor(scene, x, y) { this.scene = scene; this.x = x; this.y = y; }
        add() {}
        setDepth() { return this; }
      },
    },
  },
}));

import { describe, it, expect, beforeEach, vi } from 'vitest';
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

// Mirrors GameScene.shutdown.test.js's setupDOM (shutdown() unconditionally
// touches all of these ids), plus #open-codex and the #codex-overlay markup
// whose refs CodexOverlay's constructor caches — see index.html's
// #codex-overlay block.
function setupDOM() {
  document.body.textContent = '';
  el('div', { id: 'hud', display: 'flex' });
  el('button', { id: 'open-codex' });
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

  const codex  = el('div', { id: 'codex-overlay', display: 'none' });
  const inner  = el('div', {}, codex);
  const header = el('div', {}, inner);
  const tabs   = el('div', { id: 'codex-tabs' }, header);
  for (const tab of ['towers', 'heroes', 'enemies']) {
    const btn = el('button', { className: 'codex-tab' }, tabs);
    btn.dataset.tab = tab;
  }
  el('button', { id: 'codex-close' }, header);
  const body = el('div', {}, inner);
  el('div', { id: 'codex-list' },   body);
  el('div', { id: 'codex-detail' }, body);
}

function makeScene({ over = false, won = false, userPaused = false } = {}) {
  const scene = Object.create(GameScene.prototype);
  scene.over = over;
  scene.won  = won;
  scene._userPaused = userPaused;
  scene.scene = { pause: vi.fn(), resume: vi.fn() };
  // No 'save' registered — buildCatalog(progressFromSave(null)) must still
  // work, same tolerance already covered in codexCatalog's own tests.
  scene.game  = { registry: { get: () => null } };
  return scene;
}

describe('GameScene._openCodex pause handshake', () => {
  beforeEach(setupDOM);

  it('pauses a running game on open and resumes it on close', () => {
    const scene = makeScene();
    scene._openCodex();

    expect(scene.scene.pause).toHaveBeenCalledOnce();
    expect(document.getElementById('codex-overlay').style.display).toBe('flex');

    document.getElementById('codex-close').click();

    expect(scene.scene.resume).toHaveBeenCalledOnce();
    expect(document.getElementById('codex-overlay').style.display).toBe('none');
  });

  it('changes nothing when the player had already paused, and stays paused on close', () => {
    const scene = makeScene({ userPaused: true });
    scene._openCodex();

    expect(scene.scene.pause).not.toHaveBeenCalled();

    document.getElementById('codex-close').click();

    expect(scene.scene.resume).not.toHaveBeenCalled();
  });

  it('stays paused on close when the player pauses behind the overlay after opening it', () => {
    const scene = makeScene();
    scene._openCodex(); // running -> pauses
    expect(scene.scene.pause).toHaveBeenCalledOnce();

    // Player hits Pause while the codex is open.
    scene._onPauseToggle();
    expect(scene._userPaused).toBe(true);

    document.getElementById('codex-close').click();

    expect(scene.scene.resume).not.toHaveBeenCalled();
  });

  it('does not open when the level is already over', () => {
    const scene = makeScene({ over: true });
    scene._openCodex();

    expect(scene.scene.pause).not.toHaveBeenCalled();
    expect(document.getElementById('codex-overlay').style.display).toBe('none');
  });

  it('does not open when the level has already been won', () => {
    const scene = makeScene({ won: true });
    scene._openCodex();

    expect(scene.scene.pause).not.toHaveBeenCalled();
    expect(document.getElementById('codex-overlay').style.display).toBe('none');
  });

  it('closes and resumes via the Escape key, not just the close button', () => {
    const scene = makeScene();
    scene._openCodex();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    expect(scene.scene.resume).toHaveBeenCalledOnce();
    expect(document.getElementById('codex-overlay').style.display).toBe('none');
  });

  it('closes and resumes via a backdrop click', () => {
    const scene = makeScene();
    scene._openCodex();

    // Dispatched directly on the overlay element itself (not a descendant),
    // matching CodexOverlay's `e.target === this._overlay` backdrop check.
    document.getElementById('codex-overlay').dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(scene.scene.resume).toHaveBeenCalledOnce();
    expect(document.getElementById('codex-overlay').style.display).toBe('none');
  });

  it('does not double-pause or confuse the resume path when opened twice in a row', () => {
    const scene = makeScene();
    scene._openCodex();
    scene._openCodex();

    document.getElementById('codex-close').click();

    // Exactly one resume on close — the second open must not have left a
    // second onClose closure racing the first, or the game double-resumes.
    expect(scene.scene.resume).toHaveBeenCalledOnce();
    expect(document.getElementById('codex-overlay').style.display).toBe('none');
  });
});

describe('GameScene shutdown — codex teardown', () => {
  beforeEach(setupDOM);

  it('closes and dereferences the codex overlay on shutdown', () => {
    const scene = makeScene();
    scene.inspector = null;
    scene.events    = { off() {} };
    scene.game      = { events: { off() {}, emit() {} }, registry: { get: () => null } };
    scene._onAbility  = () => {};
    scene._sentries   = [];
    scene._spawnEnemy = () => {};
    scene._updateHUD  = () => {};
    scene._onDefeat   = () => {};

    scene._openCodex();
    expect(document.getElementById('codex-overlay').style.display).toBe('flex');

    scene.shutdown();

    expect(scene._codexOverlay).toBeNull();
    expect(document.getElementById('codex-overlay').style.display).toBe('none');
  });

  it('removes the open-codex listener by replacing the node', () => {
    const scene = makeScene();
    scene.inspector = null;
    scene.events    = { off() {} };
    scene.game      = { events: { off() {}, emit() {} }, registry: { get: () => null } };
    scene._onAbility  = () => {};
    scene._sentries   = [];
    scene._spawnEnemy = () => {};
    scene._updateHUD  = () => {};
    scene._onDefeat   = () => {};

    const oldBtn = document.getElementById('open-codex');
    const spy = vi.fn();
    oldBtn.addEventListener('click', spy);

    scene.shutdown();

    const newBtn = document.getElementById('open-codex');
    expect(newBtn).not.toBe(oldBtn);
    newBtn.click();
    expect(spy).not.toHaveBeenCalled();
  });
});
