import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('phaser', () => ({
  default: { Scene: class { constructor(key) { this.mockKey = key; } events = { on() {}, once() {} } } },
}));

import TitleScene from './TitleScene.js';

function mountRoot() {
  document.body.replaceChildren();
  const root = document.createElement('div');
  root.id = 'title-screen';
  root.append(document.createElement('canvas'));
  for (const cls of ['title-logo', 'title-prompt']) {
    const el = document.createElement('div');
    el.className = cls;
    root.append(el);
  }
  document.body.appendChild(root);
  return root;
}

// A scene wired like Phaser would: `once('shutdown')` handlers run on shutdown().
function makeScene(registry = new Map()) {
  const scene = new TitleScene();
  const onceHandlers = [];
  scene.events = { once: (evt, fn, ctx) => onceHandlers.push({ evt, fn, ctx }), on: vi.fn() };
  scene.game = { registry };
  scene.scene = { start: vi.fn() };
  scene.emitShutdown = () => {
    for (const h of onceHandlers.splice(0).filter((h) => h.evt === 'shutdown')) h.fn.call(h.ctx);
  };
  return scene;
}

function trackNet(...targets) {
  const net = new Map();
  for (const t of targets) {
    const add = t.addEventListener.bind(t);
    const remove = t.removeEventListener.bind(t);
    vi.spyOn(t, 'addEventListener').mockImplementation((type, ...rest) => {
      net.set(type, (net.get(type) ?? 0) + 1);
      return add(type, ...rest);
    });
    vi.spyOn(t, 'removeEventListener').mockImplementation((type, ...rest) => {
      net.set(type, (net.get(type) ?? 0) - 1);
      return remove(type, ...rest);
    });
  }
  return net;
}

describe('TitleScene', () => {
  let root;

  beforeEach(() => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    Object.defineProperty(document, 'fonts', { value: undefined, configurable: true });
    root = mountRoot();
  });

  afterEach(() => vi.restoreAllMocks());

  it("has the key 'TitleScene'", () => {
    expect(new TitleScene().mockKey).toBe('TitleScene');
  });

  it("onStart -> scene.start('MapSelectScene', {}), called with an object", () => {
    const scene = makeScene();
    scene.create();
    root.click();
    root.click();
    expect(scene.scene.start).toHaveBeenCalledTimes(1);
    const [key, data] = scene.scene.start.mock.calls[0];
    expect(key).toBe('MapSelectScene');
    expect(data).toEqual({});
    expect(typeof data).toBe('object');
    expect(data).not.toBeNull();
    scene.emitShutdown();
  });

  it('reads reduced motion live from the registry (ambientMotion false -> motion-off)', () => {
    const scene = makeScene(new Map([['ambientMotion', false]]));
    scene.create();
    expect(root.classList.contains('motion-off')).toBe(true);
    expect(root.dataset.phase).toBe('lit');
    scene.emitShutdown();

    const moving = makeScene(new Map());
    moving.create();
    expect(root.classList.contains('motion-off')).toBe(false);
    moving.emitShutdown();
  });

  it('shutdown destroys the screen; enter/shutdown x3 leaves no net listeners', () => {
    const net = trackNet(root, document, window);
    const scene = makeScene();
    for (let i = 0; i < 3; i++) {
      scene.create();
      expect(root.style.display).not.toBe('none');
      scene.emitShutdown();
      expect(root.style.display).toBe('none');
    }
    expect(net.get('click')).toBe(0);
    expect(net.get('keydown')).toBe(0);
    for (const [type, n] of net) expect([type, n]).toEqual([type, 0]);
    root.click();
    expect(scene.scene.start).not.toHaveBeenCalled();
  });
});
