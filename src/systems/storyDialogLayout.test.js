import { describe, it, expect } from 'vitest';
import { storyDialogProblems, longestPanel } from './storyDialogLayout.js';
import { STORY_SEQUENCES } from '../data/story.js';

const rect = (left, top, width, height) => ({ left, top, right: left + width, bottom: top + height, width, height });

// A clean compact layout at 750x340: portrait left, tab and caption in the column,
// the action row under the panel row.
const clean = () => ({
  viewport: { width: 750, height: 340 },
  portrait: rect(30, 40, 156, 160),
  tab: rect(220, 40, 180, 26),
  caption: rect(220, 72, 510, 90),
  captionScroll: { scrollHeight: 182, clientHeight: 182 },
  actions: rect(8, 220, 734, 44),
  fontPx: 15,
});

describe('storyDialogProblems', () => {
  it('passes a clean layout', () => {
    expect(storyDialogProblems(clean())).toEqual([]);
  });

  it('flags caption overflow past one pixel of rounding', () => {
    expect(storyDialogProblems({ ...clean(), captionScroll: { scrollHeight: 183, clientHeight: 182 } })).toEqual([]);
    const problems = storyDialogProblems({ ...clean(), captionScroll: { scrollHeight: 200, clientHeight: 182 } });
    expect(problems).toEqual(['caption overflows: scrollHeight 200 > clientHeight 182']);
  });

  it.each(['portrait', 'tab', 'caption', 'actions'])('flags %s outside the viewport', (name) => {
    const m = clean();
    const r = m[name];
    m[name] = rect(r.left, m.viewport.height - r.height / 2, r.width, r.height);
    expect(storyDialogProblems(m).some(p => p.startsWith(`${name} outside the viewport`))).toBe(true);
  });

  it('flags a rect off the left edge (a mirrored frame clipped at the screen edge)', () => {
    const problems = storyDialogProblems({ ...clean(), portrait: rect(-6, 40, 156, 160) });
    expect(problems).toContain('portrait outside the viewport [-6,40,150,200]');
  });

  it('tolerates one pixel of rounding at the viewport edge', () => {
    expect(storyDialogProblems({ ...clean(), actions: rect(8, 220, 742.8, 44) })).toEqual([]);
  });

  it('flags a missing rect', () => {
    expect(storyDialogProblems({ ...clean(), tab: null })).toContain('tab missing');
  });

  it('flags portrait over caption when the skew bleed reaches it', () => {
    // The transformed bounding rect is wider than the layout box by the skew overhang.
    const problems = storyDialogProblems({ ...clean(), portrait: rect(30, 40, 196, 160) });
    expect(problems).toContain('portrait overlaps caption');
  });

  it('does not count edges that merely touch as overlap', () => {
    expect(storyDialogProblems({ ...clean(), portrait: rect(30, 40, 190, 160) })).toEqual([]);
  });

  it('flags caption over the action row', () => {
    const problems = storyDialogProblems({ ...clean(), caption: rect(220, 72, 510, 160) });
    expect(problems).toContain('caption overlaps actions');
  });

  it('flags type under 11 px', () => {
    expect(storyDialogProblems({ ...clean(), fontPx: 11 })).toEqual([]);
    expect(storyDialogProblems({ ...clean(), fontPx: 10.5 })).toEqual(['font-size 10.5px < 11px']);
  });

  it('flags a name tab that overflows into the portrait (a long name, Review Focus 3)', () => {
    // A mirrored row: the portrait is on the right, and an untruncated name runs into it.
    const m = { ...clean(), portrait: rect(564, 40, 156, 160), caption: rect(20, 72, 510, 90), tab: rect(330, 40, 300, 26) };
    expect(storyDialogProblems(m)).toEqual(['tab overlaps portrait']);
  });

  it('flags a name tab that wraps onto the caption (Review Focus 3)', () => {
    const problems = storyDialogProblems({ ...clean(), tab: rect(220, 40, 400, 52) });
    expect(problems).toEqual(['tab overlaps caption']);
  });
});

describe('longestPanel', () => {
  it('finds the panel with the most code points', () => {
    const seqs = {
      a: { panels: [{ speaker: 'x', text: 'short' }, { speaker: 'x', text: 'a longer line' }] },
      b: { panels: [{ speaker: 'y', text: '😀😀😀😀😀😀😀😀😀😀😀😀' }, { speaker: 'y', text: 'the longest line here' }] },
    };
    expect(longestPanel(seqs)).toEqual({ sequenceId: 'b', index: 1, speaker: 'y', text: 'the longest line here' });
  });

  it('counts an emoji as one character', () => {
    const seqs = {
      a: { panels: [{ speaker: 'x', text: '😀😀😀😀' }] },
      b: { panels: [{ speaker: 'x', text: 'abcde' }] },
    };
    expect(longestPanel(seqs).sequenceId).toBe('b');
  });

  it('returns null with no panels', () => {
    expect(longestPanel({ a: { panels: [] } })).toBeNull();
  });

  it('agrees with a brute-force scan of the real story', () => {
    const all = Object.values(STORY_SEQUENCES).flatMap(s => s.panels.map(p => Array.from(p.text).length));
    const found = longestPanel(STORY_SEQUENCES);
    expect(Array.from(found.text).length).toBe(Math.max(...all));
    expect(STORY_SEQUENCES[found.sequenceId].panels[found.index].text).toBe(found.text);
  });
});
