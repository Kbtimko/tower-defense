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

  // Overworld + featured (placeholder structure — _populateOverworld/_renderFeatured need the elements)
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

  // Both overlays must exist as DOM so their constructors cache refs
  for (const ovId of ['upgrade-overlay', 'hero-mgmt-overlay', 'settings-overlay']) {
    const ov = document.createElement('div');
    ov.id = ovId;
    ov.style.display = 'none';
    document.body.appendChild(ov);
  }

  // Story dialog elements (needed by StoryDialogOverlay constructor via MapSelectScene.create)
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
  // Story log overlay elements
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

describe('MapSelectScene — overworld rendering', () => {
  beforeEach(setupDom);

  it('renders one node per map with correct states on a fresh save', () => {
    const scene = new MapSelectScene();
    scene.create();

    const nodes = document.querySelectorAll('#map-overworld .ow-node');
    expect(nodes.length).toBe(10);

    const node0 = document.querySelector('.ow-node[data-map-id="0"]');
    const node9 = document.querySelector('.ow-node[data-map-id="9"]');
    expect(node0.className).toContain('next');     // map 0 unlocked, 0 stars -> next
    expect(node9.className).toContain('locked');   // map 9 not yet unlocked
    expect(node9.className).toContain('final');    // map 9 is the final id
  });
});
