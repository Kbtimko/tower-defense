// Pure, dependency-free sprite-key resolution. Mirrors src/systems/sfxKeys.js:
// the caller passes the list of registered texture keys so this module has no
// Phaser coupling and is fully unit-testable.

export function spriteTextureKey(category, type, state) {
  return `sprite-${category}-${type}-${state}`;
}

// Returns the registered texture key for the requested state, or null (the
// signal to fall back to the entity's Graphics drawing).
export function entitySpriteKey(category, type, state, registeredKeys) {
  const key = spriteTextureKey(category, type, state);
  return registeredKeys.includes(key) ? key : null;
}

// Tier look variant for a tower/soldier. Level 4 needs a branch to pick 4A/4B;
// an unbranched level 4 reads as t3 rather than guessing a branch.
export function tierVariant(level, branch) {
  if (level <= 1) return 't1';
  if (level === 2) return 't2';
  if (level === 3) return 't3';
  const b = typeof branch === 'string' ? branch.toUpperCase() : null;
  if (b === 'A') return 't4a';
  if (b === 'B') return 't4b';
  return 't3';
}

export function variantTextureKey(category, type, state, variant) {
  return `${spriteTextureKey(category, type, state)}-${variant}`;
}

// Exact variant key if registered, else the base key, else null. Deliberately
// never hops t4a -> t3: a missing 4A sheet shows the base art, not another tier's.
export function resolveSpriteKey(category, type, state, variant, registeredKeys) {
  const vKey = variantTextureKey(category, type, state, variant);
  if (registeredKeys.includes(vKey)) return vKey;
  return entitySpriteKey(category, type, state, registeredKeys);
}

// Of `states`, the subset that has a registered texture for this entity. With a
// variant, a state counts when the variant-or-base chain resolves.
export function registeredStates(category, type, states, registeredKeys, variant = undefined) {
  if (variant === undefined) {
    return states.filter(st => entitySpriteKey(category, type, st, registeredKeys) !== null);
  }
  return states.filter(st => resolveSpriteKey(category, type, st, variant, registeredKeys) !== null);
}
