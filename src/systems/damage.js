// The one damage formula. Extracted from Enemy.takeDamage so that anything
// needing to reason about combat — the live game and the headless balance
// simulator — computes identical numbers. A second copy of this arithmetic
// would let the simulator drift away from the game it is meant to model.
import { getWeaknessMultiplier } from '../data/weaknessMatrix.js';

// The armour step on its own. Exported so the UI can explain flat subtraction
// without keeping a second copy of `max(1, ...)` — a second copy is exactly how
// the headless simulator drifted from the game before.
export function applyArmour(amount, armor = 0, pierce = false) {
  return Math.max(1, amount - (pierce ? 0 : armor));
}

export function computeDamage({
  amount,
  armor = 0,
  pierce = false,
  source,
  enemyType,
  vulnerableMult = 1,
}) {
  const afterArmor = applyArmour(amount, armor, pierce);
  const mult = getWeaknessMultiplier(source, enemyType);
  return Math.max(1, Math.floor(afterArmor * mult * vulnerableMult));
}
