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
    const btn = document.createElement('button');
    btn.id = `ability-${slot}`;
    for (const cls of ['ability-key', 'ability-name', 'ability-cd']) {
      const span = document.createElement('span');
      span.className = cls;
      btn.appendChild(span);
    }
    document.body.appendChild(btn);
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
const hover = (slot) => document.getElementById(`ability-${slot}`).dispatchEvent(new Event('pointerenter'));
const unhover = (slot) => document.getElementById(`ability-${slot}`).dispatchEvent(new Event('pointerleave'));

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
});
