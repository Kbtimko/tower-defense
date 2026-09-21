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

import { describe, it, expect, vi, beforeEach } from 'vitest';
import UIScene from './UIScene.js';

function setupHeroDOM() {
  document.body.textContent = '';
  const section = document.createElement('div');
  section.id = 'hero-section';
  for (const id of ['hero-hp-fill', 'hero-xp-fill']) {
    const d = document.createElement('div');
    d.id = id;
    section.appendChild(d);
  }
  document.body.appendChild(section);
}

const makeScene = () => Object.create(UIScene.prototype);
const xpFill    = () => document.getElementById('hero-xp-fill').style.width;
const tooltip   = () => document.getElementById('hero-section').title;

describe('UIScene hero XP bar', () => {
  beforeEach(setupHeroDOM);

  it('sets the fill width from the payload progress', () => {
    makeScene()._onHeroUpdate({ hp: 100, maxHp: 100,
      xp: { level: 2, progress: 0.4, current: 240, needed: 600, atMax: false } });
    expect(xpFill()).toBe('40%'); // CSSOM strips the trailing .0 from whole-number percentages
  });

  it('renders an empty bar rather than a blank one at zero progress', () => {
    makeScene()._onHeroUpdate({ hp: 100, maxHp: 100,
      xp: { level: 1, progress: 0, current: 0, needed: 700, atMax: false } });
    expect(xpFill()).toBe('0%'); // CSSOM strips the trailing .0 from whole-number percentages
  });

  it('fills the bar at max level', () => {
    makeScene()._onHeroUpdate({ hp: 100, maxHp: 100,
      xp: { level: 5, progress: 1, current: 0, needed: 0, atMax: true } });
    expect(xpFill()).toBe('100%'); // CSSOM strips the trailing .0 from whole-number percentages
  });

  it('writes a tooltip naming the level, the percent and the damage window', () => {
    makeScene()._onHeroUpdate({ hp: 100, maxHp: 100,
      xp: { level: 2, progress: 0.38, current: 456, needed: 1200, atMax: false } });
    expect(tooltip()).toContain('Level 2');
    expect(tooltip()).toContain('38%');
    expect(tooltip()).toContain('Level 3');
    expect(tooltip()).toContain('456');
    expect(tooltip()).toContain('1,200');
  });

  it('says MAX in the tooltip at the top level', () => {
    makeScene()._onHeroUpdate({ hp: 100, maxHp: 100,
      xp: { level: 5, progress: 1, current: 0, needed: 0, atMax: true } });
    expect(tooltip()).toContain('MAX');
  });

  it('does not rewrite the tooltip when the whole percent has not changed', () => {
    const s = makeScene();
    s._onHeroUpdate({ hp: 100, maxHp: 100,
      xp: { level: 2, progress: 0.380, current: 456, needed: 1200, atMax: false } });
    const first = tooltip();
    document.getElementById('hero-section').title = 'SENTINEL';
    s._onHeroUpdate({ hp: 100, maxHp: 100,
      xp: { level: 2, progress: 0.384, current: 461, needed: 1200, atMax: false } });
    expect(tooltip()).toBe('SENTINEL');
    expect(first).toContain('38%');
  });

  it('still drives the HP bar (no regression)', () => {
    makeScene()._onHeroUpdate({ hp: 30, maxHp: 120,
      xp: { level: 1, progress: 0, current: 0, needed: 700, atMax: false } });
    expect(document.getElementById('hero-hp-fill').style.width).toBe('25%'); // CSSOM strips the trailing .0
  });

  it('survives a payload with no xp field', () => {
    expect(() => makeScene()._onHeroUpdate({ hp: 50, maxHp: 100 })).not.toThrow();
  });
});

