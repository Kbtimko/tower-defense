// Wave composition for display. MAP_WAVES is the table that actually spawns
// enemies, so it — not maps.js waveCount — is what the preview reads.
import { MAP_WAVES }     from '../data/waves.js';
import { describeEnemy } from './entityDescriptors.js';

// mapId can be caller-controlled (a URL param, a save file); MAP_WAVES is a
// plain object literal, so a bare MAP_WAVES[mapId] reaches Object.prototype
// for keys like 'toString' or 'constructor'. Object.hasOwn keeps lookups to
// the table's own entries. An explicit opts.waves always wins over the real
// table — including [] and including on an unknown mapId — so callers can
// inject a fixture without it being silently shadowed by a real lookup.
function resolveWaves(mapId, opts) {
  if (Object.hasOwn(opts, 'waves')) return opts.waves;
  return Object.hasOwn(MAP_WAVES, mapId) ? MAP_WAVES[mapId] : undefined;
}

export function waveCount(mapId, opts = {}) {
  const waves = resolveWaves(mapId, opts);
  return Array.isArray(waves) ? waves.length : 0;
}

export function summarizeWave(mapId, waveIndex, opts = {}) {
  const waves = resolveWaves(mapId, opts);
  if (!Array.isArray(waves))                      return null;
  if (!Number.isInteger(waveIndex))                return null;
  if (waveIndex < 0 || waveIndex >= waves.length)  return null;

  const byType = new Map();
  for (const group of waves[waveIndex]) {
    const existing = byType.get(group.type);
    // A wave should never list a type twice, but if one ever does, one row
    // with a summed count beats two rows the player has to add up.
    if (existing) { existing.count += group.count; continue; }
    const described = describeEnemy(group.type);
    if (!described) continue;
    byType.set(group.type, { ...described, count: group.count });
  }

  // A valid index whose wave has no groups falls through to here, not the
  // out-of-range branch above: an empty wave is a wave (totalCount 0, groups
  // []), structurally distinct from an index that names no wave at all.
  const groups = [...byType.values()];
  return {
    waveNumber: waveIndex + 1,
    totalCount: groups.reduce((sum, g) => sum + g.count, 0),
    groups,
  };
}
