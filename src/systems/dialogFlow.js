// Pure typing/complete/advance state machine for the story dialog. Driven by
// timestamps only: no timers, no DOM, no Phaser (spec §3.3).
import { createSequence, currentPanel, advance, atEnd, isComplete } from './storySequence.js';
import { typeDurationMs, charsShown } from './typewriter.js';

// A new speaker slams in; the same speaker just swaps the line.
function transitionAt(seq, index) {
  const prev = seq.panels[index - 1];
  return prev && prev.speaker === seq.panels[index].speaker ? 'swap' : 'slam';
}

function typeDelayMs(seq, cfg) {
  return transitionAt(seq, seq.index) === 'slam' ? cfg.slamDelayMs : cfg.swapDelayMs;
}

function typeEndOf(state, cfg) {
  const panel = currentPanel(state.seq);
  return state.panelStart + typeDelayMs(state.seq, cfg) + typeDurationMs(panel.text, cfg);
}

// Motion off and empty text both skip typing; completeAt = start keeps the
// double-tap guard in force for the first tap on the panel.
function enter(seq, now, motion) {
  if (isComplete(seq)) return { seq, motion, phase: 'done', panelStart: now, completeAt: now };
  const instant = !motion || currentPanel(seq).text === '';
  return {
    seq,
    motion,
    phase: instant ? 'complete' : 'typing',
    panelStart: now,
    completeAt: instant ? now : null,
  };
}

export function startFlow(sequence, now, { motion = true } = {}) {
  return enter(createSequence(sequence), now, motion);
}

export function tick(state, now, cfg) {
  if (state.phase !== 'typing') return state;
  const end = typeEndOf(state, cfg);
  return now >= end ? { ...state, phase: 'complete', completeAt: end } : state;
}

export function primary(state, now, cfg) {
  if (state.phase === 'done') return state;
  const ticked = tick(state, now, cfg);
  if (ticked.phase === 'typing') return { ...ticked, phase: 'complete', completeAt: now };
  if (now - ticked.completeAt < cfg.advanceGuardMs) return ticked;
  return enter(advance(ticked.seq), now, ticked.motion);
}

export function skip(state) {
  return state.phase === 'done' ? state : { ...state, phase: 'done' };
}

export function view(state, now, cfg) {
  const { seq, phase } = state;
  const panel = currentPanel(seq);
  if (!panel) {
    return { index: seq.index, phase: 'done', shown: 0, length: 0, isLast: true, transition: 'slam', panel: null };
  }
  const length = Array.from(panel.text).length;
  const shown = phase === 'typing'
    ? charsShown(panel.text, now - state.panelStart - typeDelayMs(seq, cfg), cfg)
    : length;
  return {
    index: seq.index,
    phase,
    shown,
    length,
    isLast: atEnd(seq),
    transition: transitionAt(seq, seq.index),
    panel,
  };
}
