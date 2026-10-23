// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { JSDOM } from 'jsdom';

// Roadmap 3.1 rollout: the surfaces the spec lists wear the kit classes, and
// no surface rule repaints them. A leftover background/border/colour on an
// adopted surface silently wins any specificity tie with the kit (surface
// rules sit later in the sheet, or carry an id), so the kit look never shows.
const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
const css = html.match(/<style>([\s\S]*?)<\/style>/)[1].replace(/\/\*[\s\S]*?\*\//g, '');
const doc = new JSDOM(html).window.document;

// Returns the text of the {...} block opening at `open`, and the index after it.
function block(text, open) {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}' && --depth === 0) return [text.slice(open + 1, i), i + 1];
  }
  throw new Error('unbalanced braces');
}

function parseRules(text) {
  const rules = [];
  let i = 0;
  while (i < text.length) {
    const open = text.indexOf('{', i);
    if (open < 0) break;
    const head = text.slice(i, open).trim();
    const [inner, next] = block(text, open);
    if (head.startsWith('@keyframes')) { /* not a surface */ }
    else if (head.startsWith('@')) rules.push(...parseRules(inner));
    else rules.push({ selector: head, body: inner });
    i = next;
  }
  return rules;
}

// Kit className strings built in JS (codex entries, story-log entries, tower
// panel buttons), read from the source so the guard sees what ships. They join
// the static markup in a detached container, so CSS rules aimed at them are
// checked like any other surface.
const jsClassNames = readdirSync(new URL('../', import.meta.url), { recursive: true })
  .filter((f) => f.endsWith('.js') && !f.endsWith('.test.js'))
  .flatMap((f) => [...readFileSync(new URL(`../${f}`, import.meta.url), 'utf8')
    .matchAll(/className\s*=\s*'([^']*\bui-btn\b[^']*)'/g)].map((m) => m[1]));
const jsBuilt = doc.createElement('div');
for (const cls of jsClassNames) jsBuilt.appendChild(doc.createElement('button')).className = cls;
doc.body.appendChild(jsBuilt);

// The spec's JS-built kit surfaces; each must turn up in the source above.
const JS_SURFACES = {
  'codex-entry': ['ui-btn'],
  'story-log-entry': ['ui-btn'],
  'upgrade-btn': ['ui-btn', 'ui-btn--currency'],
  'branch-choose-btn': ['ui-btn', 'ui-btn--currency'],
};

// The spec's "Kit surfaces" list (Rollout), as it appears in static markup.
const SURFACES = {
  '#rail-left': ['ui-panel'],
  '#rail-right': ['ui-panel'],
  '.tower-btn': ['ui-btn'],
  '#pause-btn': ['ui-btn', 'ui-btn--currency'],
  '#speed-btn': ['ui-btn'],
  '#open-codex': ['ui-btn', 'ui-btn--primary'],
  '.ability-btn': ['ui-btn', 'ui-btn--primary'],
  '#cancel-btn': ['ui-btn', 'ui-btn--danger'],
  '#exit-btn': ['ui-btn', 'ui-btn--danger'],
  '#wave-btn': ['ui-btn', 'ui-btn--danger'],
  '#tower-panel': ['ui-panel'],
  '#panel-upgrade-btn': ['ui-btn', 'ui-btn--currency'],
  '#panel-sell-btn': ['ui-btn', 'ui-btn--danger'],
  '#panel-reposition-btn': ['ui-btn', 'ui-btn--primary'],
  '#radial-hub': ['ui-btn'],
  '.radial-item': ['ui-btn'],
  '#tower-tooltip': ['ui-panel'],
  '#inspect-peek': ['ui-panel'],
  '.inspector-panel': ['ui-panel'],
  '.ability-card': ['ui-panel', 'ui-panel--primary'],
  '.wave-preview': ['ui-panel', 'ui-panel--primary'],
  '#codex-overlay-inner': ['ui-panel'],
  '.codex-tab': ['ui-btn'],
  '#codex-close': ['ui-btn'],
  '#settings-overlay-inner': ['ui-panel'],
  '#settings-close': ['ui-btn', 'ui-btn--danger'],
  '.story-dialog-card': ['ui-panel'],
  '#story-dialog-next': ['ui-btn', 'ui-btn--primary'],
  '#story-dialog-skip': ['ui-btn'],
  '.story-banner': ['ui-panel'],
  '#story-dismiss': ['ui-btn'],
  '#story-log-inner': ['ui-panel'],
  '#story-log-close': ['ui-btn'],
  '#game-msg': ['ui-panel'],
  '#msg-btn': ['ui-btn', 'ui-btn--primary'],
  '#msg-cancel-btn': ['ui-btn'],
};
const VARIANT = /^ui-(btn|panel)--/;

