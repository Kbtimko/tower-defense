// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { STORY_DIALOG } from '../data/storyDialog.js';

// Story dialog comic paint (roadmap 3.5, spec §4.1 paint rules, §3.4, §6).
// Speaker colours arrive as --sd-frame/--sd-caption and everything else is a
// token, so a stray literal here would paint one speaker the wrong colour.
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

// Flat rules (@media flattened) plus keyframes kept by name.
function parse(text, out = { rules: [], keyframes: {} }) {
  let i = 0;
  while (i < text.length) {
    const open = text.indexOf('{', i);
    if (open < 0) break;
    const head = text.slice(i, open).trim();
    const [inner, next] = block(text, open);
    if (head.startsWith('@keyframes')) out.keyframes[head.split(/\s+/)[1]] = inner;
    else if (head.startsWith('@')) parse(inner, out);
    else out.rules.push({ selector: head.replace(/\s+/g, ' '), body: inner });
    i = next;
  }
  return out;
}

const decls = (body) => body.split(';').map((d) => d.trim()).filter(Boolean)
  .map((d) => { const c = d.indexOf(':'); return [d.slice(0, c).trim(), d.slice(c + 1).trim()]; });

const { rules, keyframes } = parse(css);
const names = (selector) => /#story-dialog|\.story-dialog|\.sd-/.test(selector);
const dialogRules = rules.filter((r) => names(r.selector));
const selectorsOf = (r) => r.selector.split(',').map((s) => s.trim());
const bodyFor = (sel) => dialogRules.filter((r) => selectorsOf(r).includes(sel)).map((r) => r.body).join(';');

// Keyframe names a dialog rule's animation/animation-name declaration plays.
const usedKeyframes = [...new Set(dialogRules.flatMap(({ body }) => decls(body)
  .filter(([p]) => p === 'animation' || p === 'animation-name')
  .flatMap(([, v]) => v.split(/[\s,]+/).filter((t) => t in keyframes))))];
const sdKeyframes = Object.keys(keyframes).filter((k) => k.startsWith('sd-'));
const U = /calc\(\s*-?\d*\.?\d+\s*\*\s*var\(--ui-u\)\s*\)/g;

// CSS named colours (CSS Color 4); transparent/currentcolor are deliberately absent.
const NAMED_COLOURS = new Set(('aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue '
  + 'blueviolet brown burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue '
  + 'darkcyan darkgoldenrod darkgray darkgreen darkgrey darkkhaki darkmagenta darkolivegreen darkorange darkorchid '
  + 'darkred darksalmon darkseagreen darkslateblue darkslategray darkslategrey darkturquoise darkviolet deeppink '
  + 'deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite gold '
  + 'goldenrod gray green greenyellow grey honeydew hotpink indianred indigo ivory khaki lavender lavenderblush '
  + 'lawngreen lemonchiffon lightblue lightcoral lightcyan lightgoldenrodyellow lightgray lightgreen lightgrey '
  + 'lightpink lightsalmon lightseagreen lightskyblue lightslategray lightslategrey lightsteelblue lightyellow lime '
  + 'limegreen linen magenta maroon mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen '
  + 'mediumslateblue mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream mistyrose moccasin '
  + 'navajowhite navy oldlace olive olivedrab orange orangered orchid palegoldenrod palegreen paleturquoise '
  + 'palevioletred papayawhip peachpuff peru pink plum powderblue purple rebeccapurple red rosybrown royalblue '
  + 'saddlebrown salmon sandybrown seagreen seashell sienna silver skyblue slateblue slategray slategrey snow '
  + 'springgreen steelblue tan teal thistle tomato turquoise violet wheat white whitesmoke yellow yellowgreen').split(' '));

// Every declaration the dialog paints with: its rules plus its sd- keyframes.
const keyframeDecls = (body) => [...body.matchAll(/([^{}]+)\{([^{}]*)\}/g)].flatMap(([, , b]) => decls(b));
const dialogDecls = [
  ...dialogRules.flatMap((r) => decls(r.body).map(([p, v]) => [r.selector, p, v])),
  ...sdKeyframes.flatMap((k) => keyframeDecls(keyframes[k]).map(([p, v]) => [`@keyframes ${k}`, p, v])),
];

