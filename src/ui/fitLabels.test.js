import { describe, it, expect } from 'vitest';
import { fittedFontPx, fitLabels } from './fitLabels.js';

describe('fittedFontPx', () => {
  it('keeps the size when the label fits', () => {
    expect(fittedFontPx({ fontPx: 24, naturalWidth: 80, available: 82 })).toBe(24);
    expect(fittedFontPx({ fontPx: 24, naturalWidth: 82, available: 82 })).toBe(24);
  });
  // Text width scales linearly with font size; floored to a quarter px so the
  // fitted label is never a hair wider than its cell.
  it('shrinks proportionally to the available width', () => {
    expect(fittedFontPx({ fontPx: 24, naturalWidth: 104.6, available: 82 })).toBe(18.75);
    // 19.68 rounds DOWN: rounding up would leave the label a fraction too wide.
    expect(fittedFontPx({ fontPx: 24, naturalWidth: 100, available: 82 })).toBe(19.5);
  });
  it('ignores an unmeasurable (hidden) label', () => {
    expect(fittedFontPx({ fontPx: 24, naturalWidth: 0, available: 0 })).toBe(24);
  });
});

// jsdom has no layout, so widths are stubbed; width tracks the inline font size
// the way real text does.
function label(tag, { natural, available, css = 24 }) {
  const box = document.createElement(tag === 'span' ? 'button' : 'div');
  const el = tag === 'span' ? document.createElement('span') : document.createElement('button');
  el.style.fontSize = `${css}px`;
  el.dataset.basePx = String(css);
  const width = () => natural * (parseFloat(el.style.fontSize || css) / css);
  if (tag === 'span') {
    box.appendChild(el);
    Object.defineProperty(el, 'offsetWidth', { configurable: true, get: width });
    Object.defineProperty(box, 'clientWidth', { configurable: true, get: () => available });
  } else {
    box.appendChild(el);
    Object.defineProperty(el, 'scrollWidth', { configurable: true, get: width });
    Object.defineProperty(el, 'clientWidth', { configurable: true, get: () => available });
  }
  document.body.appendChild(box);
  return el;
}

describe('fitLabels', () => {
  it('shrinks an over-wide span to its button and leaves a fitting one alone', () => {
    document.body.replaceChildren();
    const wide = label('span', { natural: 104.6, available: 82 });
    const ok = label('span', { natural: 60, available: 82 });
    fitLabels([wide, ok], { baseFontPx: el => Number(el.dataset.basePx) });
    expect(wide.style.fontSize).toBe('18.75px');
    expect(ok.style.fontSize).toBe('');
  });

  it('fits a plain-text button by its scroll width, and regrows when the text fits again', () => {
    document.body.replaceChildren();
    const btn = label('button', { natural: 95.7, available: 82 });
    fitLabels([btn], { baseFontPx: el => Number(el.dataset.basePx) });
    expect(btn.style.fontSize).toBe(`${Math.floor((24 * 82 / 95.7) * 4) / 4}px`);
    Object.defineProperty(btn, 'scrollWidth', { configurable: true, get: () => 70 });
    fitLabels([btn], { baseFontPx: el => Number(el.dataset.basePx) });
    expect(btn.style.fontSize).toBe('');
  });
});

describe('fitLabels convergence', () => {
  // Real text is not perfectly linear (an emoji glyph, hinting): one pass can
  // land a hair wide, so the fit re-measures until it fits.
  it('re-measures and shrinks again when the first estimate is still too wide', () => {
    document.body.replaceChildren();
    const box = document.createElement('div');
    const btn = document.createElement('button');
    box.appendChild(btn);
    document.body.appendChild(box);
    // 96 at 24px, plus a fixed 10-px glyph that does not scale.
    Object.defineProperty(btn, 'scrollWidth', { configurable: true, get: () => 86 * (parseFloat(btn.style.fontSize || 24) / 24) + 10 });
    Object.defineProperty(btn, 'clientWidth', { configurable: true, get: () => 82 });
    fitLabels([btn], { baseFontPx: () => 24 });
    expect(btn.scrollWidth).toBeLessThanOrEqual(82);
  });
});
