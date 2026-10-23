// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { themeCssVars } from './theme.js';

// The kit is CSS reading JS-published vars, so a typo or a stray literal fails
// silently in the browser (an unknown var paints nothing; a px in a kit rule
// keeps its desktop size on a scaled rail). These guards make each fail loudly.
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

// Flat [{ selector, body }]; @keyframes dropped, other @-blocks flattened.
function parseRules(text) {
  const rules = [];
  let i = 0;
  while (i < text.length) {
    const open = text.indexOf('{', i);
    if (open < 0) break;
    const head = text.slice(i, open).trim();
    const [inner, next] = block(text, open);
    if (head.startsWith('@keyframes')) { /* no fonts or kit vars in keyframes */ }
    else if (head.startsWith('@')) rules.push(...parseRules(inner));
    else rules.push({ selector: head, body: inner });
    i = next;
  }
  return rules;
}

const decls = (body) => body.split(';').map((d) => d.trim()).filter(Boolean)
  .map((d) => { const c = d.indexOf(':'); return [d.slice(0, c).trim(), d.slice(c + 1).trim()]; });

const rules = parseRules(css);
const kitRules = rules.filter((r) => r.selector.includes('.ui-'));
const vars = themeCssVars();

// Task 5 of the 3.1 plan moves these Phaser text styles onto FONTS.body; until
// then each file may keep exactly this many Georgia literals and no more. Task 5
// empties this map.
const PENDING_PHASER_GEORGIA = {
  'src/ui/loadingBar.js': 1,
  'src/scenes/GameScene.js': 2,
  'src/entities/Tower.js': 1,
};

function sourceFiles() {
  const root = new URL('../../', import.meta.url);
  return readdirSync(new URL('src/', root), { recursive: true })
    .filter((f) => f.endsWith('.js') && !f.endsWith('.test.js'))
    .map((f) => `src/${f.split('\\').join('/')}`)
    .map((path) => ({ path, text: readFileSync(new URL(path, root), 'utf8') }));
}

describe('fonts', () => {
  it('index.html names no Georgia or Courier New', () => {
    expect(html.match(/Georgia|Courier New/g)).toBeNull();
  });

  it('non-test src JS names no Courier New, and Georgia only where Task 5 is pending', () => {
    const bad = [];
    for (const { path, text } of sourceFiles()) {
      if (/Courier New/.test(text)) bad.push(`${path}: Courier New`);
      const georgia = (text.match(/Georgia/g) ?? []).length;
      if (georgia !== (PENDING_PHASER_GEORGIA[path] ?? 0)) bad.push(`${path}: ${georgia} Georgia`);
    }
    expect(bad).toEqual([]);
  });

  it('every font-family is a theme var, the rail label var, or inherit', () => {
    const allowed = /^(var\(--ui-font-(heading|body)(,[^)]*)?\)|var\(--hud-label-font\)|inherit)$/;
    const families = [...css.matchAll(/font-family\s*:\s*([^;}]+)/g)].map((m) => m[1].trim());
    expect(families.length).toBeGreaterThan(0);
    expect(families.filter((f) => !allowed.test(f))).toEqual([]);
  });

  it('--hud-label-font leads with Rajdhani', () => {
    const value = css.match(/--hud-label-font\s*:\s*([^;]+)/)[1].trim();
    expect(value.startsWith('"Rajdhani"')).toBe(true);
  });

  it('button-like controls inherit the family only (never the font shorthand)', () => {
    const rule = rules.find((r) => r.selector.replace(/\s+/g, ' ') === 'button, input, select, textarea');
    expect(rule && decls(rule.body)).toEqual([['font-family', 'inherit']]);
  });
});

describe('ui kit css', () => {
  it('finds the kit rules (guards against a vacuous filter)', () => {
    for (const sel of ['.ui-panel', '.ui-btn', '.ui-btn--primary', '.ui-btn--danger', '.ui-btn--currency']) {
      expect(kitRules.some((r) => r.selector.split(',').some((s) => s.trim() === sel))).toBe(true);
    }
  });

  it('every var(--ui-*) referenced is published by themeCssVars()', () => {
    const used = new Set([...html.matchAll(/var\(\s*(--ui-[a-z0-9-]+)/g)].map((m) => m[1]));
    expect(used.size).toBeGreaterThan(0);
    expect([...used].filter((k) => !(k in vars))).toEqual([]);
  });

  it('kit rules hold no px and no hex literal', () => {
    const bad = kitRules.filter(({ body }) => /\d+(\.\d+)?px/.test(body) || /#[0-9a-f]{3,6}\b/i.test(body))
      .map((r) => r.selector);
    expect(bad).toEqual([]);
  });

  // "Kit paints, surfaces lay out": a size or padding here would fight every
  // surface's geometry, and `background` shorthand resets background-clip,
  // which the rail's transparent touch gutter depends on.
  it('kit rules set paint properties only', () => {
    const paint = /^(--[a-z0-9-]+|background-color|background-image|box-shadow|color|cursor|transition|outline|outline-offset)$/;
    const bad = [];
    for (const { selector, body } of kitRules) {
      for (const [prop] of decls(body)) {
        const borderReset = prop === 'border' && selector.startsWith(':where(');
        if (!paint.test(prop) && !borderReset) bad.push(`${selector} → ${prop}`);
      }
    }
    expect(bad).toEqual([]);
  });
});

describe('--ui-u scoping', () => {
  // A custom property resolves var() where it is declared: a root-composed
  // length would freeze the 1px unit and carry it into the scaled rails.
  it('no :root/html custom property composes var(--ui-u)', () => {
    const bad = [];
    for (const { selector, body } of rules) {
      if (!selector.split(',').some((s) => /^(:root|html)$/.test(s.trim()))) continue;
      for (const [prop, value] of decls(body)) {
        if (prop.startsWith('--') && value.includes('var(--ui-u')) bad.push(`${selector} → ${prop}`);
      }
    }
    expect(bad).toEqual([]);
    expect(Object.entries(vars).filter(([, v]) => v.includes('var(--ui-u'))).toEqual([]);
  });

  it('.wave-preview runs the kit in unscaled game px', () => {
    const rule = rules.find((r) => r.selector === '.wave-preview');
    expect(decls(rule.body)).toContainEqual(['--ui-u', '2px']);
  });
});
