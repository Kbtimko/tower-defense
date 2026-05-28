import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { InspectController } from './InspectController.js';

// Build the inspector DOM scaffolding (createElement/appendChild — no innerHTML).
function setupDom() {
  while (document.body.firstChild) document.body.removeChild(document.body.firstChild);

  // Helper for creating a child with id (and optional class).
  const mk = (tag, id, className) => {
    const el = document.createElement(tag);
    if (id) el.id = id;
    if (className) el.className = className;
    return el;
  };

  // #enemy-inspector
  const ei = mk('div', 'enemy-inspector');
  ei.style.display = 'none';
  ei.appendChild(mk('span', 'ei-name'));
  ei.appendChild(mk('button', 'ei-close'));
  ei.appendChild(mk('div', 'ei-hpfill'));
  ei.appendChild(mk('div', 'ei-hp-label'));
  ei.appendChild(mk('div', 'ei-stats'));
  ei.appendChild(mk('div', 'ei-meta'));
  ei.appendChild(mk('div', 'ei-status'));
  ei.appendChild(mk('div', 'ei-matchups'));
  document.body.appendChild(ei);

  // #hero-inspector
  const hi = mk('div', 'hero-inspector');
  hi.style.display = 'none';
  hi.appendChild(mk('button', 'hi-close'));
  hi.appendChild(mk('div', 'hi-hpfill'));
  hi.appendChild(mk('div', 'hi-hp-label'));
  hi.appendChild(mk('div', 'hi-level'));
  hi.appendChild(mk('div', 'hi-attack'));
  hi.appendChild(mk('div', 'hi-abilities'));
  hi.appendChild(mk('div', 'hi-matchups'));
  document.body.appendChild(hi);

  // #inspect-peek
  const peek = mk('div', 'inspect-peek');
  peek.style.display = 'none';
  document.body.appendChild(peek);
}

const makeEnemy = (overrides = {}) => ({
  x: 100, y: 100, hp: 80, maxHp: 120, dead: false,
  def: { type: 'brute', name: 'Veth Brute', icon: '🦏', hp: 120, speed: 38,
         armor: 8, reward: 22, flying: false, radius: 11 },
  statusEffects: { slow: { active: false, timer: 0, factor: 1 }, stun: { active: false, timer: 0 } },
  ...overrides,
});

const makeHero = (overrides = {}) => ({
  x: 50, y: 50, hp: 150, maxHp: 200, level: 2, killCount: 47, dead: false,
  overchargeTimer: 0, airstrikeTimer: 12, empTimer: 0, respawnTimer: 0,
  ...overrides,
});

const makeScene = (enemies = [], hero = null) => ({ enemies, hero });

describe('InspectController — construction + state', () => {
  beforeEach(setupDom);

  it('constructs with pinned=null and peekTarget=null', () => {
    const ctrl = new InspectController(makeScene());
    expect(ctrl.pinned).toBeNull();
    expect(ctrl.peekTarget).toBeNull();
  });
});

describe('InspectController — pin/dismiss', () => {
  beforeEach(setupDom);

  it('pin opens enemy inspector and stores target', () => {
    const ctrl = new InspectController(makeScene());
    const enemy = makeEnemy();
    ctrl.pin({ kind: 'enemy', target: enemy });
    expect(ctrl.pinned).toEqual({ kind: 'enemy', target: enemy });
    expect(document.getElementById('enemy-inspector').style.display).not.toBe('none');
  });

  it('pin opens hero inspector for hero kind', () => {
    const ctrl = new InspectController(makeScene());
    const hero = makeHero();
    ctrl.pin({ kind: 'hero', target: hero });
    expect(ctrl.pinned.kind).toBe('hero');
    expect(document.getElementById('hero-inspector').style.display).not.toBe('none');
  });

  it('clicking same target toggles closed', () => {
    const ctrl = new InspectController(makeScene());
    const enemy = makeEnemy();
    ctrl.pin({ kind: 'enemy', target: enemy });
    ctrl.pin({ kind: 'enemy', target: enemy });
    expect(ctrl.pinned).toBeNull();
    expect(document.getElementById('enemy-inspector').style.display).toBe('none');
  });

  it('switching to a different target replaces the pin', () => {
    const ctrl = new InspectController(makeScene());
    const a = makeEnemy({ x: 100 });
    const b = makeEnemy({ x: 200 });
    ctrl.pin({ kind: 'enemy', target: a });
    ctrl.pin({ kind: 'enemy', target: b });
    expect(ctrl.pinned.target).toBe(b);
    expect(document.getElementById('enemy-inspector').style.display).not.toBe('none');
  });

  it('switching kinds (enemy → hero) hides enemy panel and shows hero panel', () => {
    const ctrl = new InspectController(makeScene());
    ctrl.pin({ kind: 'enemy', target: makeEnemy() });
    ctrl.pin({ kind: 'hero', target: makeHero() });
    expect(document.getElementById('enemy-inspector').style.display).toBe('none');
    expect(document.getElementById('hero-inspector').style.display).not.toBe('none');
  });

  it('dismiss hides both panels and clears state', () => {
    const ctrl = new InspectController(makeScene());
    ctrl.pin({ kind: 'enemy', target: makeEnemy() });
    ctrl.dismiss();
    expect(ctrl.pinned).toBeNull();
    expect(document.getElementById('enemy-inspector').style.display).toBe('none');
    expect(document.getElementById('hero-inspector').style.display).toBe('none');
  });

  it('close button on enemy inspector dismisses', () => {
    const ctrl = new InspectController(makeScene());
    ctrl.pin({ kind: 'enemy', target: makeEnemy() });
    document.getElementById('ei-close').click();
    expect(ctrl.pinned).toBeNull();
  });

  it('close button on hero inspector dismisses', () => {
    const ctrl = new InspectController(makeScene());
    ctrl.pin({ kind: 'hero', target: makeHero() });
    document.getElementById('hi-close').click();
    expect(ctrl.pinned).toBeNull();
  });
});

