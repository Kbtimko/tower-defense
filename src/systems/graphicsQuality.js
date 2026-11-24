import { GRAPHICS_LEVELS, LOW_PARTICLE_SCALE } from '../data/graphicsQuality.js';

/**
 * Resolves the Graphics setting to the flags consumers read. Canvas has no FX
 * pipeline so it never grades, whatever the setting. Auto grades only on a
 * non-touch device, because phones are where the FX cost hurts; an unknown
 * value falls back to auto rather than silently disabling effects.
 */
export function resolveGraphics(setting, { webgl, touch }) {
  const level = GRAPHICS_LEVELS.includes(setting) ? setting : 'auto';
  if (level === 'low') return { mapGrade: false, ambientFx: false, particleScale: LOW_PARTICLE_SCALE };
  const grade = level === 'high' ? true : !touch;
  return { mapGrade: !!webgl && grade, ambientFx: true, particleScale: 1 };
}

/**
 * Old saves stored only a mapGrade boolean (null = auto). Carry an explicit
 * choice over; a valid `graphics` always wins so a migrated save is stable.
 */
export function migrateGraphicsSetting(saved) {
  if (GRAPHICS_LEVELS.includes(saved?.graphics)) return saved.graphics;
  if (saved?.mapGrade === false) return 'low';
  if (saved?.mapGrade === true) return 'high';
  return 'auto';
}

/** Scales a particle count; a non-empty burst never rounds down to nothing. */
export function scaleBurst(n, particleScale) {
  return n <= 0 ? 0 : Math.max(1, Math.ceil(n * particleScale));
}
