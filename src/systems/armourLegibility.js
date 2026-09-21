// Explains the flat-armour step to the player. Armour is `max(1, dmg - armor)`,
// so a tower at or below an enemy's armour lands exactly 1 a shot forever —
// which reads as a broken tower rather than as an absorbed hit. The decision on
// file is to make that legible, not to change the formula, so nothing here
// feeds `src/data/` or `src/sim/`.
import { applyArmour } from './damage.js';

// Half the shot eaten is where the sorted table of real combinations breaks:
// the next one down is 0.44. Not a tuning dial — a reporting threshold.
export const HEAVY_ABSORPTION = 0.5;

// Absorption is measured on the ARMOUR STEP ALONE, never as final/raw. The
// weakness matrix and the Vulnerable debuff also scale a hit, and folding them
// in would report "armour absorbed 50%" for a cannon hitting an unarmoured
// phantom, and no absorption at all for a sniper that loses 25% to a titan.
export function armourAbsorption({ amount, armor = 0, pierce = false }) {
  if (!(amount > 0)) return { after: 0, absorbed: 0, band: 'none' };
  const after = applyArmour(amount, armor, pierce);
  const absorbed = (amount - after) / amount;
  let band = 'none';
  if (after === 1 && absorbed > 0)          band = 'floored';
  else if (absorbed >= HEAVY_ABSORPTION)    band = 'heavy';
  return { after, absorbed, band };
}