describe('story dialog CSS', () => {
  it('finds the dialog rules (guards against a vacuous filter)', () => {
    expect(dialogRules.length).toBeGreaterThan(10);
    for (const sel of ['.sd-frame', '.sd-name', '.sd-caption', '.sd-text', '.sd-actions', '.sd-rest']) {
      expect(bodyFor(sel), sel).not.toBe('');
    }
  });

  it('holds no hex literal and no colour function other than rgba(0,0,0,a)', () => {
    const black = /^rgba\(0,\s*0,\s*0,\s*\d*\.?\d+\)$/;
    const bodies = [...dialogRules.map((r) => [r.selector, r.body]),
      ...sdKeyframes.map((k) => [`@keyframes ${k}`, keyframes[k]])];
    const bad = [];
    for (const [selector, body] of bodies) {
      if (/#[0-9a-f]{3,8}\b/i.test(body)) bad.push(`${selector} → hex`);
      for (const [fn] of body.matchAll(/\b(rgba?|hsla?|hwb|lab|lch|oklab|oklch|color-mix|color)\([^()]*(\([^()]*\)[^()]*)*\)/gi)) {
        if (!black.test(fn)) bad.push(`${selector} → ${fn}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('border, outline and shadow lengths are calc(N * var(--ui-u))', () => {
    const prop = /^(border(-(top|right|bottom|left|width))?|outline(-width|-offset)?|box-shadow|filter|text-shadow)$/;
    const checked = [];
    const bad = [];
    for (const { selector, body } of dialogRules) {
      for (const [p, v] of decls(body)) {
        if (!prop.test(p)) continue;
        checked.push(p);
        const rest = v.replace(U, 'U');
        if (/\d*\.?\d+(px|em|rem|vw|vh|dvh|svh|lvh|vmin|vmax|cqw|cqh|%)/.test(rest)) bad.push(`${selector} → ${p}: ${v}`);
      }
    }
    expect(checked).toEqual(expect.arrayContaining(['border', 'outline', 'box-shadow', 'filter']));
    expect(bad).toEqual([]);
  });

  // Review Focus 3: a 28-character speaker name stays on one line.
  it('the name tab truncates on one line with an ellipsis', () => {
    const tab = decls(bodyFor('.sd-name'));
    expect(tab).toEqual(expect.arrayContaining([
      ['white-space', 'nowrap'], ['overflow', 'hidden'], ['text-overflow', 'ellipsis'],
    ]));
  });

  // The skew lives on transform; animating transform would wipe it mid-slam.
  it('no keyframes the dialog plays animates transform', () => {
    expect(usedKeyframes.length).toBeGreaterThanOrEqual(4);
    for (const k of usedKeyframes) expect(k, k).toMatch(/^sd-/);
    const bad = usedKeyframes.filter((k) => /(^|[{;\s])transform\s*:/.test(keyframes[k]));
    expect(bad).toEqual([]);
  });

  it('every sd- keyframes a rule names is defined', () => {
    const named = dialogRules.flatMap(({ body }) => decls(body)
      .filter(([p]) => p === 'animation' || p === 'animation-name')
      .flatMap(([, v]) => v.split(/[\s,]+/).filter((t) => /^sd-/.test(t))));
    expect(named.length).toBeGreaterThan(0);
    expect(named.filter((t) => !(t in keyframes))).toEqual([]);
  });

  // §6: the saved setting can override the OS, so this is a class, not a media query.
  it('.motion-off stops every animation in the dialog subtree', () => {
    const off = dialogRules.find((r) => selectorsOf(r).includes('#story-dialog.motion-off *'));
    expect(off).toBeDefined();
    expect(selectorsOf(off)).toEqual(expect.arrayContaining(['#story-dialog.motion-off', '#story-dialog.motion-off *']));
    expect(decls(off.body)).toContainEqual(['animation', 'none !important']);
  });

  it('the untyped rest is hidden, not removed', () => {
    expect(decls(bodyFor('.sd-rest'))).toContainEqual(['visibility', 'hidden']);
  });

  it('the whole overlay is one tap target that never selects text', () => {
    const overlay = decls(bodyFor('.story-dialog-overlay'));
    expect(overlay).toEqual(expect.arrayContaining([
      ['cursor', 'pointer'], ['user-select', 'none'], ['-webkit-touch-callout', 'none'], ['touch-action', 'manipulation'],
    ]));
  });

  it('the touch-size list still covers the dialog buttons', () => {
    const coarse = rules.find((r) => selectorsOf(r).includes('.sd-actions button') && /min-height\s*:\s*44px/.test(r.body));
    expect(coarse).toBeDefined();
  });

  it('#story-log-inner h3 is painted with the accent token (#50b)', () => {
    const h3 = rules.filter((r) => selectorsOf(r).includes('#story-log-inner h3')).map((r) => r.body).join(';');
    expect(decls(h3)).toContainEqual(['color', 'var(--ui-accent)']);
    expect(h3).not.toMatch(/#[0-9a-f]{3,8}\b/i);
  });

  it('holds no CSS named colour (only tokens, transparent and black rgba)', () => {
    const bad = dialogDecls
      .filter(([, , v]) => v.replace(/var\(\s*--[a-z0-9-]+/gi, '').toLowerCase().match(/[a-z]+/g)?.some((w) => NAMED_COLOURS.has(w)))
      .map(([sel, p, v]) => `${sel} → ${p}: ${v}`);
    expect(dialogDecls.length).toBeGreaterThan(50);
    expect(bad).toEqual([]);
  });

  // The kit lengths live in --sd-* vars on the stage, so the vars themselves are checked.
  it('--sd-* length vars are built on var(--ui-u); border/outline/drop/dot vars are exactly calc(N * var(--ui-u))', () => {
    const vars = dialogRules.flatMap((r) => decls(r.body).filter(([p]) => p.startsWith('--sd-')).map(([p, v]) => [r.selector, p, v]));
    const strict = vars.filter(([, p]) => /(border|outline|drop|dot)/.test(p));
    expect(strict.length).toBeGreaterThanOrEqual(6);
    const bad = [
      ...strict.filter(([, , v]) => v.replace(U, '') !== '').map(([sel, p, v]) => `${sel} → ${p}: ${v}`),
      ...vars.filter(([, , v]) => /\d*\.?\d+(px|em|rem)\b/.test(v.replace(U, ''))).map(([sel, p, v]) => `${sel} → ${p}: ${v}`),
    ];
    expect(bad).toEqual([]);
  });

  // Keyframe offsets can't read a var, so the glitch window is pinned to the data here.
  it('the glitch blip starts at 1 - glitchMs / glitchPeriodMs and nothing glitches before it', () => {
    const start = Math.round((1 - STORY_DIALOG.glitchMs / STORY_DIALOG.glitchPeriodMs) * 1000) / 10;
    const frames = [...keyframes['sd-glitch'].matchAll(/([^{}]+)\{([^{}]*)\}/g)]
      .flatMap(([, sel, body]) => sel.split(',').map((o) => [parseFloat(o.trim()), body]));
    const blips = frames.filter(([, body]) => /hue-rotate/.test(body)).map(([o]) => o);
    expect(blips.length).toBeGreaterThan(0);
    expect(Math.min(...blips)).toBe(start);
    expect(frames.filter(([o]) => o > 0 && o < start)).toEqual([]);
  });

  // Skip and Next must never sit inside an animated subtree (spec §3.4).
  it('nothing animates the overlay, the stage, the action row or its buttons', () => {
    const animated = dialogRules.filter(({ body }) => decls(body)
      .some(([p, v]) => (p === 'animation' || p === 'animation-name') && !/^none\b/.test(v)))
      .flatMap(selectorsOf);
    expect(animated.length).toBeGreaterThanOrEqual(4);
    const bad = animated.filter((sel) => {
      const last = sel.split(/\s+|>|~|\+/).filter(Boolean).pop();
      return /\.sd-stage|\.sd-actions|#story-dialog-(next|skip)/.test(sel) || /^#story-dialog(?![-\w])/.test(last);
    });
    expect(bad).toEqual([]);
  });

  // Spec §7: compact is >= 44x44 for every pointer, not only coarse (a 200%-zoomed laptop is compact and fine).
  it('the compact layout sizes Skip and Next to at least 44 x 44', () => {
    const compact = [];
    for (const m of css.matchAll(/@media\s*\(max-height:\s*500px\)\s*\{/g)) {
      compact.push(...parse(block(css, m.index + m[0].length - 1)[0]).rules);
    }
    const btn = decls(compact.filter((r) => selectorsOf(r).includes('.sd-actions button')).map((r) => r.body).join(';'));
    expect(btn).toEqual(expect.arrayContaining([['min-height', '44px'], ['min-width', '44px']]));
    expect(decls(compact.filter((r) => selectorsOf(r).includes('.sd-actions')).map((r) => r.body).join(';')))
      .toContainEqual(['min-height', '44px']);
  });
});
