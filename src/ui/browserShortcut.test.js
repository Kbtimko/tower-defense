import { describe, it, expect } from 'vitest';
import { isBrowserShortcut } from './browserShortcut.js';

const key = (init) => new KeyboardEvent('keydown', { key: 'r', ...init });

describe('isBrowserShortcut', () => {
  it.each(['ctrlKey', 'metaKey', 'altKey'])('%s combos belong to the browser', (mod) => {
    expect(isBrowserShortcut(key({ [mod]: true }))).toBe(true);
  });

  it('F5, the bare reload key, belongs to the browser', () => {
    expect(isBrowserShortcut(new KeyboardEvent('keydown', { key: 'F5' }))).toBe(true);
  });

  it.each(['ctrlKey', 'metaKey', 'altKey'])('a %s-modified pointer event is not a browser shortcut', (mod) => {
    expect(isBrowserShortcut(new MouseEvent('pointerdown', { [mod]: true }))).toBe(false);
  });

  it('a plain key is not a browser shortcut', () => {
    expect(isBrowserShortcut(key({}))).toBe(false);
  });

  it('Shift alone is not a browser shortcut (it types capitals)', () => {
    expect(isBrowserShortcut(key({ shiftKey: true }))).toBe(false);
  });
});
