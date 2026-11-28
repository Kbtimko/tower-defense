// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// The story dialog is a full-screen modal that traps Tab. #game makes no
// stacking context, so its z-index competes with every positioned element on
// the page (#55b: inspectors at 40 painted over the victory epilogue at 18).
const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
const css = html.match(/<style>([\s\S]*?)<\/style>/)[1].replace(/\/\*[\s\S]*?\*\//g, '');

// Every `selector { ... z-index: N ... }`, @media bodies included: the regex
// takes the innermost selector text before each declaration block. It cannot
// see inline `style=` z-index or z-index set from JS; neither exists today.
const zRules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
  .map(([, sel, body]) => ({ sel: sel.trim(), z: body.match(/z-index\s*:\s*(-?\d+)/)?.[1] }))
  .filter(r => r.z !== undefined)
  .map(r => ({ sel: r.sel, z: Number(r.z) }));

const ABOVE_DIALOG = ['#title-screen', '#rotate-prompt'];
const dialogZ = zRules.find(r => r.sel === '.story-dialog-overlay')?.z;

describe('story dialog stacking (#55b)', () => {
  it('finds the dialog rule and a realistic number of z-index rules', () => {
    expect(dialogZ).toBeTypeOf('number');
    expect(zRules.length).toBeGreaterThan(20);
  });

  it('parses every z-index declaration in the stylesheet', () => {
    // A var()/calc() value or a second z-index in one block would be skipped by
    // the parser; counting raw declarations makes that fail loudly.
    expect((css.match(/z-index\s*:/g) || []).length).toBe(zRules.length);
    // A second <style> block would hide floaters from the single-block scan above.
    expect(html.match(/<style\b/g).length).toBe(1);
  });

  it('sits above every z-index on the page except the title screen and rotate prompt', () => {
    const over = zRules.filter(r => r.sel !== '.story-dialog-overlay'
      && !ABOVE_DIALOG.includes(r.sel) && r.z >= dialogZ);
    expect(over).toEqual([]);
  });

  it('stays below the title screen and the rotate prompt', () => {
    for (const sel of ABOVE_DIALOG) {
      const r = zRules.find(x => x.sel === sel);
      expect(r, sel).toBeDefined();
      expect(r.z, sel).toBeGreaterThan(dialogZ);
    }
  });
});
