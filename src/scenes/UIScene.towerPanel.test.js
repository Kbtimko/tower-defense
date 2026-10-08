// GameScene owns the tower panel and its branch picker (_openTowerPanel).
// UIScene once carried a second copy wired to 'tower:panel-open' /
// 'tower:panel-close', which nothing emits — so #20 updated one picker and the
// other silently went stale. Pin that UIScene stays out of the panel.

vi.mock('phaser', () => ({
  default: {
    Scene: class { constructor(key) { this._key = key; } },
    GameObjects: { Container: class {} },
  },
}));

import { describe, it, expect, vi } from 'vitest';
import UIScene from './UIScene.js';

describe('UIScene and the tower panel', () => {
  it('subscribes to no tower-panel event', () => {
    const subscribed = [];
    const scene = Object.create(UIScene.prototype);
    scene.game = { events: { on: (name) => subscribed.push(name), off() {} } };
    scene._subscribeToGameEvents();
    expect(subscribed.filter(n => n.startsWith('tower:panel'))).toEqual([]);
  });

  it('carries no tower-panel or branch-picker renderer', () => {
    for (const m of ['_onPanelOpen', '_onPanelClose', '_setUpgradeButton', '_renderBranchPicker']) {
      expect(UIScene.prototype[m]).toBeUndefined();
    }
  });
});
