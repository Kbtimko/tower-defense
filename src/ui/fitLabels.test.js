import { describe, it, expect, vi } from 'vitest';
import { fittedFontPx, fitLabels, textWidthOf } from './fitLabels.js';

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
  box.style.padding = '0';
  const el = tag === 'span' ? document.createElement('span') : document.createElement('button');
  el.style.fontSize = `${css}px`;
  el.style.padding = '0';   // jsdom's default button has 6px side padding
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
    fitLabels([wide, ok], { baseFontPx: el => Number(el.dataset.basePx), measureText: el => el.scrollWidth });
    expect(wide.style.fontSize).toBe('18.75px');
    expect(ok.style.fontSize).toBe('');
  });

  it('fits a plain-text button by its text width, and regrows when the text fits again', () => {
    document.body.replaceChildren();
    const btn = label('button', { natural: 95.7, available: 82 });
    fitLabels([btn], { baseFontPx: el => Number(el.dataset.basePx), measureText: el => el.scrollWidth });
    expect(btn.style.fontSize).toBe(`${Math.floor((24 * 82 / 95.7) * 4) / 4}px`);
    Object.defineProperty(btn, 'scrollWidth', { configurable: true, get: () => 70 });
    fitLabels([btn], { baseFontPx: el => Number(el.dataset.basePx), measureText: el => el.scrollWidth });
    expect(btn.style.fontSize).toBe('');
  });
});

// The label must clear the ring, so the padding comes off what it may use.
describe('fitLabels padding', () => {
  it('fits a plain button to its content box (clientWidth minus horizontal padding)', () => {
    document.body.replaceChildren();
    const btn = label('button', { natural: 80, available: 82 });
    btn.style.paddingLeft = '4px';
    btn.style.paddingRight = '4px';
    fitLabels([btn], { baseFontPx: el => Number(el.dataset.basePx), measureText: el => el.scrollWidth });
    expect(btn.style.fontSize).toBe(`${Math.floor((24 * 74 / 80) * 4) / 4}px`);
  });
});

describe('fitLabels span padding', () => {
  it('fits a span label to its button content box, not the padded face', () => {
    document.body.replaceChildren();
    const wide = label('span', { natural: 80, available: 82 });
    wide.parentElement.style.paddingLeft = '4px';
    wide.parentElement.style.paddingRight = '4px';
    fitLabels([wide], { baseFontPx: el => Number(el.dataset.basePx) });
    expect(wide.style.fontSize).toBe(`${Math.floor((24 * 74 / 80) * 4) / 4}px`);
  });
});

describe('textWidthOf', () => {
  it('reports the text width in untransformed px (range rect over the layer scale)', () => {
    const btn = document.createElement('button');
    btn.textContent = 'Codex';
    Object.defineProperty(btn, 'offsetWidth', { configurable: true, get: () => 88 });
    btn.getBoundingClientRect = () => ({ width: 44 });
    const range = { selectNodeContents: () => {}, getBoundingClientRect: () => ({ width: 30 }) };
    const spy = vi.spyOn(document, 'createRange').mockReturnValue(range);
    expect(textWidthOf(btn)).toBe(60);
    btn.getBoundingClientRect = () => ({ width: 0 });
    expect(textWidthOf(btn)).toBe(0);
    spy.mockRestore();
  });
});

describe('fitLabels convergence', () => {
  // Real text is not perfectly linear (an emoji glyph, hinting): one pass can
  // land a hair wide, so the fit re-measures until it fits.
  it('re-measures and shrinks again when the first estimate is still too wide', () => {
    document.body.replaceChildren();
    const box = document.createElement('div');
    const btn = document.createElement('button');
    btn.style.padding = '0';
    box.appendChild(btn);
    document.body.appendChild(box);
    // 96 at 24px, plus a fixed 10-px glyph that does not scale.
    Object.defineProperty(btn, 'scrollWidth', { configurable: true, get: () => 86 * (parseFloat(btn.style.fontSize || 24) / 24) + 10 });
    Object.defineProperty(btn, 'clientWidth', { configurable: true, get: () => 82 });
    fitLabels([btn], { baseFontPx: () => 24, measureText: el => el.scrollWidth });
    expect(btn.scrollWidth).toBeLessThanOrEqual(82);
  });
});
