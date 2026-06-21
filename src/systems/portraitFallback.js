// Resolves a story speaker to a portrait. Until real art is registered
// (Phase 2), every speaker resolves to a generated fallback (colored block
// + name initial). Mirrors the deferred-asset pattern from overworld art / SFX.

// Phase 2 populates this set with the portrait keys actually loaded by BootScene.
export const REGISTERED_PORTRAITS = new Set();

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
