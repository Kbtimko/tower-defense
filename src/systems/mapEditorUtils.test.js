// src/systems/mapEditorUtils.test.js
import { roundCoord, serializeMapArrays, slotInPathCorridor } from './mapEditorUtils.js';

describe('roundCoord', () => {
  it('rounds to 3 decimals and strips trailing zeros', () => {
    expect(roundCoord(0.12345)).toBe(0.123);
    expect(roundCoord(0.5)).toBe(0.5);
    expect(roundCoord(0)).toBe(0);
    expect(roundCoord(1)).toBe(1);
  });
});

describe('serializeMapArrays', () => {
  it('emits a maps.js-ready snippet with rounded coords', () => {
    const out = serializeMapArrays(
      [[0, 0.35], [0.18123, 0.35]],
      [[0.1, 0.55], [0.30001, 0.88]],
    );
    expect(out).toBe(
      'waypoints: [[0,0.35],[0.181,0.35]],\n' +
      'towerSlots: [[0.1,0.55],[0.3,0.88]],',
    );
  });
});

describe('slotInPathCorridor', () => {
  // Path is the L (0,0)->(1,0)->(1,1) in normalized space; corridor ~0.05.
  const wp = [[0, 0], [1, 0], [1, 1]];
  it('flags a slot sitting on the path', () => {
    expect(slotInPathCorridor([0.5, 0.0], wp, 0.05)).toBe(true);
  });
  it('passes a slot clear of the path', () => {
    expect(slotInPathCorridor([0.5, 0.5], wp, 0.05)).toBe(false);
  });
});
