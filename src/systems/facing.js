// Pure facing resolution for entities that derive their direction from a
// PIXEL delta along the path (enemies). Hero passes a ±1 unit straight to
// EntitySprite.setFacing instead, so this deadzone must stay at the enemy
// call site rather than inside setFacing.
//
// Why a deadzone at all: the dense path is a sampled Catmull-Rom curve, and at
// a tight bend it genuinely backtracks 13-26px in x before carrying on. That is
// a real leftward delta, not sampling noise, so looking further ahead does NOT
// remove it -- measured against the shipped maps a longer look-ahead left the
// flip count unchanged. Ignoring deltas smaller than a sprite's width does:
// a drone crossing map 6 mirrored 11 times before, and once after.
export const FACING_DEADZONE_PX = 8;

// Returns the delta to face, or 0 meaning "keep the current facing" (which is
// already setFacing's no-op signal). A genuine turn is hundreds of px, orders
// of magnitude past the deadzone, so real direction changes still register.
export function facingDirX(dirX, deadzonePx = FACING_DEADZONE_PX) {
  return Math.abs(dirX) >= deadzonePx ? dirX : 0;
}
