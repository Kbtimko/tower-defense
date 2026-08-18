import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('phaser', () => ({
  default: { Scene: class { constructor(){} events = { on(){} } } },
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
  for (const id of ['open-upgrades', 'open-heroes', 'open-settings']) {
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

describe('MapSelectScene menu music', () => {
  beforeEach(() => {
    setupDom();
    localStorage.clear();
  });

  it("create() calls audio.playMusic('menu') exactly once", () => {
    const playMusicSpy = vi.fn();
    const am = { playMusic: playMusicSpy };
    const registry = new Map([['audio', am]]);
    const scene = new MapSelectScene();
    scene.game = { registry };
    scene.create();
    expect(playMusicSpy).toHaveBeenCalledTimes(1);
    expect(playMusicSpy).toHaveBeenCalledWith('menu');
  });

  it('create() does not throw when no audio manager is registered', () => {
    const scene = new MapSelectScene();
    scene.game = { registry: new Map() };
    expect(() => scene.create()).not.toThrow();
  });
});
