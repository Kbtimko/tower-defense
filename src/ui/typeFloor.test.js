// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { themeCssVars } from './theme.js';

// #50a: nothing on a DOM screen renders below 11 px (--ui-fs-xs). The only
// exception is the rails, whose calc(N * var(--hud-k)) sizes are authored in
// unscaled game px and shrink with the canvas on purpose.
const FLOOR_PX = 11;
const ROOT_PX = 16;

const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
const css = html.match(/<style>([\s\S]*?)<\/style>/)[1].replace(/\/\*[\s\S]*?\*\//g, '');
const vars = themeCssVars();

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
    if (head.startsWith('@keyframes')) { /* no font sizes in keyframes */ }
    else if (head.startsWith('@')) rules.push(...parseRules(inner));
    else rules.push({ selector: head, body: inner });
    i = next;
  }
  return rules;
}

const fontSizes = parseRules(css).flatMap(({ selector, body }) => body.split(';')
  .map((d) => d.trim()).filter((d) => /^font-size\s*:/.test(d))
  .map((d) => ({ selector, value: d.slice(d.indexOf(':') + 1).trim() })));

// Every length the value could resolve to, in px: each px/rem/em literal and
// each --ui-* var it names. A clamp() fails if its smallest arm is below the floor.
function lengthsPx(value) {
  const literals = [...value.matchAll(/(\d*\.?\d+)(px|rem|em)\b/g)]
    .map(([, n, unit]) => Number(n) * (unit === 'px' ? 1 : ROOT_PX));
  const fromVars = [...value.matchAll(/var\(\s*(--ui-[a-z0-9-]+)/g)]
    .map(([, name]) => parseFloat(vars[name]));
  return [...literals, ...fromVars];
}

const railRule = (value) => /^calc\(.*\*\s*var\(--hud-k\)\s*\)$/.test(value);

describe('type floor (#50a)', () => {
  it('finds font-size declarations (guards against a vacuous parse)', () => {
    expect(fontSizes.length).toBeGreaterThan(50);
    expect(fontSizes.some(({ value }) => railRule(value))).toBe(true);
  });

  it('the floor token is 11 px', () => {
    expect(parseFloat(vars['--ui-fs-xs'])).toBe(FLOOR_PX);
  });

  it(`no font-size below ${FLOOR_PX} px outside the --hud-k rail rules`, () => {
    const bad = fontSizes
      .filter(({ value }) => !railRule(value))
      .filter(({ value }) => lengthsPx(value).some((px) => !(px >= FLOOR_PX)))
      .map(({ selector, value }) => `${selector} → ${value}`);
    expect(bad).toEqual([]);
  });
});
