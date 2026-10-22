// Pure mirror of GameScene._onPointerDown's priority chain:
//   aim -> reposition -> tower -> (close panel) -> inspect -> build -> hero.
// `closePanel: true` marks every outcome that today runs _closeTowerPanel() first
// (everything after the tower-hit check). `clearBuild: true` on openPanel means the
// caller clears selectedType and the .tower-btn highlight, as a tower hit does today.
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
