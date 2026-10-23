import { RING_ANGLES, buildAngles } from '../data/radial.js';
import { TOWER_DEFS } from '../data/towers.js';
import { sellRefund } from './TowerPlacementManager.js';

/**
 * The single source the RadialMenu presenter renders from.
 *
 * @typedef {Object} RadialItem
 * @property {string} id         'build:<type>' | 'upgrade' | 'branchA' | 'branchB' | 'sell' | 'reposition'
 * @property {number} slot       Angle in degrees (0 = east, clockwise on screen), fed to layoutRadial.
 * @property {string} label      Caption under the icon, e.g. '60g', '50g', 'Map 3', 'MAX', '+36g', 'Move'.
 * @property {number|null} cost  Gold needed to activate; null for MAX, Sell and Reposition.
 * @property {'currency'|'danger'|'primary'|'neutral'} variant  .ui-btn modifier.
 * @property {'ready'|'disabled'|'locked'|'maxed'} state
 *           ready: activatable. disabled: costs more than gold. locked: the map caps the tier. maxed: level 4.
 * @property {string} ariaLabel  Full spoken text including cost and why it is not usable.
 * @property {string} [icon]     Glyph above the caption: tower icon (build), '⬆' (upgrade), 'A'/'B' (branch), '🔒' (locked), '💰' (sell), '↻' (reposition).
 * @property {string} [name]     What the item does in words: the tier name (hub on preview) or 'Sell'/'Move' (the armed-confirm hub prompt).
 * @property {string} [towerType] Build items only.
 * @property {number} [tier]     Upgrade/branch items: the tier bought (2, 3 or 4).
 * @property {'A'|'B'} [branch]  Branch items only.
 * @property {number} [range]    Base (unmultiplied) range the item would give; see previewRadius.
 */

// Gold gate: `gold === cost` is affordable.
const affordState = (gold, cost) => (gold >= cost ? 'ready' : 'disabled');

// "Unlocked on Map N" is derived from the map table so retuning a cap cannot
// leave a stale hard-coded 3 or 5 in the UI.
export function unlockMapNumber(tier, maps) {
  const i = maps.findIndex(m => m.maxTierAllowed >= tier);
  return i === -1 ? null : i + 1;
}

// costMult mirrors TowerPlacementManager.placeTower so the shown price is the charged price.
export function buildItems({ towerDefs, gold, costMult = 1 }) {
  const types = Object.keys(towerDefs);
  const angles = buildAngles(types.length);
  return types.map((type, i) => {
    const def = towerDefs[type];
    const cost = Math.round(def.cost * costMult);
    return {
      id: `build:${type}`, slot: angles[i], label: `${cost}g`, cost, variant: 'currency',
      state: affordState(gold, cost), ariaLabel: `Build ${def.name}, ${cost} gold`,
      icon: def.icon, towerType: type, range: def.range,
    };
  });
}

// The face shows only a glyph + cost: a tier name at a size that fits the
// round face was unreadable on phones, so the name moves to the hub on preview.
function purchaseItem({ id, def, tierDef, tier, branch, icon, gold, maps, allowed }) {
  const base = { id, slot: RING_ANGLES[id], cost: tierDef.cost, variant: 'currency', tier, range: tierDef.range, name: tierDef.label };
  if (branch) base.branch = branch;
  const what = `${tier === 4 ? 'Evolve' : 'Upgrade'} ${def.name} to ${tierDef.label}`;
  if (!allowed) {
    const n = unlockMapNumber(tier, maps);
    return { ...base, icon: '🔒', label: `Map ${n}`, state: 'locked', ariaLabel: `${what}, locked until Map ${n}` };
  }
  const state = affordState(gold, tierDef.cost);
  return {
    ...base, icon, label: `${tierDef.cost}g`, state,
    ariaLabel: `${what}, ${tierDef.cost} gold${state === 'disabled' ? ', not enough gold' : ''}`,
  };
}

// DOM/keyboard order is clockwise from the west so Tab matches the ring.
export function ringItems({ tower, towerDefs, map, maps, gold }) {
  const def = towerDefs[tower.type];
  const items = [];

  if (tower.type === 'barracks') {
    items.push({ id: 'reposition', slot: RING_ANGLES.reposition, icon: '↻', label: 'Move', name: 'Move', cost: null, variant: 'primary', state: 'ready', ariaLabel: `Move ${def.name}` });
  }

  if (tower.level === 3 && !tower.branch) {
    for (const b of ['A', 'B']) {
      const tierDef = def[`tier4${b}`];
      items.push(purchaseItem({ id: `branch${b}`, def, tierDef, tier: 4, branch: b, icon: b, gold, maps, allowed: map.maxTierAllowed >= 4 }));
    }
  } else if (tower.level >= 4) {
    items.push({ id: 'upgrade', slot: RING_ANGLES.upgrade, label: 'MAX', cost: null, variant: 'currency', state: 'maxed', ariaLabel: `${def.name} is at maximum level` });
  } else {
    const next = tower.level + 1;
    const tierDef = def[`tier${next}`];
    items.push(purchaseItem({ id: 'upgrade', def, tierDef, tier: next, icon: '⬆', gold, maps, allowed: map.maxTierAllowed >= next }));
  }

  items.push({
    id: 'sell', slot: RING_ANGLES.sell, icon: '💰', label: `+${sellRefund(tower.totalCost)}g`, name: 'Sell', cost: null,
    variant: 'danger', state: 'ready', ariaLabel: `Sell ${def.name}, refund ${sellRefund(tower.totalCost)} gold`,
  });
  return items;
}

// Three short lines for the ring hub (the caller runs them through fitLabels).
export function ringHub(tower) {
  const def = TOWER_DEFS[tower.type];
  const tier = tower.branch ? def[`tier4${tower.branch}`].label : `T${tower.level}`;
  if (tower.type === 'barracks') {
    const s = tower.soldierStats;
    return [tier, `${s.count}× ${s.hp}HP`, `DMG ${s.damage}`];
  }
  return [tier, `DMG ${tower.damage}`, `RNG ${tower.range}`];
}

// Radius to draw for hover/focus on an item, or null when there is nothing new
// to show. Rounds like Tower so the preview matches the built range exactly.
export function previewRadius(item, { rangeMult = 1, currentRange } = {}) {
  if (item.range === undefined) return null;
  const r = Math.round(item.range * rangeMult);
  return r === currentRange ? null : r;
}
