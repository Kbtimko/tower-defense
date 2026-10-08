// GameScene and UIScene both bound handlers to the same HUD buttons. Two of
// those overlaps were live bugs (#34): UIScene tracked tower selection on its
// own and un-highlighted a re-armed tower, and the affordability dimming lived
// in a UIScene handler for an event nothing emits. These run the REAL bind
// methods of both scenes against one shared DOM, the way the game wires them.

vi.mock('phaser', () => ({
  default: {
    Scene: class { constructor(key) { this._key = key; } },
    GameObjects: { Container: class {} },
  },
}));

import { describe, it, expect, vi, beforeEach } from 'vitest';
import GameScene from './GameScene.js';
import UIScene from './UIScene.js';
import { TOWER_DEFS } from '../data/towers.js';

const BUTTON_IDS = [
  'wave-btn', 'speed-btn', 'pause-btn', 'panel-upgrade-btn', 'panel-sell-btn',
  'panel-reposition-btn', 'msg-btn', 'msg-cancel-btn', 'exit-btn',
  'ability-q', 'ability-w', 'ability-e',
];
const TEXT_IDS = ['stat-lives', 'stat-gold', 'stat-wave', 'stat-kills', 'tower-tooltip'];

function setupDOM() {
  document.body.replaceChildren();
  for (const id of BUTTON_IDS) {
    const b = document.createElement('button'); b.id = id; document.body.appendChild(b);
  }
  for (const id of TEXT_IDS) {
    const d = document.createElement('div'); d.id = id; document.body.appendChild(d);
  }
  for (const type of Object.keys(TOWER_DEFS)) {
    const b = document.createElement('button');
    b.className = 'tower-btn'; b.dataset.type = type;
    document.body.appendChild(b);
  }
}

const gameEvents = () => ({ emit() {}, on() {}, off() {} });

// Bound in the game's order: GameScene.create binds, then launches UIScene.
function bindBothScenes() {
  const gs = Object.create(GameScene.prototype);
  gs.selectedType = null;
  gs.game = { events: gameEvents() };
  gs._closeTowerPanel = () => {};
  gs._bindDOMEvents();

  const ui = Object.create(UIScene.prototype);
  ui.game = { events: gameEvents() };
  ui._bindDOMEvents();
  document.removeEventListener('keydown', ui._onKeyDown);
  return gs;
}

const highlighted = () =>
  [...document.querySelectorAll('.tower-btn.selected')].map(b => b.dataset.type);
const btn = (type) => document.querySelector(`.tower-btn[data-type="${type}"]`);

describe('tower button selection', () => {
  beforeEach(setupDOM);

  it('highlights a tower re-armed after GameScene cancelled the build', () => {
    const gs = bindBothScenes();
    btn('archer').click();
    // GameScene's own cancel path (no build slot / placement / Escape).
    gs.selectedType = null;
    gs._deselectButtons();

    btn('archer').click();

    expect(gs.selectedType).toBe('archer');
    expect(highlighted()).toEqual(['archer']);
  });

  it('toggles off on a second click, highlight and armed state together', () => {
    const gs = bindBothScenes();
    btn('mage').click();
    btn('mage').click();
    expect(gs.selectedType).toBe(null);
    expect(highlighted()).toEqual([]);
  });
});

describe('affordability dimming', () => {
  beforeEach(setupDOM);

  function hudScene(gold) {
    const gs = Object.create(GameScene.prototype);
    gs.economy = { gold, lives: 20 };
    gs.waveMgr = { currentWave: 0 };
    gs.mapId = 0;
    gs.kills = 0;
    return gs;
  }

  it('dims every tower the player cannot afford, on each HUD update', () => {
    const gs = hudScene(1000);
    gs._updateHUD();
    for (const type of Object.keys(TOWER_DEFS)) expect(btn(type).style.opacity).toBe('1');

    gs.economy.gold = 0;
    gs._updateHUD();
    for (const type of Object.keys(TOWER_DEFS)) expect(btn(type).style.opacity).toBe('0.4');
  });

  it('splits at the exact cost: affordable at cost, dimmed one gold under', () => {
    const cost = TOWER_DEFS.sniper.cost;
    const gs = hudScene(cost);
    gs._updateHUD();
    expect(btn('sniper').style.opacity).toBe('1');
    gs.economy.gold = cost - 1;
    gs._updateHUD();
    expect(btn('sniper').style.opacity).toBe('0.4');
  });
});

describe('tower tooltip across levels', () => {
  beforeEach(setupDOM);

  it('still shows on hover after a level ends and the next one binds', () => {
    // Level 1: both scenes bind. UIScene is launched once and stays running.
    bindBothScenes();
    // GameScene.shutdown clones every .tower-btn to drop its own handlers,
    // which strips anything else bound to those nodes too.
    document.querySelectorAll('.tower-btn').forEach(b => b.replaceWith(b.cloneNode(true)));
    // Level 2: only GameScene binds again.
    const gs = Object.create(GameScene.prototype);
    gs.selectedType = null;
    gs._closeTowerPanel = () => {};
    gs._bindDOMEvents();

    btn('ice').dispatchEvent(new MouseEvent('mouseenter'));

    const tt = document.getElementById('tower-tooltip');
    expect(tt.style.display).toBe('block');
    expect(tt.textContent).toContain(TOWER_DEFS.ice.name);
  });

  it('hides on mouseleave', () => {
    bindBothScenes();
    btn('ice').dispatchEvent(new MouseEvent('mouseenter'));
    btn('ice').dispatchEvent(new MouseEvent('mouseleave'));
    expect(document.getElementById('tower-tooltip').style.display).toBe('none');
  });
});

describe('speed button label', () => {
  beforeEach(setupDOM);

  it('starts each level on the 1x label, whatever the last level left', () => {
    // Shutdown clones the button, text included: a level quit at 2x would
    // otherwise open the next one, at 1x, reading "⏸ 1x".
    document.getElementById('speed-btn').textContent = '⏸ 1x';
    const gs = bindBothScenes();
    gs.speed = 1;
    gs._bindDOMEvents();
    expect(document.getElementById('speed-btn').textContent).toBe('⏩ 2x');
  });
});
