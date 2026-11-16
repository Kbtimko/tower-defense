import { join } from 'node:path';

// FLUX.1 [schnell] is distilled: 4 steps, CFG 0. Matches the PROMPTS.md guidance.
export const FLUX = { steps: 4, cfg_scale: 0, sampler_name: 'Euler a', width: 1024, height: 1024 };

export function txt2imgBody({ prompt, seed }) {
  return {
    prompt,
    negative_prompt: '',
    seed,
    steps: FLUX.steps,
    cfg_scale: FLUX.cfg_scale,
    sampler_name: FLUX.sampler_name,
    width: FLUX.width,
    height: FLUX.height,
    batch_size: 1,
  };
}

export function img2imgBody({ prompt, seed, initB64, strength }) {
  return { ...txt2imgBody({ prompt, seed }), init_images: [initB64], denoising_strength: strength };
}

// Mirrors OUT_DIRS in scripts/build-sprite-sheets.py: the shipped sheets are the
// fallback init image when the cached reference is gone.
const SPRITE_DIRS = {
  enemy: 'enemies', tower: 'towers', hero: 'heroes', soldier: 'soldiers', sentry: 'sentry',
};

export function initImageSource(cache, asset) {
  const entity = asset.entity.split('.')[0];
  const cut = entity.indexOf('_');
  const category = entity.slice(0, cut);
  const type = entity.slice(cut + 1);
  // Enemies have no idle sheet; their first frame of art is the move sheet.
  const state = category === 'enemy' ? 'move' : 'idle';
  return {
    ref: join(cache, 'sprites', `${entity}.png`),
    fallback: `assets-src/sprites/${SPRITE_DIRS[category]}/${type}_${state}.png`,
  };
}
