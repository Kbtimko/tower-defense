import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('phaser', () => ({
  default: { Scene: class { constructor(){} events = { on(){}, once(){} } } },
}));

import MapSelectScene from './MapSelectScene.js';
import { mountMapSelectDom } from './mapSelectDom.testutil.js';
import { LAYOUT } from '../data/worldMap.js';

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

const LABEL_ON = 'Fullscreen';
const LABEL_OFF = 'Exit fullscreen';
const btnLabel = () => document.querySelector('#fullscreen-btn .mb-label').textContent;
const btnAria = () => document.getElementById('fullscreen-btn').getAttribute('aria-label');

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
    document.documentElement.requestFullscreen = vi.fn().mockResolvedValue();
    Object.defineProperty(document, 'fullscreenEnabled', { value: true, configurable: true });
    Object.defineProperty(document, 'fullscreenElement', { value: null, configurable: true });
  });

  afterEach(() => {
    for (const sc of scenes.splice(0)) sc.shutdown();
    vi.useRealTimers();
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
    passGuard();
    document.getElementById('fullscreen-btn').click();
    expect(document.documentElement.requestFullscreen).toHaveBeenCalledTimes(1);
  });

  it('label and aria-label flip on fullscreenchange; the icon span survives', () => {
    makeScene().create();
    const btn = document.getElementById('fullscreen-btn');
    Object.defineProperty(document, 'fullscreenElement', { value: document.documentElement, configurable: true });
    document.dispatchEvent(new Event('fullscreenchange'));
    expect(btnLabel()).toBe(LABEL_OFF);
    expect(btnAria()).toBe(LABEL_OFF);
    expect(btn.querySelector('.mb-ico').textContent).toBe('⛶');
    Object.defineProperty(document, 'fullscreenElement', { value: null, configurable: true });
    document.dispatchEvent(new Event('fullscreenchange'));
    expect(btnLabel()).toBe(LABEL_ON);
    expect(btnAria()).toBe(LABEL_ON);
    expect(btn.querySelector('.mb-ico').textContent).toBe('⛶');
  });

  it('shutdown removes the fullscreenchange listener', () => {
    const scene = makeScene();
    scene.create();
    scene.shutdown();
    document.querySelector('#fullscreen-btn .mb-label').textContent = 'sentinel';
    Object.defineProperty(document, 'fullscreenElement', { value: document.documentElement, configurable: true });
    document.dispatchEvent(new Event('fullscreenchange'));
    expect(btnLabel()).toBe('sentinel');
  });

  it('re-entering create() does not stack click handlers', () => {
    const scene = makeScene();
    scene.create();
    scene.shutdown();
    scene.create();
    passGuard();
    document.getElementById('fullscreen-btn').click();
    expect(document.documentElement.requestFullscreen).toHaveBeenCalledTimes(1);
  });
});
