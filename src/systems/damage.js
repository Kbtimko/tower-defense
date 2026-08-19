// The one damage formula. Extracted from Enemy.takeDamage so that anything
// needing to reason about combat — the live game and the headless balance
// simulator — computes identical numbers. A second copy of this arithmetic
// would let the simulator drift away from the game it is meant to model.
import { getWeaknessMultiplier } from '../data/weaknessMatrix.js';

export function computeDamage({
  amount,
  armor = 0,
  pierce = false,
  source,
  enemyType,
  vulnerableMult = 1,
}) {
  const effectiveArmor = pierce ? 0 : armor;
  const afterArmor = Math.max(1, amount - effectiveArmor);
  const mult = getWeaknessMultiplier(source, enemyType);
  return Math.max(1, Math.floor(afterArmor * mult * vulnerableMult));
}
