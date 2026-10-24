import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

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
import { StoryDialogOverlay } from '../ui/StoryDialogOverlay.js';
import { MAPS } from '../data/maps.js';
import { STORY_SEQUENCES, briefKey } from '../data/story.js';
import { mountMapSelectDom } from './mapSelectDom.testutil.js';

// GameScene.create plays the map's briefing while UIScene (launched once, never
// stopped) already listens on document for Space/Escape/Q. The dialog's
// capture-phase keydown must keep those keys from reaching UIScene.
function makeRunningUIScene() {
  const scene = Object.create(UIScene.prototype);
  const emit = vi.fn();
  scene.game = { events: { emit, on() {}, off() {} } };
  scene.scene = { isActive: (key) => key === 'GameScene', isPaused: () => false };
  scene._bindDOMEvents();
  return { scene, emit };
}

const press = (key) => {
  const e = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  (document.activeElement || document.body).dispatchEvent(e);
  return e;
};

describe('GameScene briefing keys', () => {
  let ui;
  let overlay;
  const briefId = briefKey(MAPS[0].storyKey);

  beforeEach(() => {
    mountMapSelectDom();
    ui = makeRunningUIScene();
    overlay = new StoryDialogOverlay({ motion: () => true });
  });

  afterEach(() => {
    overlay.close();
    document.removeEventListener('keydown', ui.scene._onKeyDown);
  });

  it('the first map has a briefing to play', () => {
    expect(STORY_SEQUENCES[briefId]?.panels.length).toBeGreaterThan(0);
  });

  it('Space during the briefing does not emit ui:pause-toggle', () => {
    overlay.play(briefId, () => {});
    press(' ');
    expect(ui.emit).not.toHaveBeenCalledWith('ui:pause-toggle');
  });

  it('Escape and Q during the briefing reach no UIScene action', () => {
    overlay.play(briefId, () => {});
    press('q');
    press('Escape');
    expect(ui.emit).not.toHaveBeenCalled();
  });

  it('Space toggles pause again once the briefing is closed', () => {
    overlay.play(briefId, () => {});
    overlay.close();
    press(' ');
    expect(ui.emit).toHaveBeenCalledWith('ui:pause-toggle');
  });
});
