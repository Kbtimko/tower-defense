import { describe, it, expect } from 'vitest';
import { BACKDROP_ART } from '../data/worldMap.js';
import { worldBackdropSource } from './worldBackdrop.js';

describe('worldBackdropSource', () => {
  it("is 'procedural' when the art did not register", () => {
    expect(worldBackdropSource(false)).toBe('procedural');
  });

  it('is the URL when the art registered', () => {
    expect(worldBackdropSource('assets/worldmap/vista.webp')).toBe('assets/worldmap/vista.webp');
  });

  it("is 'procedural' for the empty slot (BACKDROP_ART is null until art is dropped in)", () => {
    expect(BACKDROP_ART).toBeNull();
    expect(worldBackdropSource(BACKDROP_ART)).toBe('procedural');
  });

  it("is 'procedural' when BootScene never ran (registry unset)", () => {
    expect(worldBackdropSource(undefined)).toBe('procedural');
  });
});