describe('InspectController — ESC key', () => {
  let ctrl;
  beforeEach(() => { setupDom(); ctrl = new InspectController(makeScene()); });
  afterEach(() => { ctrl.destroy(); });

  it('ESC dismisses a pinned panel', () => {
    ctrl.pin({ kind: 'enemy', target: makeEnemy() });
    window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape' }));
    expect(ctrl.pinned).toBeNull();
  });

  it('ESC with no panel open is a no-op', () => {
    window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape' }));
    expect(ctrl.pinned).toBeNull();
  });

  it('destroy removes the ESC listener', () => {
    ctrl.destroy();
    ctrl.pinned = { kind: 'enemy', target: makeEnemy() };  // bypass for test
    window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape' }));
    expect(ctrl.pinned).not.toBeNull(); // listener removed, state unchanged
  });
});

describe('InspectController — hit-tests', () => {
  beforeEach(setupDom);

  it('_hitTestEnemy returns enemy within radius+4 slop', () => {
    const enemy = makeEnemy();  // x:100 y:100 radius:11
    const ctrl = new InspectController(makeScene([enemy]));
    expect(ctrl._hitTestEnemy(100, 100)).toBe(enemy);
    expect(ctrl._hitTestEnemy(114, 100)).toBe(enemy);  // dist 14 = radius+slop boundary
    expect(ctrl._hitTestEnemy(120, 100)).toBeNull();   // dist 20 > 11+4
  });

  it('_hitTestEnemy returns null when no enemies', () => {
    const ctrl = new InspectController(makeScene([]));
    expect(ctrl._hitTestEnemy(100, 100)).toBeNull();
  });

  it('_hitTestEnemy skips dead enemies', () => {
    const dead = makeEnemy({ dead: true });
    const ctrl = new InspectController(makeScene([dead]));
    expect(ctrl._hitTestEnemy(100, 100)).toBeNull();
  });

  it('_hitTestHero returns true within 18px of hero', () => {
    const hero = makeHero();  // x:50 y:50
    const ctrl = new InspectController(makeScene([], hero));
    expect(ctrl._hitTestHero(50, 50)).toBe(true);
    expect(ctrl._hitTestHero(67, 50)).toBe(true);   // dist 17
    expect(ctrl._hitTestHero(70, 50)).toBe(false);  // dist 20 > 18
  });

  it('_hitTestHero returns false when scene.hero is null', () => {
    const ctrl = new InspectController(makeScene([], null));
    expect(ctrl._hitTestHero(50, 50)).toBe(false);
  });

  it('_hitTestHero returns false when hero is dead', () => {
    const hero = makeHero({ dead: true });
    const ctrl = new InspectController(makeScene([], hero));
    expect(ctrl._hitTestHero(50, 50)).toBe(false);
  });
});

describe('InspectController — tryClickInspect', () => {
  beforeEach(setupDom);

  it('returns false for empty space', () => {
    const ctrl = new InspectController(makeScene([], makeHero()));
    expect(ctrl.tryClickInspect(500, 500)).toBe(false);
    expect(ctrl.pinned).toBeNull();
  });

  it('hits enemy and pins enemy panel', () => {
    const enemy = makeEnemy();
    const ctrl = new InspectController(makeScene([enemy]));
    expect(ctrl.tryClickInspect(100, 100)).toBe(true);
    expect(ctrl.pinned.kind).toBe('enemy');
    expect(ctrl.pinned.target).toBe(enemy);
  });

  it('hits hero when no enemy is under cursor', () => {
    const hero = makeHero();
    const ctrl = new InspectController(makeScene([], hero));
    expect(ctrl.tryClickInspect(50, 50)).toBe(true);
    expect(ctrl.pinned.kind).toBe('hero');
  });

  it('enemy takes priority over hero on overlap', () => {
    const enemy = makeEnemy({ x: 50, y: 50 });
    const hero  = makeHero({ x: 50, y: 50 });
    const ctrl = new InspectController(makeScene([enemy], hero));
    ctrl.tryClickInspect(50, 50);
    expect(ctrl.pinned.kind).toBe('enemy');
  });
});
