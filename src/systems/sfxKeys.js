/**
 * Pure SFX-key derivation with graceful fallback.
 *
 * Returns a branch/enemy-specific SFX key when that key is present in the
 * provided registered-keys list, otherwise the existing base key. This lets the
 * branch/enemy-specific audio assets be added later (registered in SFX_KEYS)
 * with zero code change — until then every call resolves to the base sound.
 */

export function towerFireSfxKey(type, branch, registeredKeys) {
  const specific = branch ? `tower-fire-${type}-${branch}` : null;
  return specific && registeredKeys.includes(specific)
    ? specific
    : `tower-fire-${type}`;
}

export function enemyHitSfxKey(type, registeredKeys) {
  const specific = `enemy-hit-${type}`;
  return registeredKeys.includes(specific) ? specific : 'enemy-hit';
}
