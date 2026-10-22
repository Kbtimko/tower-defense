import { describe, it, expect } from 'vitest';
import * as juice from './juice.js';
import { IMPACT_FX } from './fx.js';

// Derived from juice.js so a new pop/fx block can't name a missing effect.
const burstEffects = Object.entries(juice)
  .filter(([, v]) => v && typeof v === 'object' && 'burstEffect' in v)
  .map(([name, v]) => [name, v.burstEffect]);

describe('juice burstEffect keys', () => {
  it('finds the build, upgrade and sell blocks', () => {
    expect(burstEffects.map(([n]) => n).sort()).toEqual(['BUILD_POP', 'SELL_FX', 'UPGRADE_POP']);
  });
  it.each(burstEffects)('%s names an IMPACT_FX entry', (_n, key) => {
    expect(IMPACT_FX[key]).toBeDefined();
  });
});
