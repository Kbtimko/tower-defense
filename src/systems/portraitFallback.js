// Resolves a story speaker to a portrait. Until real art is registered
// (Phase 2), every speaker resolves to a generated fallback (colored block
// + name initial). Mirrors the deferred-asset pattern from overworld art / SFX.

// Populated by BootScene with the portrait keys whose PNG actually loaded.
// Empty until real art lands, so every speaker falls back until then.
export const REGISTERED_PORTRAITS = new Set();

// Single source for where portrait art lives, so the BootScene probe and the
// story dialog's <img> can't drift apart. Site-root-relative: the dialog
// prefixes '/', Phaser resolves it against the same base.
export function portraitPath(key) {
  return `assets/portraits/${key}.png`;
}

// Replaces the registered set (rather than adding to it) so a BootScene re-run
// can't leave keys registered for art that is no longer present.
export function registerPortraits(keys) {
  REGISTERED_PORTRAITS.clear();
  for (const key of keys) REGISTERED_PORTRAITS.add(key);
}

export function resolvePortrait(speaker, registeredKeys = REGISTERED_PORTRAITS) {
  if (!speaker) return { kind: 'fallback', initial: '?', color: 0x444444 };
  if (registeredKeys.has(speaker.portraitKey)) {
    return { kind: 'image', key: speaker.portraitKey };
  }
  return {
    kind: 'fallback',
    initial: (speaker.name?.[0] ?? '?').toUpperCase(),
    color: speaker.color ?? 0x444444,
  };
}
