import { describe, it, expect } from 'vitest';
import { SPRITE_MANIFEST, getSpriteConfig } from './sprites.js';

describe('SPRITE_MANIFEST', () => {
  it('is an array', () => {
    expect(Array.isArray(SPRITE_MANIFEST)).toBe(true);
  });
  it('every entry is well-formed', () => {
    for (const entry of SPRITE_MANIFEST) {
      expect(typeof entry.category).toBe('string');
      expect(typeof entry.type).toBe('string');
      expect(typeof entry.states).toBe('object');
      for (const def of Object.values(entry.states)) {
        expect(typeof def.path).toBe('string');
        if (def.frames && def.frames > 1) {
          expect(typeof def.frameWidth).toBe('number');
          expect(typeof def.frameHeight).toBe('number');
        }
      }
    }
  });
});

describe('getSpriteConfig', () => {
  it('returns null for an unknown entity', () => {
    expect(getSpriteConfig('enemy', 'does-not-exist')).toBeNull();
  });
});
