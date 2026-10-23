// Pure mirror of GameScene._onTap's priority chain:
//   aim -> reposition -> radial open -> tower -> inspect -> armed build ->
//   free pad -> hero.
// `closeRadial: true` marks every outcome that closes an open radial first.
// openRing/openBuild carry no flag: they replace the radial (a retarget).
// `clearBuild: true` on openRing means the caller clears selectedType and the
// .tower-btn highlight, as a tower hit always has.
//
// Caller contract:
//  - state.aimSlot derives from aimMode/_aimSlot (slot 0 is valid, hence != null).
//  - state.repositioning = repositionMode && repositioningBarracks.
//  - state.heroDead = hero.dead.
//  - state.radial = { kind: 'build'|'tower', target } while a radial is open, else null.
//    A build target is the slot it opened on; a tower target is the tower.
//  - hits.slot is a fresh { slotIndex, x, y } per tap, so pads compare by index.
//  - hits.inspectable must come from a SIDE-EFFECT-FREE hit test: today's
//    inspector.tryClickInspect pins while testing, so the caller runs it only when
//    executing the `pin` action (same-target dismiss stays inside tryClickInspect).
// `reposition` leaves the 60px snap / silent miss-cancel to the caller.
export function resolveTap(state, hits) {
  if (state.aimSlot != null) return { type: 'fireAim', slot: state.aimSlot };
  if (state.repositioning) return { type: 'reposition' };
  if (state.radial) return resolveWithRadial(state.radial, hits);
  if (hits.tower) return { type: 'openRing', tower: hits.tower, clearBuild: true };
  if (hits.inspectable) return { type: 'pin', target: hits.inspectable, closeRadial: true };
  if (state.selectedType) {
    return hits.slot
      ? { type: 'place', closeRadial: true }
      : { type: 'cancelBuild', reason: 'noSlot', closeRadial: true };
  }
  if (hits.slot) return { type: 'openBuild', slot: hits.slot };
  // A dead hero makes the hero step a no-op.
  if (state.heroDead) return { type: 'none', closeRadial: true };
  return hits.onPath
    ? { type: 'moveHero', closeRadial: true }
    : { type: 'offPath', closeRadial: true };
}

// The radial sits on the field, so a dismiss tap usually lands on path or
// ground beside it; passing that tap through would move the hero by accident.
function resolveWithRadial(radial, hits) {
  const close = { type: 'none', closeRadial: true };
  if (hits.tower) {
    return radial.kind === 'tower' && radial.target === hits.tower
      ? close
      : { type: 'openRing', tower: hits.tower, clearBuild: true };
  }
  if (hits.slot) {
    return radial.kind === 'build' && radial.target.slotIndex === hits.slot.slotIndex
      ? close
      : { type: 'openBuild', slot: hits.slot };
  }
  return close;
}

export function hasMode(state) {
  return state.aimSlot != null || !!state.repositioning || !!state.selectedType || !!state.radial;
}
