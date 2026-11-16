import { describe, it, expect } from 'vitest';
import { spriteAssets, requiredAssets } from './assetManifest.js';

describe('spriteAssets', () => {
  const manifest = [{
    category: 'tower', type: 'archer',
    states: { idle: { path: 'assets/sprites/a.png', frameWidth: 64, frameHeight: 64, frames: 4 } },
    variants: {
      t4a: { states: { idle: { path: 'assets/sprites/a-t4a.png', frameWidth: 64, frameHeight: 64, frames: 4 } } },
    },
  }];

  it('keeps base states optional and requires every declared variant file', () => {
    const out = spriteAssets(manifest);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ id: 'tower/archer idle', required: false });
    expect(out[1]).toMatchObject({
      kind: 'sprite',
      id: 'tower/archer idle t4a',
      path: 'public/assets/sprites/a-t4a.png',
      url: 'assets/sprites/a-t4a.png',
      required: true,
      key: 'sprite-tower-archer-idle-t4a',
      frames: 4,
      expected: { width: 256, height: 64 },
    });
  });

  it('adds nothing for entries without variants', () => {
    expect(spriteAssets([{ ...manifest[0], variants: undefined }])).toHaveLength(1);
  });
});

describe('requiredAssets', () => {
  it('includes the sprite records', () => {
    expect(requiredAssets().filter(a => a.kind === 'sprite').length).toBeGreaterThan(0);
  });
});
