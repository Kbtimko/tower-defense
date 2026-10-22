// FX tunables: projectile shapes/colours/sizes and the trail, muzzle and impact
// particle effects they reference. Texture keys come from systems/fxTextures.js.
// Colours are the art-bible tower accents; sentry matches SentryTurret's COLOR.

export const SOLDIER_MUZZLE = 'soldier';

// Effect fields: texture, tint, lifespan (ms), quantity, speed {min,max},
// scale {start,end}, alpha {start,end}, blendMode ('ADD' | 'NORMAL').
// Trails add `rate` (particles/second). Impacts may be an array of layers.
export const TRAIL_FX = {
  none: { rate: 0 },
  streak: {
    texture: 'fx-glow', tint: 0xffb000, lifespan: 180, quantity: 1, rate: 40,
    speed: { min: 0, max: 8 }, scale: { start: 0.25, end: 0 },
    alpha: { start: 0.7, end: 0 }, blendMode: 'ADD',
  },
  smoke: {
    texture: 'fx-smoke', tint: 0xb0aaa0, lifespan: 420, quantity: 1, rate: 30,
    speed: { min: 4, max: 14 }, scale: { start: 0.2, end: 0.5 },
    alpha: { start: 0.5, end: 0 }, blendMode: 'NORMAL',
  },
  sparkle: {
    texture: 'fx-spark', tint: 0xdd00ff, lifespan: 300, quantity: 1, rate: 50,
    speed: { min: 6, max: 22 }, scale: { start: 0.3, end: 0 },
    alpha: { start: 0.9, end: 0 }, blendMode: 'ADD',
  },
  frost: {
    texture: 'fx-shard', tint: 0x7fe9ff, lifespan: 320, quantity: 1, rate: 35,
    speed: { min: 2, max: 12 }, scale: { start: 0.25, end: 0 },
    alpha: { start: 0.8, end: 0 }, blendMode: 'ADD',
  },
};

export const MUZZLE_FX = {
  small: {
    texture: 'fx-glow', tint: 0xffe9a0, lifespan: 140, quantity: 3,
    speed: { min: 20, max: 50 }, scale: { start: 0.3, end: 0 },
    alpha: { start: 0.9, end: 0 }, blendMode: 'ADD',
  },
  big: {
    texture: 'fx-ember', tint: 0xff7a2f, lifespan: 260, quantity: 8,
    speed: { min: 30, max: 90 }, scale: { start: 0.45, end: 0 },
    alpha: { start: 1, end: 0 }, blendMode: 'ADD',
  },
  soldier: {
    texture: 'fx-spark', tint: 0xffd34d, lifespan: 100, quantity: 2,
    speed: { min: 15, max: 35 }, scale: { start: 0.2, end: 0 },
    alpha: { start: 0.8, end: 0 }, blendMode: 'ADD',
  },
};

export const IMPACT_FX = {
  spark: {
    texture: 'fx-spark', tint: 0xffe9a0, lifespan: 220, quantity: 6,
    speed: { min: 40, max: 110 }, scale: { start: 0.4, end: 0 },
    alpha: { start: 1, end: 0 }, blendMode: 'ADD',
  },
  // Two layers so the cannon blast reads big: dark smoke body plus hot embers.
  explosion: [
    {
      texture: 'fx-smoke', tint: 0x6b6258, lifespan: 600, quantity: 10,
      speed: { min: 20, max: 80 }, scale: { start: 0.4, end: 1.1 },
      alpha: { start: 0.7, end: 0 }, blendMode: 'NORMAL',
    },
    {
      texture: 'fx-ember', tint: 0xff7a2f, lifespan: 450, quantity: 16,
      speed: { min: 60, max: 180 }, scale: { start: 0.5, end: 0 },
      alpha: { start: 1, end: 0 }, blendMode: 'ADD',
    },
  ],
  burst: {
    texture: 'fx-glow', tint: 0xdd00ff, lifespan: 320, quantity: 10,
    speed: { min: 30, max: 100 }, scale: { start: 0.5, end: 0 },
    alpha: { start: 1, end: 0 }, blendMode: 'ADD',
  },
  frost: {
    texture: 'fx-shard', tint: 0x7fe9ff, lifespan: 380, quantity: 8,
    speed: { min: 30, max: 90 }, scale: { start: 0.5, end: 0 },
    alpha: { start: 1, end: 0 }, blendMode: 'ADD',
  },
  pierce: {
    texture: 'fx-spark', tint: 0xff3355, lifespan: 260, quantity: 7,
    speed: { min: 60, max: 150 }, scale: { start: 0.45, end: 0 },
    alpha: { start: 1, end: 0 }, blendMode: 'ADD',
  },
};

export const PROJECTILE_FX = {
  archer: {
    shape: 'arrow', color: 0xffb000, size: { length: 12, width: 2 },
    trail: 'streak', muzzle: 'small', impact: 'spark',
  },
  mage: {
    shape: 'bolt', color: 0xdd00ff, size: 4,
    trail: 'sparkle', muzzle: 'small', impact: 'burst',
    branches: { A: { color: 0xf080ff } }, // Archmage: brighter
  },
  cannon: {
    shape: 'shell', color: 0xff7a2f, size: 4, arc: 36, shadow: true,
    trail: 'smoke', muzzle: 'big', impact: 'explosion',
    branches: { A: { size: 5, arc: 48 } }, // Artillery: heavier, higher lob
  },
  ice: {
    shape: 'shard', color: 0x00eeff, size: { length: 10 },
    trail: 'frost', muzzle: 'small', impact: 'frost',
  },
  sniper: {
    shape: 'tracer', color: 0xff3355, size: { length: 26, width: 2 },
    trail: 'none', muzzle: 'small', impact: 'pierce',
  },
  barracks: {
    shape: 'bolt', color: 0xffd34d, size: 4,
    trail: 'none', muzzle: 'soldier', impact: 'spark',
  },
  sentry: {
    shape: 'bolt', color: 0xff9933, size: 4,
    trail: 'none', muzzle: 'small', impact: 'spark',
  },
};

export const PROJECTILE_SHAPES = ['arrow', 'shell', 'bolt', 'shard', 'tracer'];

// Drawing proportions for projectile bodies (see entities/Projectile.js).
export const PROJECTILE_DRAW = {
  rimColor: 0x2a1a10,        // shell outline
  coreColor: 0xffffff,       // bolt hot centre
  coreRatio: 0.5,            // bolt core radius / body radius
  glowRadiusRatio: 3,        // bolt glow radius / body radius
  arrowHead: 4,              // arrow head length
  arrowHeadSpread: 1.5,      // arrow head half-width / shaft width
  rimWidth: 1,               // shell outline stroke width
  shardWidthRatio: 0.3,      // shard half-width / length
  shadow: { width: 14, height: 6, color: 0x000000, alpha: 0.5, minScale: 0.75 },
};
