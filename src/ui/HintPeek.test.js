import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LONG_PRESS_MS, PEEK_LINGER_MS } from '../data/input.js';
import { attachHint as rawAttach } from './HintPeek.js';

// Module state is shared across tests, so every attach is detached afterwards.
const detachers = [];
function attachHint(a, g) { const d = rawAttach(a, g); detachers.push(d); return d; }

function setupDom() {
  document.body.replaceChildren();
  const peek = document.createElement('div');
  peek.id = 'hint-peek';
  document.body.appendChild(peek);
  const anchor = document.createElement('button');
  document.body.appendChild(anchor);
  return { peek, anchor };
}
const ptr = (el, type, pointerType) =>
  el.dispatchEvent(Object.assign(new Event(type, { bubbles: true }), { pointerType, clientX: 0, clientY: 0 }));

describe('HintPeek', () => {
  let dom;
  beforeEach(() => { vi.useFakeTimers(); dom = setupDom(); });
  afterEach(() => { detachers.splice(0).forEach((d) => d()); vi.useRealTimers(); });

  it('shows the text on mouse hover and hides on leave', () => {
    attachHint(dom.anchor, () => 'Pause it');
    ptr(dom.anchor, 'pointerenter', 'mouse');
    expect(dom.peek.classList.contains('shown')).toBe(true);
    expect(dom.peek.textContent).toBe('Pause it');
    ptr(dom.anchor, 'pointerleave', 'mouse');
    expect(dom.peek.classList.contains('shown')).toBe(false);
  });

  it('ignores touch pointerenter (a tap must not flash the hint)', () => {
    attachHint(dom.anchor, () => 'x');
    ptr(dom.anchor, 'pointerenter', 'touch');
    expect(dom.peek.classList.contains('shown')).toBe(false);
  });

  it('re-reads the text on every show', () => {
    let t = 'a';
    attachHint(dom.anchor, () => t);
    ptr(dom.anchor, 'pointerenter', 'mouse');
    ptr(dom.anchor, 'pointerleave', 'mouse');
    t = 'b';
    ptr(dom.anchor, 'pointerenter', 'mouse');
    expect(dom.peek.textContent).toBe('b');
  });

  it('does not show when the text is empty', () => {
    attachHint(dom.anchor, () => '');
    ptr(dom.anchor, 'pointerenter', 'mouse');
    expect(dom.peek.classList.contains('shown')).toBe(false);
  });

  it('shows on keyboard focus, hides on focusout', () => {
    attachHint(dom.anchor, () => 'k');
    // jsdom has no real :focus-visible; stub it as a keyboard focus would be.
    const e = new Event('focusin', { bubbles: true });
    Object.defineProperty(e, 'target', { value: { matches: () => true } });
    dom.anchor.dispatchEvent(e);
    expect(dom.peek.classList.contains('shown')).toBe(true);
    dom.anchor.dispatchEvent(new Event('focusout', { bubbles: true }));
    expect(dom.peek.classList.contains('shown')).toBe(false);
  });

  it('a non-keyboard focus (tap) does not show', () => {
    attachHint(dom.anchor, () => 'k');
    const e = new Event('focusin', { bubbles: true });
    Object.defineProperty(e, 'target', { value: { matches: () => false } });
    dom.anchor.dispatchEvent(e);
    expect(dom.peek.classList.contains('shown')).toBe(false);
  });

  it('long-press shows, swallows the click, and lingers then hides', () => {
    attachHint(dom.anchor, () => 'lp');
    const click = vi.fn();
    dom.anchor.addEventListener('click', click);
    ptr(dom.anchor, 'pointerdown', 'touch');
    vi.advanceTimersByTime(LONG_PRESS_MS);
    expect(dom.peek.classList.contains('shown')).toBe(true);
    ptr(dom.anchor, 'pointerup', 'touch');
    dom.anchor.click();
    expect(click).not.toHaveBeenCalled();
    vi.advanceTimersByTime(PEEK_LINGER_MS - 1);
    expect(dom.peek.classList.contains('shown')).toBe(true);
    vi.advanceTimersByTime(1);
    expect(dom.peek.classList.contains('shown')).toBe(false);
  });

  it('Esc hides it', () => {
    attachHint(dom.anchor, () => 'e');
    ptr(dom.anchor, 'pointerenter', 'mouse');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(dom.peek.classList.contains('shown')).toBe(false);
  });

  it('detach removes hover and long-press and hides a shown hint', () => {
    const detach = attachHint(dom.anchor, () => 'd');
    ptr(dom.anchor, 'pointerenter', 'mouse');
    detach();
    expect(dom.peek.classList.contains('shown')).toBe(false);
    ptr(dom.anchor, 'pointerenter', 'mouse');
    expect(dom.peek.classList.contains('shown')).toBe(false);
    ptr(dom.anchor, 'pointerdown', 'touch');
    vi.advanceTimersByTime(LONG_PRESS_MS);
    expect(dom.peek.classList.contains('shown')).toBe(false);
  });

  it('detach of one anchor leaves another anchor working, and Esc is unhooked after the last', () => {
    const other = document.createElement('button');
    document.body.appendChild(other);
    const d1 = attachHint(dom.anchor, () => 'one');
    const d2 = attachHint(other, () => 'two');
    d1();
    ptr(other, 'pointerenter', 'mouse');
    expect(dom.peek.textContent).toBe('two');
    d2();
    const spy = vi.spyOn(dom.peek.classList, 'remove');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(spy).not.toHaveBeenCalled();
  });

  it('is a no-op without an anchor or peek element', () => {
    expect(() => attachHint(null, () => 'x')()).not.toThrow();
    dom.peek.remove();
    const d = attachHint(dom.anchor, () => 'x');
    expect(() => ptr(dom.anchor, 'pointerenter', 'mouse')).not.toThrow();
    d();
  });
});
