// Tower fire-rate modifier stack. Lets multiple temporary buffs (Power Surge,
// Overcharge, future abilities) coexist on the same tower without clobbering
// each other's restore state.
//
// Each mod has a string id; calling apply with the same id replaces (so
// re-casting an ability mid-buff doesn't double-stack). The tower's true
// pre-buff rate is captured in `_baseFireRate` on first apply and never
// overwritten by another buff.

export function applyFireRateMod(tower, id, mult) {
  tower._baseFireRate ??= tower.fireRate;
  tower._fireRateMods ??= new Map();
  tower._fireRateMods.set(id, mult);
  recomputeFireRate(tower);
}

export function clearFireRateMod(tower, id) {
  if (!tower._fireRateMods) return;
  tower._fireRateMods.delete(id);
  recomputeFireRate(tower);
}

function recomputeFireRate(tower) {
  let mult = 1;
  for (const m of tower._fireRateMods.values()) mult *= m;
  tower.fireRate = tower._baseFireRate * mult;
}