describe('UIScene hero level label', () => {
  beforeEach(() => {
    setupHeroDOM();
    for (const id of ['hero-level', 'ability-q', 'ability-w', 'ability-e']) {
      const el = document.createElement(id === 'hero-level' ? 'div' : 'button');
      el.id = id;
      document.body.appendChild(el);
    }
  });

  const sceneWithHero = () => {
    const s = Object.create(UIScene.prototype);
    s._heroDef = { shortName: 'Rael', stats: { maxLevel: 5 } };
    return s;
  };

  it('shows a plain level below the cap', () => {
    sceneWithHero()._onHeroLevelUp({ level: 3 });
    expect(document.getElementById('hero-level').textContent).toBe('Rael L3');
  });

  it('marks the label MAX at the cap', () => {
    sceneWithHero()._onHeroLevelUp({ level: 5 });
    expect(document.getElementById('hero-level').textContent).toBe('Rael L5 · MAX');
  });

  it('still unlocks abilities by level (no regression)', () => {
    sceneWithHero()._onHeroLevelUp({ level: 3 });
    expect(document.getElementById('ability-e').disabled).toBe(false);
  });
});

describe('UIScene hero XP tooltip memo correctness', () => {
  beforeEach(setupHeroDOM);

  // A damage tick can cross a level boundary and land on a progress that
  // floors to the same whole percent as the frame before; xp.level must be
  // part of the memo key or the tooltip keeps naming the old level.
  it('updates the tooltip on a level change even when the percent floors the same', () => {
    const s = makeScene();
    s._onHeroUpdate({ hp: 100, maxHp: 100,
      xp: { level: 2, progress: 0.99, current: 5940, needed: 6000, atMax: false } });
    expect(tooltip().startsWith('Level 2 — 99%')).toBe(true);

    s._onHeroUpdate({ hp: 100, maxHp: 100,
      xp: { level: 3, progress: 0.99, current: 0, needed: 9000, atMax: false } });
    expect(tooltip().startsWith('Level 3 — 99%')).toBe(true);
  });
});

function setupCreateDOM() {
  document.body.textContent = '';
  for (const id of ['hud', 'bottom-bar', 'game-msg']) {
    const d = document.createElement('div');
    d.id = id;
    document.body.appendChild(d);
  }
  const section = document.createElement('div');
  section.id = 'hero-section';
  for (const id of ['hero-hp-fill', 'hero-xp-fill']) {
    const d = document.createElement('div');
    d.id = id;
    section.appendChild(d);
  }
  document.body.appendChild(section);
  const btnIds = [
    'wave-btn', 'speed-btn', 'panel-upgrade-btn', 'panel-sell-btn', 'msg-btn',
    'panel-reposition-btn', 'ability-q', 'ability-w', 'ability-e',
  ];
  for (const id of btnIds) {
    const b = document.createElement('button');
    b.id = id;
    document.body.appendChild(b);
  }
}

// UIScene is registered once in main.js's scene array, so Phaser reuses the
// same instance across maps: create() re-runs on relaunch rather than
// constructing a fresh scene. Drive the real create() (with GameScene absent,
// as it is mid-launch) rather than a hand-built stub, so this pins the actual
// reset create() performs, not a reimplementation of it.
function makeLaunchableScene() {
  const s = Object.create(UIScene.prototype);
  s.events = { on() {}, once() {} };
  s.game = { events: { on() {}, off() {}, emit() {} } };
  s.scene = { get() { return undefined; } };
  return s;
}

describe('UIScene hero XP memo reset on scene relaunch', () => {
  beforeEach(setupCreateDOM);

  it('clears the memoised XP percent/level/atMax on create() so a new map is not silently skipped', () => {
    const s = makeLaunchableScene();
    s.create();
    s._onHeroUpdate({ hp: 100, maxHp: 100,
      xp: { level: 2, progress: 0.4, current: 240, needed: 600, atMax: false } });
    expect(s._heroXpPct).toBe(40);

    s.create(); // simulate the scene relaunching for the next map

    expect(s._heroXpPct).toBeNull();
    expect(s._heroXpAtMax).toBeNull();
    expect(s._heroXpLevel).toBeNull();
  });
});
