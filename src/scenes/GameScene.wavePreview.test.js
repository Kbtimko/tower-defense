// Wires WavePreviewPopover into GameScene: the popover must always describe
// the wave the Send Wave button would send, stay reachable while the button
// is disabled (the whole reason the hover target is the wrapper, not the
// button), and be torn down on scene shutdown so a replay in the same tab
// doesn't leave a second listener stacked on #wave-btn-wrap.
//
// These tests exercise the REAL GameScene.prototype methods (_updateWaveButton,
// shutdown) and a REAL WavePreviewPopover against real DOM — not a local
// replica of the wiring logic — so they prove the actual contract between the
// two objects, the same way GameScene.updateWaveButton.test.js and
// GameScene.shutdown.test.js already exercise the rest of GameScene.

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

import { describe, it, expect, beforeEach } from 'vitest';
import GameScene from './GameScene.js';
import { WavePreviewPopover } from '../ui/WavePreviewPopover.js';

// Minimal DOM: enough for _updateWaveButtonText (#wave-btn) and the popover
// itself (#wave-btn-wrap / #wave-preview), matching the fixture
// WavePreviewPopover.test.js already uses.
function setupWaveDOM() {
  document.body.replaceChildren();
  const wrap = document.createElement('span');
  wrap.id = 'wave-btn-wrap';
  const btn = document.createElement('button');
  btn.id = 'wave-btn';
  const pop = document.createElement('div');
  pop.id = 'wave-preview';
  wrap.append(btn, pop);
  document.body.appendChild(wrap);
  return { wrap, btn, pop };
}

// shutdown() unconditionally touches several DOM ids beyond wave-btn — see
// GameScene.shutdown.test.js's setupDOM, which this mirrors, plus the
// wave-preview elements this task adds.
function el(tag, attrs, parent) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'display') node.style.display = v;
    else node[k] = v;
  }
  (parent || document.body).appendChild(node);
  return node;
}

function setupFullDOM() {
  document.body.replaceChildren();
  el('div', { id: 'hud', display: 'flex' });
  el('div', { id: 'tower-panel', display: 'block' });
  const gameMsg = el('div', { id: 'game-msg', display: 'block' });
  el('button', { id: 'msg-btn' }, gameMsg);
  el('button', { id: 'msg-cancel-btn' }, gameMsg);
  el('div', { id: 'paused-overlay', className: 'shown' });
  const bar = el('div', { id: 'bottom-bar', display: 'flex' });
  el('button', { className: 'tower-btn' }, bar);
  el('button', { id: 'exit-btn' }, bar);
  const wrap = el('span', {}, bar);
  wrap.id = 'wave-btn-wrap';
  const btn = el('button', {}, wrap);
  btn.id = 'wave-btn';
  const pop = el('div', {}, wrap);
  pop.id = 'wave-preview';
  el('button', { id: 'speed-btn' });
  el('button', { id: 'pause-btn' });
  el('button', { id: 'panel-upgrade-btn' });
  el('button', { id: 'panel-sell-btn' });
  el('button', { id: 'panel-reposition-btn' });
  el('button', { id: 'story-dismiss' });
  return { wrap, btn, pop };
}

function makeScene(waveMgr) {
  const scene = Object.create(GameScene.prototype);
  scene.mapId       = 0; // real MAP_WAVES[0] has 10 waves — enough for these tests
  scene.waveMgr     = waveMgr;
  scene.enemies     = [];
  scene.rewardMult  = 1;
  scene._wavePreview = new WavePreviewPopover();
  return scene;
}

describe('GameScene wave preview wiring', () => {
  let dom;
  beforeEach(() => { dom = setupWaveDOM(); });

  it('describes wave 1 before any wave has started', () => {
    const scene = makeScene({ done: false, active: false, isEarlyEligible: false, currentWave: 0 });
    GameScene.prototype._updateWaveButton.call(scene);
    expect(dom.pop.querySelector('.wp-title').textContent).toContain('Wave 1');
  });

  it('describes wave 4 during an early-send window, matching the button label', () => {
    const scene = makeScene({ done: false, active: true, isEarlyEligible: true, currentWave: 3 });
    GameScene.prototype._updateWaveButton.call(scene);
    expect(dom.btn.textContent).toContain('Send Wave 4');
    expect(dom.pop.querySelector('.wp-title').textContent).toContain('Wave 4');
  });

  it('shows nothing at all — not an empty frame — once all waves are done', () => {
    const scene = makeScene({ done: true, active: false, isEarlyEligible: false, currentWave: 10 });
    GameScene.prototype._updateWaveButton.call(scene);
    expect(dom.pop.children.length).toBe(0);
    expect(dom.pop.classList.contains('shown')).toBe(false);
  });

  it('still opens on hover while #wave-btn is disabled', () => {
    // active + not early-eligible is the window _updateWaveButtonText disables
    // the button for ("Wave N in progress...").
    const scene = makeScene({ done: false, active: true, isEarlyEligible: false, currentWave: 1 });
    GameScene.prototype._updateWaveButton.call(scene);
    expect(dom.btn.disabled).toBe(true);

    dom.wrap.dispatchEvent(new Event('pointerenter'));
    expect(dom.pop.classList.contains('shown')).toBe(true);
  });
});

describe('GameScene wave preview teardown', () => {
  it('destroys the popover on shutdown, leaving no wrap listener attached', () => {
    const dom = setupFullDOM();
    const scene = makeScene({ done: false, active: false, isEarlyEligible: false, currentWave: 0 });

    // Stub the parts of shutdown() unrelated to the wave preview, the same
    // way GameScene.shutdown.test.js's makeScene() does.
    scene.inspector = null;
    scene.events    = { off() {} };
    scene.game      = { events: { off() {}, emit() {} }, registry: { get() { return null; } } };
    scene._onAbility  = () => {};
    scene._sentries   = [];
    scene._spawnEnemy = () => {};
    scene._updateHUD  = () => {};
    scene._onDefeat   = () => {};

    GameScene.prototype._updateWaveButton.call(scene);
    expect(dom.pop.children.length).toBeGreaterThan(0);

    scene.shutdown();

    expect(scene._wavePreview).toBeNull();
    dom.wrap.dispatchEvent(new Event('pointerenter'));
    expect(dom.pop.classList.contains('shown')).toBe(false);
  });
});
