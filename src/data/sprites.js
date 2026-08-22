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
      move: { path: 'assets/sprites/enemies/drone_move.png',
              frameWidth: 64, frameHeight: 64, frames: 8, frameRate: 12 },
    },
  },
];

// Look up the manifest entry for an entity, or null if none is registered.
export function getSpriteConfig(category, type) {
  return SPRITE_MANIFEST.find(e => e.category === category && e.type === type) ?? null;
}
