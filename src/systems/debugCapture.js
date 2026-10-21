// Query-string hooks for the screenshot harness (scripts/capture.mjs):
// ?debug=1&map=N&wave=W&hero=ID&build=archer@0:3,mage@4:4b
// Pure so the parsing rules are testable without a canvas; GameScene only
// wires the result in.
//
// Callers gate on `import.meta.env.DEV || import.meta.env.MODE === 'capture'`
// written inline: Vite substitutes those literals, so the branch folds to
// false in a production build and Rollup drops this module from the bundle.
// Wrapping the check in a helper defeats that — the call can't be folded.

const BUILD_ENTRY = /^([a-z]+)@(\d+)(?::([1-4])([ab])?)?$/i;

function clampInt(raw, min, max, fallback) {
  const n = Number.parseInt(raw ?? '', 10);
  if (Number.isNaN(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

/**
 * Returns null unless `debug=1`; otherwise a plan with every value clamped to
 * the real data. Bad build entries are skipped and described in `errors`
 * rather than thrown, so one typo still yields a usable capture.
 *
 * @param {string} search  window.location.search
 * @param {{maps: object[], waves: object, towerTypes: string[], heroes: string[]}} ctx
 */
export function parseDebugParams(search, { maps, waves, towerTypes, heroes }) {
  const params = new URLSearchParams(search);
  if (params.get('debug') !== '1') return null;

  const errors = [];
  const mapId  = clampInt(params.get('map'), 0, maps.length - 1, 0);

  const waveCount = (waves[mapId] ?? []).length;
  const wave = params.has('wave') ? clampInt(params.get('wave'), 1, waveCount, 1) : null;

  let heroId = heroes[0];
  const rawHero = params.get('hero');
  if (rawHero) {
    if (heroes.includes(rawHero)) heroId = rawHero;
    else errors.push(`unknown hero "${rawHero}"`);
  }

  const slotCount = maps[mapId].towerSlots.length;
  const usedSlots = new Set();
  const build = [];
  for (const raw of (params.get('build') ?? '').split(',')) {
    if (!raw) continue;
    const m = BUILD_ENTRY.exec(raw.trim());
    if (!m) { errors.push(`malformed build entry "${raw}"`); continue; }
    const type = m[1].toLowerCase();
    const slot = Number(m[2]);
    const tier = m[3] ? Number(m[3]) : 1;
    if (!towerTypes.includes(type)) { errors.push(`unknown tower "${type}"`); continue; }
    if (slot >= slotCount)          { errors.push(`slot ${slot} out of range (map has ${slotCount})`); continue; }
    if (usedSlots.has(slot))        { errors.push(`slot ${slot} used twice`); continue; }
    usedSlots.add(slot);
    const branch = tier === 4 ? (m[4] ?? 'a').toUpperCase() : null;
    build.push({ type, slot, tier, branch });
  }
  // The regex only admits tiers 1-4, so "ice@2:7" lands in "malformed" above.

  return { mapId, wave, heroId, build, errors };
}

/**
 * Places and upgrades the scripted towers through the normal managers so they
 * are indistinguishable from player-built ones, then restores the gold — a
 * capture should show the map's real HUD economy, not the debug spend.
 *
 * @returns {object[]} the towers actually placed
 */
export function applyDebugBuild(build, { economy, placementManager, scene, onPlaced }) {
  if (build.length === 0) return [];
  const startGold = economy.gold;
  // Enough for any single purchase; reset per step so no build can run dry.
  const FREE_GOLD = 1e6;
  const placed = [];
  for (const { type, slot, tier, branch } of build) {
    economy.gold = FREE_GOLD;
    const tower = placementManager.placeTower(slot, type, scene);
    if (!tower) continue;
    for (let t = 2; t <= tier; t++) {
      economy.gold = FREE_GOLD;
      placementManager.upgradeTower(tower, t, t === 4 ? branch : null);
    }
    placed.push(tower);
    onPlaced?.(tower);
  }
  economy.gold = startGold;
  return placed;
}

// One of each tower at mixed tiers, spread along the slot list so a capture
// shows the whole roster and both ends of the path.
const CAPTURE_ROSTER = ['archer@:3', 'cannon@:3', 'mage@:4b', 'ice@:2', 'sniper@:4a', 'barracks@:2'];

export function defaultCaptureBuild(slotCount) {
  const n = Math.min(slotCount, CAPTURE_ROSTER.length);
  return CAPTURE_ROSTER.slice(0, n)
    .map((entry, i) => entry.replace('@', `@${Math.floor((i * slotCount) / n)}`))
    .join(',');
}
