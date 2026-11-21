import { afterEach, describe, expect, it } from 'vitest';
import { CANVAS_WIDTH } from '../data/layout.js';
import { RENDER_SCALE } from '../data/renderScale.js';
import {
  getRenderScale,
  parseRenderScaleOverride,
  renderScaleFor,
  setRenderScale,
  viewportCssSize,
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
    const dpr = RENDER_SCALE.minDpr;
    const at = (RENDER_SCALE.threshold * CANVAS_WIDTH) / dpr;
    expect(renderScaleFor({ cssWidth: at, cssHeight: 99999, dpr })).toBe(2);
    expect(renderScaleFor({ cssWidth: at - 1, cssHeight: 99999, dpr })).toBe(1);
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

describe('renderScaleFor landscape normalisation', () => {
  it('treats a portrait phone as landscape when asked', () => {
    expect(renderScaleFor({ cssWidth: 390, cssHeight: 844, dpr: 3, landscape: true })).toBe(2);
    expect(renderScaleFor({ cssWidth: 390, cssHeight: 844, dpr: 3 })).toBe(1);
  });
  it('leaves a landscape input unchanged by the flag', () => {
    expect(renderScaleFor({ cssWidth: 844, cssHeight: 390, dpr: 3, landscape: true })).toBe(2);
    expect(renderScaleFor({ cssWidth: 1440, cssHeight: 900, dpr: 1, landscape: true })).toBe(1);
  });
});

describe('renderScaleFor minDpr', () => {
  it('keeps DPR-1 desktops at 1 however large', () => {
    expect(renderScaleFor({ cssWidth: 1920, cssHeight: 1080, dpr: 1 })).toBe(1);
    expect(renderScaleFor({ cssWidth: 2560, cssHeight: 1440, dpr: 1 })).toBe(1);
    expect(renderScaleFor({ cssWidth: 1536, cssHeight: 864, dpr: 1.25 })).toBe(1);
  });
  it('still picks 2 at 2x density', () => {
    expect(renderScaleFor({ cssWidth: 1440, cssHeight: 900, dpr: 2 })).toBe(2);
  });
  it('picks 2 at exactly minDpr with enough device pixels', () => {
    expect(renderScaleFor({ cssWidth: 99999, cssHeight: 99999, dpr: RENDER_SCALE.minDpr })).toBe(2);
    expect(renderScaleFor({ cssWidth: 99999, cssHeight: 99999, dpr: RENDER_SCALE.minDpr - 0.01 })).toBe(1);
  });
});

describe('viewportCssSize', () => {
  const win = { innerWidth: 1000, innerHeight: 700 };
  it('uses the rect when both sides are positive', () => {
    expect(viewportCssSize({ width: 800, height: 600 }, win)).toEqual({ cssWidth: 800, cssHeight: 600 });
  });
  it('falls back to the window for a zero-width rect', () => {
    expect(viewportCssSize({ width: 0, height: 600 }, win)).toEqual({ cssWidth: 1000, cssHeight: 700 });
  });
  it('falls back to the window for a zero-height rect', () => {
    expect(viewportCssSize({ width: 800, height: 0 }, win)).toEqual({ cssWidth: 1000, cssHeight: 700 });
  });
  it('falls back to the window for a null rect', () => {
    expect(viewportCssSize(null, win)).toEqual({ cssWidth: 1000, cssHeight: 700 });
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
