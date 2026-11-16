import { describe, it, expect } from 'vitest';
import { pageUrl, displaySize } from './review.mjs';
import { getSpriteConfig } from '../../src/data/sprites.js';

describe('pageUrl', () => {
  it('percent-encodes spaces and URL-significant characters per segment', () => {
    expect(pageUrl('/c/review/b', "/c/candidates/b/a #1?/it's 100%/0.png"))
      .toBe('../../candidates/b/a%20%231%3F/it\'s%20100%25/0.png');
  });
});

describe('displaySize', () => {
  it('sizes a sprite from the manifest cell x scale, never a job cell', () => {
    const cfg = getSpriteConfig('tower', 'archer');
    const size = Math.round(cfg.states.idle.frameWidth * cfg.scale);
    const archer = { kind: 'sprite', category: 'tower', type: 'archer' };
    expect(displaySize(archer)).toEqual({ width: size, height: size });
    expect(displaySize({ ...archer, cell: 200 })).toEqual({ width: size, height: size });
  });
});
