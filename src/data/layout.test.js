import { describe, it, expect } from 'vitest';
import {
  WORLD_WIDTH, isPointerFine, railMetricsFor,
  HUD_CELL, RAIL_WIDTH, CANVAS_WIDTH, HUD_K, POINTER_FINE,
} from './layout.js';
import { POINTER_FINE_QUERY } from './mobile.js';

describe('railMetricsFor', () => {
  it('fine pointer: 52-px cells, 104-px rails', () => {
    expect(railMetricsFor({ pointerFine: true })).toEqual({ hudCell: 52, railWidth: 104, canvasWidth: 1488, hudK: 52 / 88 });
  });
  it('touch: 88-px cells, 176-px rails, k = 1', () => {
    expect(railMetricsFor({ pointerFine: false })).toEqual({ hudCell: 88, railWidth: 176, canvasWidth: 1632, hudK: 1 });
  });
  it.each([true, false])('rail = 2 cells and canvas = world + 2 rails (pointerFine=%s)', (pointerFine) => {
    const m = railMetricsFor({ pointerFine });
    expect(m.railWidth).toBe(2 * m.hudCell);
    expect(m.canvasWidth).toBe(WORLD_WIDTH + 2 * m.railWidth);
  });
});

describe('isPointerFine', () => {
  it('is false without a window or matchMedia', () => {
    expect(isPointerFine(undefined)).toBe(false);
    expect(isPointerFine({})).toBe(false);
    expect(isPointerFine({ matchMedia: () => null })).toBe(false);
  });
  it('asks matchMedia as a method on the window (bare calls throw Illegal invocation)', () => {
    const win = {
      matchMedia(q) {
        if (this !== win) throw new TypeError('Illegal invocation');
        return { matches: q === POINTER_FINE_QUERY };
      },
    };
    expect(isPointerFine(win)).toBe(true);
    expect(isPointerFine({ matchMedia: () => ({ matches: false }) })).toBe(false);
  });
  it('queries (pointer: fine)', () => {
    expect(POINTER_FINE_QUERY).toBe('(pointer: fine)');
  });
});

describe('resolved exports (jsdom has no matchMedia)', () => {
  it('resolve to the touch metrics', () => {
    expect(POINTER_FINE).toBe(false);
    expect({ hudCell: HUD_CELL, railWidth: RAIL_WIDTH, canvasWidth: CANVAS_WIDTH, hudK: HUD_K })
      .toEqual(railMetricsFor({ pointerFine: false }));
  });
});
