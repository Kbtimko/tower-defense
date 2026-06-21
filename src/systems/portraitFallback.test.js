import { describe, it, expect } from 'vitest';
import { resolvePortrait } from './portraitFallback.js';

const command = { name: 'Sol Command', color: 0x4aa3ff, portraitKey: 'portrait-command' };

describe('resolvePortrait', () => {
  it('falls back when the portrait key is not registered', () => {
    const r = resolvePortrait(command, new Set());
    expect(r).toEqual({ kind: 'fallback', initial: 'S', color: 0x4aa3ff });
  });

  it('resolves to an image when the key is registered', () => {
    const r = resolvePortrait(command, new Set(['portrait-command']));
    expect(r).toEqual({ kind: 'image', key: 'portrait-command' });
  });

  it('uses the first character of the name, uppercased', () => {
    const r = resolvePortrait({ name: 'the Vorn', color: 1, portraitKey: 'x' }, new Set());
    expect(r.initial).toBe('T');
  });

  it('falls back with "?" when speaker is missing', () => {
    const r = resolvePortrait(undefined, new Set());
    expect(r).toEqual({ kind: 'fallback', initial: '?', color: 0x444444 });
  });
});
