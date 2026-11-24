// Pure resolver: swaps an entity's sheets for their @2x siblings at render
// scale 2. Display size is frameWidth x scale, so doubling the frame and halving
// the scale keeps on-screen size identical. anchor/ground/frames/frameRate are
// fractions or per-frame counts and stay untouched.

export function at2x(path) {
  return path.replace(/(\.[^./]+)$/, '@2x$1');
}

function statePaths(entry) {
  return [
    ...Object.values(entry.states ?? {}),
    ...Object.values(entry.variants ?? {}).flatMap(v => Object.values(v.states ?? {})),
  ].map(def => def.path);
}

function resolveStates(states) {
  if (!states) return states;
  return Object.fromEntries(Object.entries(states).map(([name, def]) => [name, {
    ...def,
    path: at2x(def.path),
    frameWidth: def.frameWidth * 2,
    frameHeight: def.frameHeight * 2,
  }]));
}

// All-or-nothing per entity: EntitySprite merges variant states over base
// states and shares one scale, so a mix of 1x and 2x sheets would size wrongly.
export function resolveEntry(entry, k, has2x) {
  if (k !== 2) return entry;
  if (!statePaths(entry).every(has2x)) return entry;
  const out = { ...entry, scale: (entry.scale ?? 1) / 2, states: resolveStates(entry.states) };
  if (entry.variants) {
    out.variants = Object.fromEntries(Object.entries(entry.variants).map(([name, v]) => [name, {
      ...v,
      ...(v.scale != null ? { scale: v.scale / 2 } : {}),
      states: resolveStates(v.states),
    }]));
  }
  return out;
}

export function resolveManifest(manifest, k, has2x) {
  return manifest.map(e => resolveEntry(e, k, has2x));
}
