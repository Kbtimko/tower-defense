import { describe, it, expect } from 'vitest';
import { BACKDROP_ART } from '../data/worldMap.js';
import { worldBackdropSource } from './worldBackdrop.js';

describe('worldBackdropSource', () => {
  it("is 'procedural' when the art did not register", () => {
    expect(worldBackdropSource(false)).toBe('procedural');
  });

  it('is the URL when the art registered', () => {
    expect(worldBackdropSource(BACKDROP_ART)).toBe(BACKDROP_ART);
  });

  it("is 'procedural' when BootScene never ran (registry unset)", () => {
    expect(worldBackdropSource(undefined)).toBe('procedural');
  });
});
