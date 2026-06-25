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

// Of `states`, the subset that has a registered texture for this entity.
export function registeredStates(category, type, states, registeredKeys) {
  return states.filter(st => entitySpriteKey(category, type, st, registeredKeys) !== null);
}
