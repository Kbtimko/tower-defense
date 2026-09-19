// Declarative entity-art manifest. Tunables live here (no Phaser import).
//
// Each entry maps an entity category+type to per-state art. A state is either:
//   single image:  { path }
//   spritesheet:   { path, frameWidth, frameHeight, frames, frameRate }
// Looping states (idle/move) repeat forever; one-shot states (attack/death)
// play once. Texture keys are DERIVED, not stored — see spriteKeys.js
// (sprite-<category>-<type>-<state>).
//
// This ships EMPTY: no art is committed in sub-project (a), so every lookup
// falls back to the entity's Graphics drawing. Adding art = drop the PNG under
// assets/sprites/ + add one entry here (see assets/sprites/PROMPTS.md).
//
// Example entry shape (kept as a comment until real art lands):
//   {
//     category: 'enemy', type: 'drone',
//     scale: 1, anchor: { x: 0.5, y: 0.5 }, baseFacing: 'right',
//     states: {
//       move:  { path: 'assets/sprites/enemies/drone_move.png',
//                frameWidth: 48, frameHeight: 48, frames: 6, frameRate: 10 },
//       death: { path: 'assets/sprites/enemies/drone_death.png',
//                frameWidth: 48, frameHeight: 48, frames: 5, frameRate: 12 },
//     },
//   },
export const SPRITE_MANIFEST = [
  // Veth Drone — ground, def.radius 9. The 64px cell renders at ~27px with
  // scale 0.42, matching the Graphics circle it replaces plus a little overhang
  // for legs. Move frames are one reference cutout under a bob/rock transform,
  // so the creature is pixel-identical across the loop (see PROMPTS.md).
  {
    category: 'enemy', type: 'drone',
    scale: 0.42, anchor: { x: 0.5, y: 0.5 }, baseFacing: 'right',
    states: {
      move:  { path: 'assets/sprites/enemies/drone_move.png',
               frameWidth: 64, frameHeight: 64, frames: 8, frameRate: 12 },
      death: { path: 'assets/sprites/enemies/drone_death.png',
               frameWidth: 64, frameHeight: 64, frames: 6, frameRate: 14 },
    },
  },
  // Veth Skitter — ground, def.radius 7. Fast, so the smallest footprint.
  {
    category: 'enemy', type: 'skitter',
    scale: 0.37, anchor: { x: 0.5, y: 0.5 }, baseFacing: 'right',
    states: {
      move:  { path: 'assets/sprites/enemies/skitter_move.png',
               frameWidth: 64, frameHeight: 64, frames: 8, frameRate: 16 },
      death: { path: 'assets/sprites/enemies/skitter_death.png',
               frameWidth: 64, frameHeight: 64, frames: 6, frameRate: 16 },
    },
  },
  // Veth Brute — ground, def.radius 11. Slow and heavy, so the gait is slower.
  {
    category: 'enemy', type: 'brute',
    scale: 0.80, anchor: { x: 0.5, y: 0.5 }, baseFacing: 'right',
    states: {
      move:  { path: 'assets/sprites/enemies/brute_move.png',
               frameWidth: 64, frameHeight: 64, frames: 8, frameRate: 9 },
      death: { path: 'assets/sprites/enemies/brute_death.png',
               frameWidth: 64, frameHeight: 64, frames: 6, frameRate: 12 },
    },
  },
  // Veth Colossus — ground, def.radius 16. 96px cell: a bigger creature needs
  // more source pixels than a 64px cell leaves it.
  {
    category: 'enemy', type: 'colossus',
    scale: 0.56, anchor: { x: 0.5, y: 0.5 }, baseFacing: 'right',
    states: {
      move:  { path: 'assets/sprites/enemies/colossus_move.png',
               frameWidth: 96, frameHeight: 96, frames: 8, frameRate: 8 },
      death: { path: 'assets/sprites/enemies/colossus_death.png',
               frameWidth: 96, frameHeight: 96, frames: 6, frameRate: 11 },
    },
  },
  // Veth Phantom — FLYING, def.radius 9. Built with hover (no gait rock): a
  // flyer should bob without footfalls.
  {
    category: 'enemy', type: 'phantom',
    scale: 0.58, anchor: { x: 0.5, y: 0.5 }, baseFacing: 'right',
    states: {
      move:  { path: 'assets/sprites/enemies/phantom_move.png',
               frameWidth: 64, frameHeight: 64, frames: 8, frameRate: 14 },
      death: { path: 'assets/sprites/enemies/phantom_death.png',
               frameWidth: 64, frameHeight: 64, frames: 6, frameRate: 14 },
    },
  },
  // Veth Titan — boss, def.radius 22. 128px cell for the same reason as the
  // colossus, and it is a tall standing silhouette rather than a low one.
  {
    category: 'enemy', type: 'titan',
    scale: 1.08, anchor: { x: 0.5, y: 0.5 }, baseFacing: 'right',
    states: {
      move:  { path: 'assets/sprites/enemies/titan_move.png',
               frameWidth: 128, frameHeight: 128, frames: 8, frameRate: 8 },
      death: { path: 'assets/sprites/enemies/titan_death.png',
               frameWidth: 128, frameHeight: 128, frames: 6, frameRate: 10 },
    },
  },
];

// Look up the manifest entry for an entity, or null if none is registered.
export function getSpriteConfig(category, type) {
  return SPRITE_MANIFEST.find(e => e.category === category && e.type === type) ?? null;
}
