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

// Where the HP bar goes and how wide it is.
//
// `def.radius` describes the Graphics fallback body, not the art. Once sprites
// were scaled up, radius-derived geometry put every enemy's bar ON TOP of its
// own sprite — a titan's 48px bar sat in the middle of a 138px chest — and left
// it narrow enough that a 21%-of-health hit moved only ~4px, on a green bar over
// green drone art. Players stopped reading width and started reading the 50%/25%
// colour flips, which is three or four hits late.
//
// Size and lift the bar off whatever is actually rendered, falling back to the
// radius when there is no sprite.
const BAR_GAP_PX    = 8;    // clearance between the top of the body and the bar
const BODY_WIDTH_PCT = 0.8; // bar width as a share of the rendered body

export function hpBarGeometry(radius, spriteWidth, spriteHeight) {
  const radiusWidth = radius * 2.2;
  const width = Number.isFinite(spriteWidth)
    ? Math.max(radiusWidth, spriteWidth * BODY_WIDTH_PCT)
    : radiusWidth;
  const halfHeight = Number.isFinite(spriteHeight)
    ? Math.max(radius, spriteHeight / 2)
    : radius;
  return { width, x: -width / 2, top: -halfHeight - BAR_GAP_PX };
}
