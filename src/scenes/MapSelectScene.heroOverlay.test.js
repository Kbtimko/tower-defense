import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('phaser', () => ({
  default: { Scene: class { constructor(){} events = { on(){} } } },
}));

import MapSelectScene from './MapSelectScene.js';
import { SaveManager } from '../systems/SaveManager.js';

function setupDom() {
  document.body.replaceChildren();

  // #map-select container (so shutdown() does not throw)
  const root = document.createElement('div');
  root.id = 'map-select';
  document.body.appendChild(root);

  // Meta bar + open-heroes button
  const metaBar = document.createElement('div');
  metaBar.id = 'map-meta-bar';
  for (const id of ['total-stars']) {
    const span = document.createElement('span');
    span.id = id;
    metaBar.appendChild(span);
  }
  for (const id of ['open-upgrades', 'open-heroes', 'open-settings']) {
    const btn = document.createElement('button');
    btn.id = id;
    metaBar.appendChild(btn);
  }
  document.body.appendChild(metaBar);

  // Sidebar + featured (placeholder structure — _populateSidebar/_renderFeatured need the elements)
  const sidebar = document.createElement('div');
  sidebar.id = 'map-sidebar';
  document.body.appendChild(sidebar);
  for (const id of ['featured-name', 'featured-stars', 'featured-blurb', 'featured-tier', 'featured-play']) {
    const el = document.createElement(id === 'featured-play' ? 'button' : 'div');
    el.id = id;
    document.body.appendChild(el);
  }
  const stats = document.createElement('div');
  stats.id = 'lifetime-stats';
  document.body.appendChild(stats);

  // Both overlays must exist as DOM so their constructors cache refs
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
}

describe('MapSelectScene heroes-overlay integration', () => {
  beforeEach(() => {
    setupDom();
    localStorage.clear();
  });

  it('does NOT render the old #hero-picker block', () => {
    const scene = new MapSelectScene();
    scene.create();
    expect(document.getElementById('hero-picker')).toBeNull();
    expect(document.querySelectorAll('.hero-card').length).toBe(0);
  });

  it('clicking #open-heroes opens the Hero Management overlay', () => {
    const scene = new MapSelectScene();
    scene.create();
    document.getElementById('open-heroes').click();
    expect(document.getElementById('hero-mgmt-overlay').style.display).toBe('flex');
  });

  it('shutdown() hides #hero-mgmt-overlay along with the others', () => {
    const scene = new MapSelectScene();
    scene.create();
    document.getElementById('open-heroes').click();
    scene.shutdown();
    expect(document.getElementById('hero-mgmt-overlay').style.display).toBe('none');
    expect(document.getElementById('upgrade-overlay').style.display).toBe('none');
    expect(document.getElementById('settings-overlay').style.display).toBe('none');
  });

  it('PLAY button still reads selectedHero from SaveManager', () => {
    const save = new SaveManager();
    save.setStars(2, 1);            // unlock Engineer
    save.setSelectedHero('engineer');
    const scene = new MapSelectScene();
    // Stub scene.start to capture launch args
    scene.scene = { start: vi.fn() };
    scene.create();
    document.getElementById('featured-play').click();
    expect(scene.scene.start).toHaveBeenCalledWith('GameScene',
      expect.objectContaining({ heroId: 'engineer' }));
  });
});