describe('kit rollout markup', () => {
  it('every listed surface wears its kit classes and no other variant', () => {
    const bad = [];
    for (const [sel, want] of Object.entries(SURFACES)) {
      const els = [...doc.querySelectorAll(sel)];
      if (!els.length) bad.push(`${sel}: not in markup`);
      for (const el of els) {
        const have = [...el.classList];
        const missing = want.filter((c) => !have.includes(c));
        const extra = have.filter((c) => VARIANT.test(c) && !want.includes(c));
        if (missing.length || extra.length) bad.push(`${sel}#${el.id}: missing ${missing} extra ${extra}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('every JS-built kit surface carries its kit classes', () => {
    const bad = [];
    for (const [cls, want] of Object.entries(JS_SURFACES)) {
      const built = jsClassNames.map((c) => c.split(/\s+/)).filter((c) => c.includes(cls));
      if (!built.length) bad.push(`${cls}: no className string in src`);
      for (const c of built) {
        const missing = want.filter((w) => !c.includes(w));
        const extra = c.filter((w) => VARIANT.test(w) && !want.includes(w));
        if (missing.length || extra.length) bad.push(`${c.join(' ')}: missing ${missing} extra ${extra}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('every rail button is a kit button', () => {
    const buttons = [...doc.querySelectorAll('#hud-layer button')];
    expect(buttons.length).toBeGreaterThan(10);
    expect(buttons.filter((b) => !b.classList.contains('ui-btn')).map((b) => b.id || b.className)).toEqual([]);
  });
});

describe('adopted surfaces leave painting to the kit', () => {
  const kitEl = (el) => el.classList.contains('ui-btn') || el.classList.contains('ui-panel');
  // Rule parts that target only kit elements. A class qualifier compounded
  // onto another selector (.selected, .paused, .maxed, .confirming) is a
  // JS-toggled state that static markup rarely wears, so it is dropped before
  // querying: `.tower-btn.selected` is judged as `.tower-btn`.
  const kitOnly = (part) => {
    if (part.includes('::') || part.includes('.ui-')) return false;
    const sel = part.replace(/:where\(([^)]*)\)/g, '$1').replace(/:not\([^)]*\)/g, '')
      .replace(/:[a-z-]+(\([^)]*\))?/gi, '')
      .replace(/(?<=[\w\])-])\.[\w-]+/g, '').trim();
    let els;
    try { els = [...doc.querySelectorAll(sel)]; } catch { return false; }
    return els.length > 0 && els.every(kitEl);
  };
  // The rail button's transparent border is the touch gutter, not paint.
  const paints = (prop, value) => /^(background|background-color|background-image|box-shadow|color|border-color)$/.test(prop)
    || (/^border(-(top|right|bottom|left))?$/.test(prop) && !/transparent|none/.test(value));

  it('finds adopted surface rules (guards against a vacuous filter)', () => {
    const rules = parseRules(css).filter((r) => r.selector.split(',').some((p) => kitOnly(p.trim())));
    expect(rules.length).toBeGreaterThanOrEqual(20);
  });

  it('no rule aimed only at kit elements sets background, border or colour', () => {
    const bad = [];
    for (const { selector, body } of parseRules(css)) {
      if (!selector.split(',').some((p) => kitOnly(p.trim()))) continue;
      for (const d of body.split(';').map((x) => x.trim()).filter(Boolean)) {
        const c = d.indexOf(':');
        if (paints(d.slice(0, c).trim(), d.slice(c + 1).trim())) bad.push(`${selector} → ${d}`);
      }
    }
    expect(bad).toEqual([]);
  });
});
