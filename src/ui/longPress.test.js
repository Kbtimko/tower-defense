import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { attachLongPress } from './longPress.js';
import { LONG_PRESS_MS, TAP_SLOP_PX } from '../data/input.js';

const ptr = (type, pointerType, x = 0, y = 0) =>
  Object.assign(new Event(type, { bubbles: true, cancelable: true }), { pointerType, clientX: x, clientY: y });
const clickEv = () => new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 });

describe('attachLongPress', () => {
  let wrap, btn, onLongPress, onEnd, detach, ownerClick;
  beforeEach(() => {
    vi.useFakeTimers();
    document.body.replaceChildren();
    wrap = document.createElement('div');
    btn = document.createElement('button');
    wrap.appendChild(btn);
    document.body.appendChild(wrap);
    onLongPress = vi.fn(); onEnd = vi.fn(); ownerClick = vi.fn();
    btn.addEventListener('click', ownerClick);
    detach = attachLongPress(wrap, { onLongPress, onEnd });
  });
  afterEach(() => { detach(); vi.useRealTimers(); });

  it('fires after LONG_PRESS_MS of a held touch, not before', () => {
    btn.dispatchEvent(ptr('pointerdown', 'touch'));
    vi.advanceTimersByTime(LONG_PRESS_MS - 1);
    expect(onLongPress).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onLongPress).toHaveBeenCalledWith(wrap);
  });

  it('never fires for a mouse press', () => {
    btn.dispatchEvent(ptr('pointerdown', 'mouse'));
    vi.advanceTimersByTime(LONG_PRESS_MS * 2);
    expect(onLongPress).not.toHaveBeenCalled();
  });

  it('a release before the threshold is a tap: no long-press, click untouched', () => {
    btn.dispatchEvent(ptr('pointerdown', 'touch'));
    vi.advanceTimersByTime(100);
    btn.dispatchEvent(ptr('pointerup', 'touch'));
    vi.advanceTimersByTime(LONG_PRESS_MS);
    btn.dispatchEvent(clickEv());
    expect(onLongPress).not.toHaveBeenCalled();
    expect(onEnd).not.toHaveBeenCalled();
    expect(ownerClick).toHaveBeenCalledTimes(1);
  });

  it('moving beyond the slop cancels; within the slop does not', () => {
    btn.dispatchEvent(ptr('pointerdown', 'touch', 10, 10));
    btn.dispatchEvent(ptr('pointermove', 'touch', 10 + TAP_SLOP_PX, 10));
    vi.advanceTimersByTime(LONG_PRESS_MS);
    expect(onLongPress).toHaveBeenCalledTimes(1);

    onLongPress.mockClear();
    btn.dispatchEvent(ptr('pointerup', 'touch'));
    btn.dispatchEvent(ptr('pointerdown', 'touch', 10, 10));
    btn.dispatchEvent(ptr('pointermove', 'touch', 10 + TAP_SLOP_PX + 1, 10));
    vi.advanceTimersByTime(LONG_PRESS_MS);
    expect(onLongPress).not.toHaveBeenCalled();
  });

  it('pointercancel clears a pending press', () => {
    btn.dispatchEvent(ptr('pointerdown', 'touch'));
    btn.dispatchEvent(ptr('pointercancel', 'touch'));
    vi.advanceTimersByTime(LONG_PRESS_MS);
    expect(onLongPress).not.toHaveBeenCalled();
  });

  it('swallows the click after a long-press, once, before the owner handler', () => {
    btn.dispatchEvent(ptr('pointerdown', 'touch'));
    vi.advanceTimersByTime(LONG_PRESS_MS);
    btn.dispatchEvent(ptr('pointerup', 'touch'));
    expect(onEnd).toHaveBeenCalledWith(wrap);
    btn.dispatchEvent(clickEv());
    expect(ownerClick).not.toHaveBeenCalled();
    btn.dispatchEvent(clickEv());
    expect(ownerClick).toHaveBeenCalledTimes(1);
  });

  it('a new pointerdown drops a swallower whose click never came', () => {
    btn.dispatchEvent(ptr('pointerdown', 'touch'));
    vi.advanceTimersByTime(LONG_PRESS_MS);
    btn.dispatchEvent(ptr('pointerup', 'touch'));
    btn.dispatchEvent(ptr('pointerdown', 'touch'));
    btn.dispatchEvent(ptr('pointerup', 'touch'));
    btn.dispatchEvent(clickEv());
    expect(ownerClick).toHaveBeenCalledTimes(1);
  });

  it('a MOUSE pointerdown also drops a stale swallower', () => {
    btn.dispatchEvent(ptr('pointerdown', 'touch'));
    vi.advanceTimersByTime(LONG_PRESS_MS);
    btn.dispatchEvent(ptr('pointerup', 'touch'));
    btn.dispatchEvent(ptr('pointerdown', 'mouse'));
    btn.dispatchEvent(clickEv());
    expect(ownerClick).toHaveBeenCalledTimes(1);
  });

  it('pointercancel after a long-press ends it and leaves no swallower', () => {
    btn.dispatchEvent(ptr('pointerdown', 'touch'));
    vi.advanceTimersByTime(LONG_PRESS_MS);
    btn.dispatchEvent(ptr('pointercancel', 'touch'));
    expect(onEnd).toHaveBeenCalledTimes(1);
    btn.dispatchEvent(clickEv());
    expect(ownerClick).toHaveBeenCalledTimes(1);
  });

  it('prevents the context menu while pressing only', () => {
    const during = new Event('contextmenu', { bubbles: true, cancelable: true });
    btn.dispatchEvent(ptr('pointerdown', 'touch'));
    btn.dispatchEvent(during);
    expect(during.defaultPrevented).toBe(true);
    btn.dispatchEvent(ptr('pointerup', 'touch'));
    const after = new Event('contextmenu', { bubbles: true, cancelable: true });
    btn.dispatchEvent(after);
    expect(after.defaultPrevented).toBe(false);
  });

  it('detach clears a pending timer and removes every listener', () => {
    btn.dispatchEvent(ptr('pointerdown', 'touch'));
    detach();
    vi.advanceTimersByTime(LONG_PRESS_MS);
    expect(onLongPress).not.toHaveBeenCalled();
    btn.dispatchEvent(ptr('pointerdown', 'touch'));
    vi.advanceTimersByTime(LONG_PRESS_MS);
    expect(onLongPress).not.toHaveBeenCalled();
  });
});
