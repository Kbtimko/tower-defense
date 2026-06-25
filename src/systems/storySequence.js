// Pure navigator over a story sequence's panels. No DOM, no Phaser.
// A sequence is { panels: Array<{ speaker, text }> }.
// State is { panels, index }; all transitions return new state objects.

export function createSequence(sequence) {
  return { panels: sequence?.panels ?? [], index: 0 };
}

export function currentPanel(state) {
  return state.panels[state.index] ?? null;
}

export function advance(state) {
  return { panels: state.panels, index: Math.min(state.index + 1, state.panels.length) };
}

export function atEnd(state) {
  return state.index >= state.panels.length - 1;
}

export function isComplete(state) {
  return state.index >= state.panels.length;
}
