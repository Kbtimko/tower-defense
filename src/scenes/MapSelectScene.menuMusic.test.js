import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('phaser', () => ({
  default: { Scene: class { constructor(){} events = { on(){} } } },
}));

import MapSelectScene from './MapSelectScene.js';

function setupDom() {
  document.body.replaceChildren();
  const ids = [
    'map-select', 'map-sidebar', 'featured-name', 'featured-stars',
    'featured-blurb', 'featured-tier', 'featured-play', 'total-stars',
    'lifetime-stats', 'hero-picker-cards', 'open-upgrades', 'open-settings',
  ];
  for (const id of ids) {
    const el = document.createElement('div');
    el.id = id;
    document.body.appendChild(el);
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
