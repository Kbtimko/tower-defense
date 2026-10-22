// Pure mirror of GameScene._onTap's priority chain (formerly _onPointerDown):
//   aim -> reposition -> tower -> (close panel) -> inspect -> build -> hero.
// `closePanel: true` marks every outcome that today runs _closeTowerPanel() first
// (everything after the tower-hit check). `clearBuild: true` on openPanel means the
// caller clears selectedType and the .tower-btn highlight, as a tower hit does today.
//
// Caller contract:
//  - state.aimSlot derives from aimMode/_aimSlot (slot 0 is valid, hence != null).
//  - state.repositioning = repositionMode && repositioningBarracks.
//  - state.heroDead = hero.dead.
//  - hits.inspectable must come from a SIDE-EFFECT-FREE hit test: today's
//    inspector.tryClickInspect pins while testing, so the caller runs it only when
//    executing the `pin` action (same-target dismiss stays inside tryClickInspect).
// `reposition` leaves the 60px snap / silent miss-cancel to the caller.
export function resolveTap(state, hits) {
  if (state.aimSlot != null) return { type: 'fireAim', slot: state.aimSlot };
  if (state.repositioning) return { type: 'reposition' };
  if (hits.tower) return { type: 'openPanel', tower: hits.tower, clearBuild: true };
  if (hits.inspectable) return { type: 'pin', target: hits.inspectable, closePanel: true };
  if (state.selectedType) {
    return hits.slot
      ? { type: 'place', closePanel: true }
      : { type: 'cancelBuild', reason: 'noSlot', closePanel: true };
  }
  // Today a dead hero makes the hero step a no-op (panel already closed).
  if (state.heroDead) return { type: 'none', closePanel: true };
  return hits.onPath
    ? { type: 'moveHero', closePanel: true }
    : { type: 'offPath', closePanel: true };
}

export function hasMode(state) {
  return state.aimSlot != null || !!state.repositioning || !!state.selectedType;
}

export function cancelMode(state) {
  return { ...state, aimSlot: null, repositioning: false, selectedType: null };
}
