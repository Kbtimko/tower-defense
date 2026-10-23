// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// World-map legibility rules (Task 8 fix round 1). The look is verified live;
// this pins the rules so a later edit can't silently drop them.
const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
const css = html.match(/<style>([\s\S]*?)<\/style>/)[1].replace(/\/\*[\s\S]*?\*\//g, '');

// [{ selectors: string[], body }] for every plain rule (at-rule wrappers flattened, keyframes skipped).
function rules(text) {
  const out = [];
  const re = /([^{}@]+)\{([^{}]*)\}/g;
  for (const m of text.replace(/@keyframes[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, '').matchAll(re)) {
    out.push({ selectors: m[1].split(',').map(s => s.trim()), body: m[2] });
  }
  return out;
}
const all = rules(css);
const bodiesFor = (sel) => all.filter(r => r.selectors.includes(sel)).map(r => r.body).join(';');

describe('world map CSS', () => {
  it('pulses only a next node that is not also the selected one (M2: keeps the gold .active glow)', () => {
    const pulsing = all.filter(r => /animation\s*:\s*wm-pulse/.test(r.body)).flatMap(r => r.selectors);
    expect(pulsing.length).toBeGreaterThan(0);
    for (const sel of pulsing) expect(sel).toMatch(/\.next:not\(\.active\)/);
  });

  it('backs node labels and stars with a translucent panel pill (V2: legible over the route lines)', () => {
    for (const sel of ['.ow-node-label', '.ow-node-stars']) {
      expect(bodiesFor(sel), sel).toMatch(/background-color\s*:\s*color-mix\([^;]*var\(--ui-panel\)/);
    }
  });

  it('fades the quote bottom only when JS marks it as overflowing (V3)', () => {
    expect(bodiesFor('#featured-quote.fq-more')).toMatch(/(^|;|\s)mask-image\s*:\s*linear-gradient/);
    expect(bodiesFor('#featured-quote.fq-more')).toMatch(/-webkit-mask-image\s*:\s*linear-gradient/);
    expect(bodiesFor('#featured-quote')).not.toMatch(/mask-image/);
  });
});
