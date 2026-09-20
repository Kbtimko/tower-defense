// Pure geometry for an entity's HP bar fill.
//
// The bar is only radius*2.2 wide — 24px over a brute, 35px over a colossus —
// so the fill edge moves less than one pixel for any hit worth under ~3% of max
// HP, and the frame renders identically to the last one. Flat armour makes that
// the ordinary case rather than an edge case: `max(1, amount - armor)` floors a
// tier-1 archer to 1 damage against a colossus, and enemy HP scales +13% a wave
// while tower damage does not, so the silent band widens as a run goes on. The
// player reads "no pixels changed" as "that hit did not land".
//
// Reserving one pixel of depletion for any damage at all keeps the first hit
// visible without touching the damage numbers themselves.
const MIN_VISIBLE_LOSS_PX = 1;

export function hpBarFillWidth(hp, maxHp, barWidth) {
  if (!(maxHp > 0) || !(barWidth > 0)) return 0;
  if (hp <= 0) return 0;
  if (hp >= maxHp) return barWidth;
  const exact = (hp / maxHp) * barWidth;
  return Math.min(exact, Math.max(0, barWidth - MIN_VISIBLE_LOSS_PX));
}
