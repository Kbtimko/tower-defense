// @vitest-environment node
// (sharp needs real node file URLs; jsdom's URL class breaks them.)
import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { getSpriteConfig } from './sprites.js';

// 4.3 enemy refresh: new art must not change how big the enemies read on the map.
// Targets are the pre-refresh footprints, measured from commit 047b599
// (src/data/sprites.js ground.width, and the old move sheet's frame-0 alpha bbox
// x scale). The titan went from an upright to a horizontal silhouette, so its
// ground width is no longer comparable; its longest drawn side is held instead
// (spec: 104, inside the old 104-112 range).
describe('enemy footprints hold their pre-4.3 size', () => {
  const within = (actual, target, tol) => Math.abs(actual - target) / target <= tol;

  // Frame 0's alpha bbox (alpha > 40) x the entry's scale = drawn display px.
  async function drawnExtent(entry) {
    const st = entry.states.move;
    const file = fileURLToPath(new URL(`../../public/${st.path}`, import.meta.url));
    const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const stride = info.width * 4;
    let x0 = Infinity, x1 = -1, y0 = Infinity, y1 = -1;
    for (let y = 0; y < st.frameHeight; y++) for (let x = 0; x < st.frameWidth; x++) {
      if (data[y * stride + x * 4 + 3] > 40) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    }
    return { w: (x1 - x0 + 1) * entry.scale, h: (y1 - y0 + 1) * entry.scale };
  }

  it.each([['drone', 32.2, 32.4], ['phantom', 30.2, 30.2]])(
    '%s ground width is within 5%% of %s and its drawn longest side within 5%% of %s', async (type, ground, drawn) => {
      const e = getSpriteConfig('enemy', type);
      expect(within(e.ground.width, ground, 0.05), `${type} ground.width ${e.ground.width}`).toBe(true);
      const d = await drawnExtent(e);
      expect(within(Math.max(d.w, d.h), drawn, 0.05), `${type} drawn ${d.w.toFixed(1)}x${d.h.toFixed(1)}`).toBe(true);
    });

  it('titan longest drawn side is within 5% of 104', async () => {
    const e = getSpriteConfig('enemy', 'titan');
    const d = await drawnExtent(e);
    expect(within(Math.max(d.w, d.h), 104, 0.05), `titan drawn ${d.w.toFixed(1)}x${d.h.toFixed(1)}`).toBe(true);
  });
});
