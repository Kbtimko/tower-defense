import { describe, it, expect } from 'vitest';
import { ROAD_DEPTH, GROUND_FX_DEPTH, ENDPOINT_LOOK } from './roads.js';
import { AMBIENT_LAYERS } from './ambient.js';

// 10 is the static layer depth passed to createStaticBake in GameScene.create.
const STATIC_LAYER_DEPTH = 10;

describe('ground FX depth ordering', () => {
  it('sits above the road and near ambient, below endpoints and the static layer', () => {
    const nearDepth = AMBIENT_LAYERS.find((l) => l.name === 'near').depth;
    expect(ROAD_DEPTH).toBeLessThan(nearDepth);
    expect(nearDepth).toBeLessThan(GROUND_FX_DEPTH);
    expect(GROUND_FX_DEPTH).toBeLessThan(ENDPOINT_LOOK.depth);
    expect(ENDPOINT_LOOK.depth).toBeLessThan(STATIC_LAYER_DEPTH);
  });
});
