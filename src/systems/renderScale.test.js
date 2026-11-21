import { afterEach, describe, expect, it } from 'vitest';
import { CANVAS_WIDTH } from '../data/layout.js';
import { RENDER_SCALE } from '../data/renderScale.js';
import {
  getRenderScale,
  parseRenderScaleOverride,
  renderScaleFor,
  setRenderScale,
} from './renderScale.js';

afterEach(() => setRenderScale(1));

describe('renderScaleFor', () => {
  it('fits by the tighter axis', () => {
    expect(renderScaleFor({ cssWidth: 1440, cssHeight: 900, dpr: 2 })).toBe(2);
    expect(renderScaleFor({ cssWidth: 1440, cssHeight: 900, dpr: 1 })).toBe(1);
    expect(renderScaleFor({ cssWidth: 844, cssHeight: 390, dpr: 3 })).toBe(2);
    expect(renderScaleFor({ cssWidth: 390, cssHeight: 844, dpr: 3 })).toBe(1);
  });

  it('flips to 2 exactly at the threshold', () => {
    const at = RENDER_SCALE.threshold * CANVAS_WIDTH;
    expect(renderScaleFor({ cssWidth: at, cssHeight: 99999, dpr: 1 })).toBe(2);
    expect(renderScaleFor({ cssWidth: at - 1, cssHeight: 99999, dpr: 1 })).toBe(1);
  });

  it('gives 1 for degenerate inputs', () => {
    for (const dpr of [undefined, 0, NaN]) {
      expect(renderScaleFor({ cssWidth: 1440, cssHeight: 900, dpr })).toBe(1);
    }
    expect(renderScaleFor({ cssWidth: 0, cssHeight: 900, dpr: 2 })).toBe(1);
    expect(renderScaleFor({ cssWidth: 1440, cssHeight: 0, dpr: 2 })).toBe(1);
  });

  it('never exceeds RENDER_SCALE.max', () => {
    const original = RENDER_SCALE.max;
    RENDER_SCALE.max = 1;
    try {
      expect(renderScaleFor({ cssWidth: 1440, cssHeight: 900, dpr: 2 })).toBe(1);
    } finally {
      RENDER_SCALE.max = original;
    }
  });
});

describe('parseRenderScaleOverride', () => {
  it('accepts only res=1 and res=2', () => {
    expect(parseRenderScaleOverride('?res=2')).toBe(2);
    expect(parseRenderScaleOverride('?res=1')).toBe(1);
    expect(parseRenderScaleOverride('?res=3')).toBeNull();
    expect(parseRenderScaleOverride('?res=abc')).toBeNull();
    expect(parseRenderScaleOverride('')).toBeNull();
  });
});

describe('render scale state', () => {
  it('defaults to 1 and stores what is set', () => {
    expect(getRenderScale()).toBe(1);
    setRenderScale(2);
    expect(getRenderScale()).toBe(2);
  });
});
