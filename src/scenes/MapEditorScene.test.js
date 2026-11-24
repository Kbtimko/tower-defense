vi.mock('phaser', () => ({
  default: { Scene: class { constructor(key) { this._key = key; } }, Math: { Clamp: (v, a, b) => Math.min(b, Math.max(a, v)) } },
}));

import { describe, it, expect, vi } from 'vitest';
import MapEditorScene from './MapEditorScene.js';

function makeEditor() {
  const s = Object.create(MapEditorScene.prototype);
  Object.assign(s, { drag: null, waypoints: [[0, 0.5], [1, 0.5]], slots: [], W: 1280, H: 720 });
  s._hitTest = vi.fn(() => null);
  s._insertWaypointAt = vi.fn();
  s._render = vi.fn();
  return s;
}
const down = (over, extra = {}) => ({
  worldX: 640, worldY: 360, camera: over ? {} : undefined, rightButtonDown: () => false, ...extra,
});

describe('MapEditorScene pointerdown', () => {
  it('inserts a waypoint at the world point on an empty map click', () => {
    const s = makeEditor();
    s._onPointerDown(down(true));
    expect(s._insertWaypointAt).toHaveBeenCalledWith(640, 360);
  });

  // Over a HUD rail Phaser fires the event with no camera and a stale worldX/Y.
  it('ignores a click over a rail (no camera under the pointer)', () => {
    const s = makeEditor();
    s._onPointerDown(down(false));
    expect(s._hitTest).not.toHaveBeenCalled();
    expect(s._insertWaypointAt).not.toHaveBeenCalled();
    expect(s.drag).toBeNull();
  });
});
