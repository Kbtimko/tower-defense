// The radial (roadmap 3.3) replaced #tower-panel. UIScene once carried a second
// panel copy wired to 'tower:panel-open' / 'tower:panel-close', which nothing
// emitted — so #20 updated one picker and the other silently went stale. These
// pin that the panel is gone everywhere, not just from GameScene.

vi.mock('phaser', () => ({
  default: {
    Scene: class { constructor(key) { this._key = key; } },
    GameObjects: { Container: class {} },
  },
}));

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import UIScene from './UIScene.js';
import GameScene from './GameScene.js';

const SRC = join(__dirname, '..');
const SELF = 'scenes/UIScene.towerPanel.test.js';
const srcFiles = readdirSync(SRC, { recursive: true })
  .filter((f) => f.endsWith('.js') && f !== SELF)
  .map((f) => ({ f, text: readFileSync(join(SRC, f), 'utf8') }));
const indexHtml = readFileSync(join(SRC, '..', 'index.html'), 'utf8');

describe('the tower panel is gone', () => {
  it('no file in src mentions tower-panel', () => {
    expect(srcFiles.length).toBeGreaterThan(50);
    expect(srcFiles.filter(({ text }) => text.includes('tower-panel')).map(({ f }) => f)).toEqual([]);
  });

  it('index.html ships no panel markup, panel ids or panel-only CSS', () => {
    for (const needle of ['tower-panel', 'panel-upgrade-btn', 'panel-sell-btn', 'panel-reposition-btn',
      'panel-branch-picker', 'branch-choose-btn', 'branch-card', '.upgrade-btn', '.sell-btn', '.reposition-btn']) {
      expect(indexHtml.includes(needle), needle).toBe(false);
    }
  });

  it('GameScene carries none of the panel methods', () => {
    for (const m of ['_openTowerPanel', '_closeTowerPanel', '_setUpgradeButton', '_renderBranchPicker',
      '_renderArmourLine', '_openPanelFromTap', '_bindConfirmable', '_resetConfirm']) {
      expect(GameScene.prototype[m], m).toBeUndefined();
    }
  });

  it('UIScene subscribes to no tower-panel event', () => {
    const subscribed = [];
    const scene = Object.create(UIScene.prototype);
    scene.game = { events: { on: (name) => subscribed.push(name), off() {} } };
    scene._subscribeToGameEvents();
    expect(subscribed.filter(n => n.startsWith('tower:panel'))).toEqual([]);
  });

  it('UIScene carries no tower-panel or branch-picker renderer', () => {
    for (const m of ['_onPanelOpen', '_onPanelClose', '_setUpgradeButton', '_renderBranchPicker']) {
      expect(UIScene.prototype[m]).toBeUndefined();
    }
  });
});
