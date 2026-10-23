// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

// Rail lengths are `calc(Npx * var(--hud-k))` so a mouse's narrow rails shrink
// their content with them. One bare px silently keeps its phone size on desktop
// and overflows the 52-px cell, so this guard walks every rule that styles
// something inside #hud-layer.
const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
const css = html.match(/<style>([\s\S]*?)<\/style>/)[1].replace(/\/\*[\s\S]*?\*\//g, '');

// Returns the text of the {...} block opening at `open`, and the index after it.
function block(text, open) {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}' && --depth === 0) return [text.slice(open + 1, i), i + 1];
  }
  throw new Error('unbalanced braces');
}

// Flat [{ selector, body }]; @keyframes dropped, @media flattened.
function parseRules(text) {
  const rules = [];
  let i = 0;
  while (i < text.length) {
    const open = text.indexOf('{', i);
    if (open < 0) break;
    const head = text.slice(i, open).trim();
    const [inner, next] = block(text, open);
    if (head.startsWith('@keyframes')) { /* cosmetic glow radii, intentionally unscaled */ }
    else if (head.startsWith('@')) rules.push(...parseRules(inner));
    else rules.push({ selector: head, body: inner });
    i = next;
  }
  return rules;
}

const doc = new JSDOM(html).window.document;
const hud = doc.getElementById('hud-layer');
const EXEMPT_VAR = /var\(--(rail-w|hud-cell|peek-gap|canvas-w|world-h)\)/;

// Pseudo-classes/elements never change which element a rule targets.
function stripPseudo(sel) {
  return sel
    .replace(/:where\(([^)]*)\)/g, '$1')
    .replace(/:not\([^)]*\)/g, '')
    .replace(/::?[a-z-]+(\([^)]*\))?/gi, '')
    .trim();
}

function matchesRail(selector) {
  return selector.split(',').some((part) => {
    const sel = stripPseudo(part.trim());
    if (sel === '#hud-layer') return true;
    let found;
    try { found = [...doc.querySelectorAll(sel)]; } catch { return false; }
    return found.some((el) => hud.contains(el) && el !== hud
      && !el.closest('.wave-preview'));
  });
}

const railRules = parseRules(css).filter((r) => matchesRail(r.selector));

describe('rail CSS scales with --hud-k', () => {
  it('finds the rail rules (guards against a vacuous filter)', () => {
    expect(railRules.length).toBeGreaterThanOrEqual(20);
  });

  // #radial sits inside #hud-layer, so its rules must be walked by the same guard.
  it('finds the radial rules', () => {
    const hits = (sel) => railRules.some((r) => r.selector.split(',').some((p) => stripPseudo(p.trim()) === sel));
    for (const sel of ['#radial', '#radial-hub', '.radial-item']) expect(hits(sel), sel).toBe(true);
  });

  it('never keeps a bare px length in a rail rule', () => {
    const bad = [];
    for (const { selector, body } of railRules) {
      for (const decl of body.split(';').map((d) => d.trim()).filter(Boolean)) {
        // Strip every sanctioned form, then any px left over is unscaled.
        const rest = decl
          .replace(/calc\(-?\d+(\.\d+)?px \* var\(--hud-k\)\)/g, '')
          .replace(new RegExp(EXEMPT_VAR.source, 'g'), '');
        if (/\d+(\.\d+)?px/.test(rest)) bad.push(`${selector} → ${decl}`);
      }
    }
    expect(bad).toEqual([]);
  });

  // The kit's 1u ring must equal today's 2px rail ring at both k values.
  it('.hud-rail scales the kit unit with --hud-k', () => {
    const rule = parseRules(css).find((r) => r.selector === '.hud-rail');
    expect(rule.body).toMatch(/--ui-u:\s*calc\(2px \* var\(--hud-k\)\)/);
  });

  it('#radial scales the kit unit with --hud-k too', () => {
    const rule = parseRules(css).find((r) => r.selector === '#radial');
    expect(rule.body).toMatch(/--ui-u:\s*calc\(2px \* var\(--hud-k\)\)/);
  });
});
