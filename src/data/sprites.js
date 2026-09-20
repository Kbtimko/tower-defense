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

  // --- Towers ---------------------------------------------------------
  // Static emplacements: idle is a single frame, loaded as a plain texture
  // rather than an animation (frames: 1 is only broken for a one-shot state,
  // which never fires animationcomplete — idle just sits there, which is
  // correct). Attack is the firing beat.
  {
    category: 'tower', type: 'archer',
    scale: 1.03, anchor: { x: 0.5, y: 0.5 }, baseFacing: 'right',
    states: {
      idle:   { path: 'assets/sprites/towers/archer_idle.png',
                frameWidth: 96, frameHeight: 96, frames: 1 },
      attack: { path: 'assets/sprites/towers/archer_attack.png',
                frameWidth: 96, frameHeight: 96, frames: 5, frameRate: 14 },
    },
  },
  // Mage — the narrowest tower (silhouette aspect 0.48). At a 64px cell it
  // would be only 25px wide and need a 1.44x upscale to reach the 36px tower
  // footprint, which looks soft, so it gets a 96px cell like the colossus
  // and titan do.
  {
    category: 'tower', type: 'mage',
    scale: 0.86, anchor: { x: 0.5, y: 0.5 }, baseFacing: 'right',
    states: {
      idle:   { path: 'assets/sprites/towers/mage_idle.png',
                frameWidth: 96, frameHeight: 96, frames: 1 },
      attack: { path: 'assets/sprites/towers/mage_attack.png',
                frameWidth: 96, frameHeight: 96, frames: 5, frameRate: 14 },
    },
  },
  {
    category: 'tower', type: 'cannon',
    scale: 0.86, anchor: { x: 0.5, y: 0.5 }, baseFacing: 'right',
    states: {
      idle:   { path: 'assets/sprites/towers/cannon_idle.png',
                frameWidth: 64, frameHeight: 64, frames: 1 },
      attack: { path: 'assets/sprites/towers/cannon_attack.png',
                frameWidth: 64, frameHeight: 64, frames: 5, frameRate: 14 },
    },
  },
  {
    category: 'tower', type: 'ice',
    scale: 0.88, anchor: { x: 0.5, y: 0.5 }, baseFacing: 'right',
    states: {
      idle:   { path: 'assets/sprites/towers/ice_idle.png',
                frameWidth: 64, frameHeight: 64, frames: 1 },
      attack: { path: 'assets/sprites/towers/ice_attack.png',
                frameWidth: 64, frameHeight: 64, frames: 5, frameRate: 14 },
    },
  },
  {
    category: 'tower', type: 'sniper',
    scale: 0.82, anchor: { x: 0.5, y: 0.5 }, baseFacing: 'right',
    states: {
      idle:   { path: 'assets/sprites/towers/sniper_idle.png',
                frameWidth: 64, frameHeight: 64, frames: 1 },
      attack: { path: 'assets/sprites/towers/sniper_attack.png',
                frameWidth: 64, frameHeight: 64, frames: 5, frameRate: 14 },
    },
  },
  // Barracks never fires — its soldiers do the fighting — so it has no
  // attack state at all.
  {
    category: 'tower', type: 'barracks',
    scale: 0.86, anchor: { x: 0.5, y: 0.5 }, baseFacing: 'right',
    states: {
      idle: { path: 'assets/sprites/towers/barracks_idle.png',
              frameWidth: 64, frameHeight: 64, frames: 1 },
    },
  },

  // --- Heroes ----------------------------------------------------------
  // Heroes walk the path, so unlike towers and units they get a real gait:
  // idle, move and attack all animate.
  {
    category: 'hero', type: 'rael',
    scale: 0.38, anchor: { x: 0.5, y: 0.5 }, baseFacing: 'right',
    states: {
      idle:   { path: 'assets/sprites/heroes/rael_idle.png',
                frameWidth: 64, frameHeight: 64, frames: 6, frameRate: 8 },
      move:   { path: 'assets/sprites/heroes/rael_move.png',
                frameWidth: 64, frameHeight: 64, frames: 8, frameRate: 12 },
      attack: { path: 'assets/sprites/heroes/rael_attack.png',
                frameWidth: 64, frameHeight: 64, frames: 5, frameRate: 14 },
    },
  },
  {
    category: 'hero', type: 'engineer',
    scale: 0.39, anchor: { x: 0.5, y: 0.5 }, baseFacing: 'right',
    states: {
      idle:   { path: 'assets/sprites/heroes/engineer_idle.png',
                frameWidth: 64, frameHeight: 64, frames: 6, frameRate: 8 },
      move:   { path: 'assets/sprites/heroes/engineer_move.png',
                frameWidth: 64, frameHeight: 64, frames: 8, frameRate: 12 },
      attack: { path: 'assets/sprites/heroes/engineer_attack.png',
                frameWidth: 64, frameHeight: 64, frames: 5, frameRate: 14 },
    },
  },
  {
    category: 'hero', type: 'scout',
    scale: 0.38, anchor: { x: 0.5, y: 0.5 }, baseFacing: 'right',
    states: {
      idle:   { path: 'assets/sprites/heroes/scout_idle.png',
                frameWidth: 64, frameHeight: 64, frames: 6, frameRate: 8 },
      move:   { path: 'assets/sprites/heroes/scout_move.png',
                frameWidth: 64, frameHeight: 64, frames: 8, frameRate: 12 },
      attack: { path: 'assets/sprites/heroes/scout_attack.png',
                frameWidth: 64, frameHeight: 64, frames: 5, frameRate: 14 },
    },
  },
  {
    category: 'hero', type: 'pyro',
    scale: 0.39, anchor: { x: 0.5, y: 0.5 }, baseFacing: 'right',
    states: {
      idle:   { path: 'assets/sprites/heroes/pyro_idle.png',
                frameWidth: 64, frameHeight: 64, frames: 6, frameRate: 8 },
      move:   { path: 'assets/sprites/heroes/pyro_move.png',
                frameWidth: 64, frameHeight: 64, frames: 8, frameRate: 12 },
      attack: { path: 'assets/sprites/heroes/pyro_attack.png',
                frameWidth: 64, frameHeight: 64, frames: 5, frameRate: 14 },
    },
  },

  // --- Units -------------------------------------------------------------
  // The soldier holds a blocking post and the sentry is bolted down, so
  // neither gets a move state — just idle and attack, like the towers.
  {
    category: 'soldier', type: 'default',
    scale: 0.36, anchor: { x: 0.5, y: 0.5 }, baseFacing: 'right',
    states: {
      idle:   { path: 'assets/sprites/soldiers/default_idle.png',
                frameWidth: 48, frameHeight: 48, frames: 6, frameRate: 8 },
      attack: { path: 'assets/sprites/soldiers/default_attack.png',
                frameWidth: 48, frameHeight: 48, frames: 5, frameRate: 16 },
    },
  },
  {
    category: 'sentry', type: 'default',
    scale: 0.58, anchor: { x: 0.5, y: 0.5 }, baseFacing: 'right',
    states: {
      idle:   { path: 'assets/sprites/sentry/default_idle.png',
                frameWidth: 48, frameHeight: 48, frames: 6, frameRate: 8 },
      attack: { path: 'assets/sprites/sentry/default_attack.png',
                frameWidth: 48, frameHeight: 48, frames: 5, frameRate: 16 },
    },
  },
];

// Look up the manifest entry for an entity, or null if none is registered.
export function getSpriteConfig(category, type) {
  return SPRITE_MANIFEST.find(e => e.category === category && e.type === type) ?? null;
}
