// Pure verdicts for the story dialog's painted layout (spec §8.3). The capture
// harness measures the rects in a real browser; this decides what is wrong, so
// the rules are unit-testable without one.

const EDGE_TOLERANCE_PX = 1;
// The type floor (--ui-fs-xs, guarded for the CSS by typeFloor.test.js); this
// checks what actually computed, after clamp() and the compact media query.
const FONT_FLOOR_PX = 11;

const fmt = r => `[${[r.left, r.top, r.right, r.bottom].map(n => Math.round(n)).join(',')}]`;

const outside = (r, { width, height }) => r.left < -EDGE_TOLERANCE_PX || r.top < -EDGE_TOLERANCE_PX
  || r.right > width + EDGE_TOLERANCE_PX || r.bottom > height + EDGE_TOLERANCE_PX;

const intersects = (a, b) => a.left < b.right - EDGE_TOLERANCE_PX && a.right > b.left + EDGE_TOLERANCE_PX
  && a.top < b.bottom - EDGE_TOLERANCE_PX && a.bottom > b.top + EDGE_TOLERANCE_PX;

// The portrait is its transformed bounding rect, so the skew overhang counts.
// `captionScroll` is the fixed-height panel row's scroll metrics: a caption that
// outgrows the row shows up there, not on the caption box, which just grows.
export function storyDialogProblems({ viewport, portrait, tab, caption, captionScroll, actions, fontPx }) {
  const problems = [];
  if (captionScroll.scrollHeight > captionScroll.clientHeight + EDGE_TOLERANCE_PX) {
    problems.push(`caption overflows: scrollHeight ${captionScroll.scrollHeight} > clientHeight ${captionScroll.clientHeight}`);
  }
  const rects = { portrait, tab, caption, actions };
  for (const [name, r] of Object.entries(rects)) {
    if (!r) problems.push(`${name} missing`);
    else if (outside(r, viewport)) problems.push(`${name} outside the viewport ${fmt(r)}`);
  }
  for (const [a, b] of [['portrait', 'caption'], ['caption', 'actions'], ['tab', 'portrait'], ['tab', 'caption']]) {
    if (rects[a] && rects[b] && intersects(rects[a], rects[b])) problems.push(`${a} overlaps ${b}`);
  }
  if (fontPx < FONT_FLOOR_PX) problems.push(`font-size ${fontPx}px < ${FONT_FLOOR_PX}px`);
  return problems;
}

// The panel with the most code points (an emoji counts once, as it types), so
// the harness shoots whatever line is longest today rather than a hardcoded one.
export function longestPanel(sequences) {
  let best = null;
  for (const [sequenceId, seq] of Object.entries(sequences)) {
    seq.panels.forEach((p, index) => {
      const length = Array.from(p.text).length;
      if (!best || length > best.length) best = { sequenceId, index, speaker: p.speaker, text: p.text, length };
    });
  }
  if (!best) return null;
  const { length, ...panel } = best;
  return panel;
}
