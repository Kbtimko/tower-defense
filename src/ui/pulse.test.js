import { describe, it, expect, vi } from 'vitest';
import { pulseClass } from './pulse.js';

describe('pulseClass', () => {
  it('leaves the class present after repeated calls, never duplicated', () => {
    const el = document.createElement('div');
    pulseClass(el, 'life-lost-pulse');
    pulseClass(el, 'life-lost-pulse');
    pulseClass(el, 'life-lost-pulse');
    expect(el.classList.contains('life-lost-pulse')).toBe(true);
    expect(el.className).toBe('life-lost-pulse');
  });

  it('removes the class and reads offsetWidth before re-adding it', () => {
    const el = document.createElement('div');
    el.classList.add('life-lost-pulse');
    const seen = [];
    Object.defineProperty(el, 'offsetWidth', {
      configurable: true,
      get() {
        seen.push(el.classList.contains('life-lost-pulse'));
        return 0;
      },
    });
    pulseClass(el, 'life-lost-pulse');
    // The read must happen while the class is absent, otherwise the browser
    // coalesces the remove/add and the keyframes never restart.
    expect(seen).toEqual([false]);
    expect(el.classList.contains('life-lost-pulse')).toBe(true);
  });

  it('is a no-op for a missing element', () => {
    expect(() => pulseClass(null, 'life-lost-pulse')).not.toThrow();
    expect(() => pulseClass(undefined, 'life-lost-pulse')).not.toThrow();
  });

  it('does not touch other classes on the element', () => {
    const el = document.createElement('div');
    el.className = 'hud-stat other';
    pulseClass(el, 'life-lost-pulse');
    expect(el.classList.contains('hud-stat')).toBe(true);
    expect(el.classList.contains('other')).toBe(true);
  });
});
