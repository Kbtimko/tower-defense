import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('phaser', () => ({
  default: { Scene: class { constructor(){} events = { on(){}, once(){} } } },
}));

import MapSelectScene from './MapSelectScene.js';
import { mountMapSelectDom } from './mapSelectDom.testutil.js';
import { LAYOUT } from '../data/worldMap.js';
import { SaveManager } from '../systems/SaveManager.js';

// The real index.html markup; jsdom has no canvas, so the world-map renderer
// no-ops. Fake timers let a test step past the entry input guard.
function setupDom() {
  mountMapSelectDom();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  vi.useFakeTimers();
}

function passGuard() {
  vi.advanceTimersByTime(LAYOUT.inputGuardMs);
}

// Every scene is shut down after its test, so no entry guard or listener from one
// test can swallow the next test's clicks.
let entered = [];
function makeScene() {
  const scene = new MapSelectScene();
  scene.game = { registry: new Map() };
  entered.push(scene);
  return scene;
}

afterEach(() => {
  for (const sc of entered.splice(0)) sc.shutdown();
  vi.useRealTimers();
});

describe('MapSelectScene heroes-overlay integration', () => {
  beforeEach(() => {
    setupDom();
    localStorage.clear();
  });

  it('does NOT render the old #hero-picker block', () => {
    const scene = makeScene();
    scene.create();
    expect(document.getElementById('hero-picker')).toBeNull();
    expect(document.querySelectorAll('.hero-card').length).toBe(0);
  });

  it('clicking #open-heroes opens the Hero Management overlay', () => {
    const scene = makeScene();
    scene.create();
    passGuard();
    document.getElementById('open-heroes').click();
    expect(document.getElementById('hero-mgmt-overlay').style.display).toBe('flex');
  });

  it('shutdown() hides #hero-mgmt-overlay along with the others', () => {
    const scene = makeScene();
    scene.create();
    passGuard();
    document.getElementById('open-heroes').click();
    scene.shutdown();
    expect(document.getElementById('hero-mgmt-overlay').style.display).toBe('none');
    expect(document.getElementById('upgrade-overlay').style.display).toBe('none');
    expect(document.getElementById('settings-overlay').style.display).toBe('none');
  });

  it('shutdown() closes UpgradeTreeOverlay so its listener does not leak across re-entries', () => {
    // MapSelectScene builds a NEW UpgradeTreeOverlay every create(), each with its
    // own _onClose closure, and open() attaches it to the shared #upgrade-close
    // node. If shutdown() only hides the overlay via style mutation instead of
    // calling close(), every scene re-entry leaves another distinct listener
    // attached. _bindUpgrades clones #open-upgrades, not #upgrade-close, so it
    // does not paper over this one.
    const closeBtn = document.getElementById('upgrade-close');
    let live = 0;
    const origAdd    = closeBtn.addEventListener.bind(closeBtn);
    const origRemove = closeBtn.removeEventListener.bind(closeBtn);
    closeBtn.addEventListener    = (...a) => { live++; return origAdd(...a); };
    closeBtn.removeEventListener = (...a) => { live--; return origRemove(...a); };

    for (let i = 0; i < 3; i++) {
      const scene = makeScene();
      scene.create();
      passGuard();
      document.getElementById('open-upgrades').click();  // open() -> addEventListener
      scene.shutdown();
    }

    expect(live).toBe(0);
  });

  it('PLAY button still reads selectedHero from SaveManager', () => {
    const save = new SaveManager();
    save.setStars(2, 1);            // unlock Engineer
    save.setSelectedHero('engineer');
    const scene = makeScene();
    // Stub scene.start to capture launch args
    scene.scene = { start: vi.fn() };
    scene.create();
    passGuard();
    document.getElementById('featured-play').click();
    expect(scene.scene.start).toHaveBeenCalledWith('GameScene',
      expect.objectContaining({ heroId: 'engineer' }));
  });
});

describe('MapSelectScene — overworld rendering', () => {
  beforeEach(setupDom);

  it('renders one node per map with correct states on a fresh save', () => {
    const scene = makeScene();
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
