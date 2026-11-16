import { describe, it, expect } from 'vitest';
import { FLUX, txt2imgBody, img2imgBody, initImageSource } from './drawThingsRequest.js';

describe('txt2imgBody', () => {
  it('is the request body generate-art.mjs has always sent', () => {
    expect(txt2imgBody({ prompt: 'a keep', seed: 5 })).toEqual({
      prompt: 'a keep', negative_prompt: '', seed: 5, steps: 4, cfg_scale: 0,
      sampler_name: 'Euler a', width: 1024, height: 1024, batch_size: 1,
    });
    expect(FLUX).toEqual({ steps: 4, cfg_scale: 0, sampler_name: 'Euler a', width: 1024, height: 1024 });
  });
});

describe('img2imgBody', () => {
  it('adds exactly init_images and denoising_strength', () => {
    const base = txt2imgBody({ prompt: 'p', seed: 9 });
    const body = img2imgBody({ prompt: 'p', seed: 9, initB64: 'AAAA', strength: 0.45 });
    expect(body).toEqual({ ...base, init_images: ['AAAA'], denoising_strength: 0.45 });
  });
});

describe('initImageSource', () => {
  it('points a tower variant at its base reference and idle sheet', () => {
    const src = initImageSource('/c', { entity: 'tower_archer', variant: 't4a' });
    expect(src).toEqual({
      ref: '/c/sprites/tower_archer.png',
      fallback: 'assets-src/sprites/towers/archer_idle.png',
    });
  });
  it('uses the move sheet for enemies', () => {
    expect(initImageSource('/c', { entity: 'enemy_drone' }).fallback)
      .toBe('assets-src/sprites/enemies/drone_move.png');
  });
  it('tolerates an assetId-style entity with a variant suffix', () => {
    expect(initImageSource('/c', { entity: 'tower_archer.t4a' }).ref).toBe('/c/sprites/tower_archer.png');
  });
});
