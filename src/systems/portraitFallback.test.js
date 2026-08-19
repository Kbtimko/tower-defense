import { describe, it, expect } from 'vitest';
import {
  resolvePortrait, portraitPath, registerPortraits, REGISTERED_PORTRAITS,
} from './portraitFallback.js';

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

describe('portraitPath', () => {
  it('builds the site-root-relative asset path for a portrait key', () => {
    expect(portraitPath('portrait-rael')).toBe('assets/portraits/portrait-rael.png');
  });
});

describe('registerPortraits', () => {
  beforeEach(() => registerPortraits([]));

  it('populates the module-level set so resolvePortrait defaults to real art', () => {
    // Before registration the same speaker must still fall back.
    expect(resolvePortrait(command).kind).toBe('fallback');
    registerPortraits(['portrait-command']);
    expect(resolvePortrait(command)).toEqual({ kind: 'image', key: 'portrait-command' });
  });

  it('registers only the keys given — unregistered speakers still fall back', () => {
    registerPortraits(['portrait-command']);
    const vorn = { name: 'The Vorn', color: 0x9b4dff, portraitKey: 'portrait-vorn' };
    expect(resolvePortrait(vorn).kind).toBe('fallback');
  });

  it('replaces prior keys rather than accumulating (BootScene may re-run)', () => {
    registerPortraits(['portrait-command']);
    registerPortraits(['portrait-vorn']);
    expect(REGISTERED_PORTRAITS.has('portrait-command')).toBe(false);
    expect(REGISTERED_PORTRAITS.has('portrait-vorn')).toBe(true);
  });

  it('an empty list clears everything back to fallback', () => {
    registerPortraits(['portrait-command']);
    registerPortraits([]);
    expect(resolvePortrait(command).kind).toBe('fallback');
  });

  it('de-duplicates repeated keys', () => {
    registerPortraits(['portrait-rael', 'portrait-rael']);
    expect(REGISTERED_PORTRAITS.size).toBe(1);
  });
});
