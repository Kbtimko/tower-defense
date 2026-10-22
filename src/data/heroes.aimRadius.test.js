import { describe, it, expect } from 'vitest';
import { HEROES } from './heroes.js';

// Reticle radius must equal what the run function actually applies.
describe('aimed ability reticle radius', () => {
  for (const [heroId, hero] of Object.entries(HEROES)) {
    for (const [slot, ab] of Object.entries(hero.abilities)) {
      if (!ab.aim) continue;
      it(`${heroId}.${slot} (${ab.id}) radius matches its run result`, () => {
        const result = ab.run({ dead: false, x: 0, y: 0 }, null, { x: 1, y: 1 });
        if (result.radius === undefined) expect(ab.radius).toBeUndefined();
        else expect(ab.radius).toBe(result.radius);
      });
    }
  }
});
