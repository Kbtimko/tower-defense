import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('phaser', () => ({
  default: { Scene: class { constructor(){} events = { on(){}, once(){} } } },
}));

import MapSelectScene from './MapSelectScene.js';

function setupDom() {
  document.body.replaceChildren();

  const root = document.createElement('div');
  root.id = 'map-select';
  document.body.appendChild(root);

  const metaBar = document.createElement('div');
  metaBar.id = 'map-meta-bar';
  const totalStars = document.createElement('span');
  totalStars.id = 'total-stars';
  metaBar.appendChild(totalStars);
  for (const id of ['open-upgrades', 'open-heroes', 'open-settings', 'fullscreen-btn']) {
    const btn = document.createElement('button');
    btn.id = id;
    metaBar.appendChild(btn);
  }
  document.body.appendChild(metaBar);

  // Overworld container replaced the old sidebar list (PR #37)
  const overworld = document.createElement('div');
  overworld.id = 'map-overworld';
  document.body.appendChild(overworld);
  for (const id of ['featured-name', 'featured-stars', 'featured-blurb', 'featured-tier', 'featured-play']) {
    const el = document.createElement(id === 'featured-play' ? 'button' : 'div');
    el.id = id;
    document.body.appendChild(el);
  }
  const stats = document.createElement('div');
  stats.id = 'lifetime-stats';
  document.body.appendChild(stats);

  // Overlays (constructors cache refs) + their sub-elements
  for (const ovId of ['upgrade-overlay', 'hero-mgmt-overlay', 'settings-overlay']) {
    const ov = document.createElement('div');
    ov.id = ovId;
    ov.style.display = 'none';
    document.body.appendChild(ov);
  }
  for (const id of [
    'upgrade-tree', 'upgrade-available', 'upgrade-close',
    'hero-rail', 'hero-tree', 'hero-mgmt-avail', 'hero-mgmt-close',
  ]) {
    const el = document.createElement('div');
    el.id = id;
    document.body.appendChild(el);
  }

  // Story dialog + story log (PR #40) — StoryDialogOverlay caches refs in create()
  const storyDialog = document.createElement('div');
  storyDialog.id = 'story-dialog';
  storyDialog.style.display = 'none';
  for (const [tag, id] of [
    ['div', 'story-dialog-portrait'], ['div', 'story-dialog-name'],
    ['div', 'story-dialog-text'], ['button', 'story-dialog-next'], ['button', 'story-dialog-skip'],
  ]) {
    const el = document.createElement(tag);
    el.id = id;
    storyDialog.appendChild(el);
  }
  document.body.appendChild(storyDialog);
  for (const id of ['story-log-overlay', 'story-log-list']) {
    const el = document.createElement('div');
    el.id = id;
    document.body.appendChild(el);
  }
  for (const id of ['open-story-log', 'story-log-close']) {
    const btn = document.createElement('button');
    btn.id = id;
    document.body.appendChild(btn);
  }
}

const LABEL_ON = '⛶ Fullscreen';
const LABEL_OFF = '⛶ Exit fullscreen';

// Scenes from earlier tests would leave document listeners behind and confuse the
// shutdown assertion, so every scene is shut down in afterEach.
const scenes = [];
function makeScene() {
  const scene = new MapSelectScene();
  scene.game = { registry: new Map() };
  scenes.push(scene);
  return scene;
}

describe('MapSelectScene fullscreen button', () => {
  beforeEach(() => {
    setupDom();
    localStorage.clear();
    document.getElementById('fullscreen-btn').textContent = LABEL_ON;
    document.documentElement.requestFullscreen = vi.fn().mockResolvedValue();
    Object.defineProperty(document, 'fullscreenEnabled', { value: true, configurable: true });
    Object.defineProperty(document, 'fullscreenElement', { value: null, configurable: true });
  });

  afterEach(() => {
    for (const sc of scenes.splice(0)) sc.shutdown();
    delete document.fullscreenEnabled;
    delete document.fullscreenElement;
    delete document.documentElement.requestFullscreen;
  });

  it('is hidden when fullscreen is unsupported', () => {
    Object.defineProperty(document, 'fullscreenEnabled', { value: false, configurable: true });
    makeScene().create();
    expect(document.getElementById('fullscreen-btn').style.display).toBe('none');
  });

  it('is visible when fullscreen is supported', () => {
    makeScene().create();
    expect(document.getElementById('fullscreen-btn').style.display).not.toBe('none');
  });

  it('click requests fullscreen on the document element', () => {
    makeScene().create();
    document.getElementById('fullscreen-btn').click();
    expect(document.documentElement.requestFullscreen).toHaveBeenCalledTimes(1);
  });

  it('label flips on fullscreenchange', () => {
    makeScene().create();
    const btn = document.getElementById('fullscreen-btn');
    Object.defineProperty(document, 'fullscreenElement', { value: document.documentElement, configurable: true });
    document.dispatchEvent(new Event('fullscreenchange'));
    expect(btn.textContent).toBe(LABEL_OFF);
    Object.defineProperty(document, 'fullscreenElement', { value: null, configurable: true });
    document.dispatchEvent(new Event('fullscreenchange'));
    expect(btn.textContent).toBe(LABEL_ON);
  });

  it('shutdown removes the fullscreenchange listener', () => {
    const scene = makeScene();
    scene.create();
    scene.shutdown();
    const btn = document.getElementById('fullscreen-btn');
    btn.textContent = 'sentinel';
    Object.defineProperty(document, 'fullscreenElement', { value: document.documentElement, configurable: true });
    document.dispatchEvent(new Event('fullscreenchange'));
    expect(btn.textContent).toBe('sentinel');
  });

  it('re-entering create() does not stack click handlers', () => {
    const scene = makeScene();
    scene.create();
    scene.shutdown();
    scene.create();
    document.getElementById('fullscreen-btn').click();
    expect(document.documentElement.requestFullscreen).toHaveBeenCalledTimes(1);
  });
});
