import { HIT_STOP, DEATH_CLASS, STATUS_FX } from '../data/fx.js';

// Shared result: squashScale runs per sprite per frame while squashing, so it
// must not allocate. Callers copy x/y into the sprite immediately.
const SQUASH = { x: 1, y: 1 };

export function squashScale(t, { duration, amount }) {
  if (t <= 0 || t >= duration) {
    SQUASH.x = 1;
    SQUASH.y = 1;
    return SQUASH;
  }
  // Ease-out so the snap-back is fast at first and settles gently.
  const k = (1 - t / duration) ** 2;
  SQUASH.x = 1 + amount * k;
  SQUASH.y = 1 - amount * k;
  return SQUASH;
}

export function deathClass(type) {
  return DEATH_CLASS[type] ?? 'small';
}

// Positional args: runs on every enemy hit, so no per-call options object.
// Small enemies never qualify: ordinary shots would otherwise stop the game
// several times a second.
export function isHeavyHit(damage, maxHp, killed, type) {
  if (!(maxHp > 0)) return false;
  if (deathClass(type) === 'small') return false;
  return killed || damage >= HIT_STOP.heavyFraction * maxHp;
}

export function canHitStop(sinceLast, paused, reducedMotion) {
  if (paused || reducedMotion) return false;
  return sinceLast >= HIT_STOP.cooldown;
}

// stun's accent is `color` (it draws stars, not a tint) but it still tints the sprite.
export function statusTint(statusEffects) {
  for (const key of STATUS_FX.tintPriority) {
    if (statusEffects[key]?.active) return STATUS_FX[key].tint ?? STATUS_FX[key].color;
  }
  return null;
}
