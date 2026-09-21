import { describe, it, expect, vi, beforeEach } from 'vitest';

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

import UIScene from './UIScene.js';
import { HEROES } from '../data/heroes.js';

function setupHeroDOM() {
  document.body.textContent = '';

  for (const id of ['hud', 'bottom-bar', 'game-msg']) {
    const d = document.createElement('div');
    d.id = id;
    document.body.appendChild(d);
  }

  const portrait = document.createElement('div');
  portrait.id = 'hero-portrait';
  document.body.appendChild(portrait);

  const level = document.createElement('div');
  level.id = 'hero-level';
  document.body.appendChild(level);

  const section = document.createElement('div');
  section.id = 'hero-section';
  for (const id of ['hero-hp-fill', 'hero-xp-fill']) {
    const d = document.createElement('div');
    d.id = id;
    section.appendChild(d);
  }
  document.body.appendChild(section);

  for (const slot of ['q', 'w', 'e']) {
    // Mirrors index.html: the button sits inside a wrapper span so the hover
    // card still works once the button goes `disabled` (locked/cooldown) —
    // disabled controls fire no pointer events in a real browser.
    const wrap = document.createElement('span');
    wrap.id = `ability-${slot}-wrap`;
    const btn = document.createElement('button');
    btn.id = `ability-${slot}`;
    for (const cls of ['ability-key', 'ability-name', 'ability-cd']) {
      const span = document.createElement('span');
      span.className = cls;
      btn.appendChild(span);
    }
    wrap.appendChild(btn);
    document.body.appendChild(wrap);
  }

  const card = document.createElement('div');
  card.id = 'ability-card';
  document.body.appendChild(card);

  for (const id of ['wave-btn', 'speed-btn', 'panel-upgrade-btn', 'panel-sell-btn',
                     'msg-btn', 'panel-reposition-btn']) {
    const b = document.createElement('button');
    b.id = id;
    document.body.appendChild(b);
  }
}

function makeScene() {
  const s = Object.create(UIScene.prototype);
  s.game = { events: { on() {}, off() {}, emit() {} } };
  return s;
}

const cardText = () => document.getElementById('ability-card').textContent;
const cardShown = () => document.getElementById('ability-card').classList.contains('shown');
// Hover the WRAPPER, not the button: that's what a real pointer does, since a
// disabled button fires no pointer events at all in Chrome/Safari.
const hover = (slot) => document.getElementById(`ability-${slot}-wrap`).dispatchEvent(new Event('pointerenter'));
const unhover = (slot) => document.getElementById(`ability-${slot}-wrap`).dispatchEvent(new Event('pointerleave'));

describe('UIScene ability hover card', () => {
  beforeEach(setupHeroDOM);

  it('shows the card with the ability label and effect on hover', () => {
    const s = makeScene();
    s._onHeroHudInit({ heroId: 'rael', def: HEROES.rael });

    hover('q');

    expect(cardShown()).toBe(true);
    expect(cardText()).toContain(HEROES.rael.abilities.q.label);
    expect(cardText()).toContain(HEROES.rael.abilities.q.tooltip);
  });

  it('reflects the current hero level: e is locked at level 1, unlocked after level-up to 3', () => {
    const s = makeScene();
    s._onHeroHudInit({ heroId: 'rael', def: HEROES.rael });

    hover('e');
    expect(cardText()).toContain('Unlocks at level 3');
    unhover('e');

    s._onHeroLevelUp({ level: 3 });
    hover('e');
    expect(cardText()).not.toContain('Unlocks at level 3');
  });

  it('reflects the current cooldown reported by hero:cooldown-tick', () => {
    const s = makeScene();
    s._onHeroHudInit({ heroId: 'rael', def: HEROES.rael });

    s._onHeroCooldownTick({ q: 9, w: 0, e: 0 });
    hover('q');

    expect(cardText()).toContain('9s');
  });

  it('no longer sets the native title attribute on the ability buttons', () => {
    const s = makeScene();
    s._onHeroHudInit({ heroId: 'rael', def: HEROES.rael });

    for (const slot of ['q', 'w', 'e']) {
      expect(document.getElementById(`ability-${slot}`).title).toBe('');
    }
  });

  it('tears down tooltip listeners on shutdown', () => {
    const s = makeScene();
    s._onHeroHudInit({ heroId: 'rael', def: HEROES.rael });
    s.shutdown();

    // shutdown() clones the ability buttons to drop their listeners; the
    // clone still exists in the DOM (a fresh 'q' hover must show nothing).
    hover('q');
    expect(cardShown()).toBe(false);
  });

  it('does not stack duplicate listeners when the hero HUD is re-initialised', () => {
    const s = makeScene();
    s._onHeroHudInit({ heroId: 'rael', def: HEROES.rael });
    const afterFirst = s._abilityTip._listeners.length;

    s._onHeroHudInit({ heroId: 'rael', def: HEROES.rael });
    const afterSecond = s._abilityTip._listeners.length;

    expect(afterFirst).toBeGreaterThan(0);
    expect(afterSecond).toBe(afterFirst);
  });

  // A disabled button fires no pointer events in Chrome/Safari (jsdom does not
  // reproduce this), so the card's most important states — "why can't I use
  // this?" and "how long until it's ready?" — must be reachable from the
  // wrapper, which is never disabled.
  it('shows the lock reason when hovering the wrapper of a locked ability (button disabled, .locked)', () => {
    const s = makeScene();
    s._onHeroHudInit({ heroId: 'rael', def: HEROES.rael });

    const btn = document.getElementById('ability-e');
    expect(btn.disabled).toBe(true);
    expect(btn.classList.contains('locked')).toBe(true);

    hover('e');

    expect(cardShown()).toBe(true);
    expect(cardText()).toContain('Unlocks at level 3');
  });

  it('shows the remaining seconds when hovering the wrapper of an ability on cooldown (button disabled)', () => {
    const s = makeScene();
    s._onHeroHudInit({ heroId: 'rael', def: HEROES.rael });
    s._onHeroLevelUp({ level: 1 });
    s._onHeroCooldownTick({ q: 9, w: 0, e: 0 });

    const btn = document.getElementById('ability-q');
    expect(btn.disabled).toBe(true);

    hover('q');

    expect(cardShown()).toBe(true);
    expect(cardText()).toContain('Ready in 9s');
  });

  it('attaches the hover listeners to the wrapper element, not the button — a bubbling pointerenter-equivalent path must work even while the button is disabled', () => {
    const s = makeScene();
    s._onHeroHudInit({ heroId: 'rael', def: HEROES.rael });

    const btn  = document.getElementById('ability-e');
    const wrap = document.getElementById('ability-e-wrap');
    expect(btn.disabled).toBe(true);

    const enterListeners = s._abilityTip._listeners.filter(l => l.evt === 'pointerenter');
    expect(enterListeners.every(l => l.el !== btn)).toBe(true);
    expect(enterListeners.some(l => l.el === wrap)).toBe(true);

    wrap.dispatchEvent(new Event('pointerenter'));

    expect(cardShown()).toBe(true);
  });
});
