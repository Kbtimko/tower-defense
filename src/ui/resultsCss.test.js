// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

// Results screen comic paint (roadmap 3.6, spec §6, §10, §11). The hue arrives as
// --rs-hue (currency or danger) and the speaker as --rs-frame/--rs-caption, so a
// stray literal here would paint one outcome or one speaker the wrong colour.
const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
const css = html.match(/<style>([\s\S]*?)<\/style>/)[1].replace(/\/\*[\s\S]*?\*\//g, '');
// Missing module reads as '' so the guard fails on its assertions, not at import.
const screenUrl = new URL('./ResultsScreen.js', import.meta.url);
const screenJs = existsSync(screenUrl) ? readFileSync(screenUrl, 'utf8') : '';

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

// Rules inside every `@<kind>` block whose condition matches `query`.
function atRules(kind, query) {
  const out = [];
  for (const m of css.matchAll(new RegExp(`@${kind}\\s*([^{]+)\\{`, 'g'))) {
    if (!query.test(m[1].trim())) continue;
    out.push(...parse(block(css, m.index + m[0].length - 1)[0]).rules);
  }
  return out;
}

// Container-query blocks on the stage, keyed by their max-height in px.
const containerTiers = [...css.matchAll(/@container\s*\(max-height:\s*(\d+)px\)\s*\{/g)]
  .map((m) => ({ px: Number(m[1]), rules: parse(block(css, m.index + m[0].length - 1)[0]).rules }));

const decls = (body) => body.split(';').map((d) => d.trim()).filter(Boolean)
  .map((d) => { const c = d.indexOf(':'); return [d.slice(0, c).trim(), d.slice(c + 1).trim()]; });

const { rules, keyframes } = parse(css);
const names = (selector) => /#results|\.rs-/.test(selector);
const resultRules = rules.filter((r) => names(r.selector));
const selectorsOf = (r) => r.selector.split(',').map((s) => s.trim());
const bodyFor = (sel, from = resultRules) => from.filter((r) => selectorsOf(r).includes(sel)).map((r) => r.body).join(';');
const animationNames = (body) => decls(body)
  .filter(([p]) => p === 'animation' || p === 'animation-name')
  .flatMap(([, v]) => v.split(/[\s,]+/).filter((t) => t in keyframes || /^(rs|sd)-/.test(t)));
const usedKeyframes = [...new Set(resultRules.flatMap(({ body }) => animationNames(body)))];
const rsKeyframes = Object.keys(keyframes).filter((k) => k.startsWith('rs-'));
const U = /calc\(\s*-?\d*\.?\d+\s*\*\s*var\(--ui-u\)\s*\)/g;
const lastCompound = (sel) => sel.split(/\s+|>|~|\+/).filter(Boolean).pop();

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

const keyframeDecls = (body) => [...body.matchAll(/([^{}]+)\{([^{}]*)\}/g)].flatMap(([, , b]) => decls(b));
const resultDecls = [
  ...resultRules.flatMap((r) => decls(r.body).map(([p, v]) => [r.selector, p, v])),
  ...rsKeyframes.flatMap((k) => keyframeDecls(keyframes[k]).map(([p, v]) => [`@keyframes ${k}`, p, v])),
];

// The reveal classes, derived from what ships: the static markup plus the
// className strings ResultsScreen builds (the chips), never a typed list.
const markup = new JSDOM(html).window.document.getElementById('results');
const revealClasses = new Set([
  ...[...(markup?.querySelectorAll('.rs-reveal') ?? [])].flatMap((el) => [...el.classList]),
  ...[...screenJs.matchAll(/'([^']*\brs-reveal\b[^']*)'/g)].flatMap((m) => m[1].split(/\s+/)),
].filter((c) => c.startsWith('rs-') && c !== 'rs-reveal'));

describe('results CSS', () => {
  it('finds the results rules (guards against a vacuous filter)', () => {
    expect(resultRules.length).toBeGreaterThan(15);
    for (const sel of ['.rs-stage', '.rs-banner', '.rs-banner-text', '.rs-star', '.rs-chip', '.rs-caption', '.rs-btn']) {
      expect(bodyFor(sel), sel).not.toBe('');
    }
  });

  it('#results[hidden] is display:none (an author display rule would beat the UA [hidden])', () => {
    expect(decls(bodyFor('#results[hidden]'))).toContainEqual(['display', 'none']);
  });

  it('holds no hex literal and no colour function other than rgba(0,0,0,a)', () => {
    const black = /^rgba\(0,\s*0,\s*0,\s*\d*\.?\d+\)$/;
    const bodies = [...resultRules.map((r) => [r.selector, r.body]),
      ...rsKeyframes.map((k) => [`@keyframes ${k}`, keyframes[k]])];
    const bad = [];
    for (const [selector, body] of bodies) {
      if (/#[0-9a-f]{3,8}\b/i.test(body)) bad.push(`${selector} → hex`);
      for (const [fn] of body.matchAll(/\b(rgba?|hsla?|hwb|lab|lch|oklab|oklch|color-mix|color)\([^()]*(\([^()]*\)[^()]*)*\)/gi)) {
        if (!black.test(fn)) bad.push(`${selector} → ${fn}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('holds no CSS named colour (only tokens, transparent and black rgba)', () => {
    const bad = resultDecls
      .filter(([, , v]) => v.replace(/var\(\s*--[a-z0-9-]+/gi, '').toLowerCase().match(/[a-z]+/g)?.some((w) => NAMED_COLOURS.has(w)))
      .map(([sel, p, v]) => `${sel} → ${p}: ${v}`);
    expect(resultDecls.length).toBeGreaterThan(80);
    expect(bad).toEqual([]);
  });

  it('border, outline, shadow, filter and text-stroke lengths are calc(N * var(--ui-u))', () => {
    const prop = /^(border(-(top|right|bottom|left|width))?|outline(-width|-offset)?|box-shadow|filter|text-shadow|-webkit-text-stroke(-width)?)$/;
    const checked = [];
    const bad = [];
    for (const { selector, body } of resultRules) {
      for (const [p, v] of decls(body)) {
        if (!prop.test(p)) continue;
        checked.push(p);
        const rest = v.replace(U, 'U');
        if (/\d*\.?\d+(px|em|rem|vw|vh|dvh|svh|lvh|vmin|vmax|cqw|cqh|%)/.test(rest)) bad.push(`${selector} → ${p}: ${v}`);
      }
    }
    expect(checked).toEqual(expect.arrayContaining(['border', 'outline', 'box-shadow', 'filter', '-webkit-text-stroke']));
    expect(bad).toEqual([]);
  });

  it('--rs-* length vars are built on var(--ui-u)', () => {
    const vars = resultRules.flatMap((r) => decls(r.body).filter(([p]) => p.startsWith('--rs-')).map(([p, v]) => [r.selector, p, v]));
    const bad = vars.filter(([, , v]) => /\d*\.?\d+(px|em|rem)\b/.test(v.replace(U, ''))).map(([sel, p, v]) => `${sel} → ${p}: ${v}`);
    expect(bad).toEqual([]);
  });

  it('every rs- keyframes a rule names is defined', () => {
    const named = resultRules.flatMap(({ body }) => decls(body)
      .filter(([p]) => p === 'animation' || p === 'animation-name')
      .flatMap(([, v]) => v.split(/[\s,]+/).filter((t) => /^rs-/.test(t))));
    expect(named.length).toBeGreaterThanOrEqual(5);
    expect(named.filter((t) => !(t in keyframes))).toEqual([]);
  });

  // The banner's skew and the chips' tilt live on transform/rotate resting values.
  it('no keyframes a results rule plays animates transform', () => {
    expect(usedKeyframes).toEqual(expect.arrayContaining(['rs-fade', 'sd-glitch']));
    const bad = usedKeyframes.filter((k) => !(k in keyframes) || /(^|[{;\s])transform\s*:/.test(keyframes[k]));
    expect(bad).toEqual([]);
  });

  // §10: the saved setting can override the OS, so this is a class, not a media query.
  // The root itself is excluded so its single rs-fade still plays.
  it('.motion-off stops every animation under the root, but not the root fade', () => {
    const off = resultRules.find((r) => selectorsOf(r).includes('#results.motion-off *'));
    expect(off).toBeDefined();
    expect(decls(off.body)).toContainEqual(['animation', 'none !important']);
    expect(selectorsOf(off)).not.toContain('#results.motion-off');
    expect(animationNames(bodyFor('.rs-overlay'))).toContain('rs-fade');
  });

  // Skip shows the end state at once: resting styles ARE the end state.
  it('#results.rs-done .rs-reveal sets animation: none !important', () => {
    expect(decls(bodyFor('#results.rs-done .rs-reveal'))).toContainEqual(['animation', 'none !important']);
  });

  it('no rule resting a reveal element sets opacity:0 or visibility:hidden', () => {
    expect([...revealClasses]).toEqual(expect.arrayContaining(['rs-banner', 'rs-star', 'rs-chip', 'rs-caption', 'rs-actions']));
    const bad = [];
    for (const r of resultRules) {
      for (const sel of selectorsOf(r)) {
        const last = lastCompound(sel);
        const classes = [...last.matchAll(/\.([\w-]+)/g)].map((m) => m[1]);
        if (!classes.some((c) => c === 'rs-reveal' || revealClasses.has(c))) continue;
        for (const [p, v] of decls(r.body)) {
          if ((p === 'opacity' && parseFloat(v) === 0) || (p === 'visibility' && v === 'hidden')) bad.push(`${sel} → ${p}: ${v}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });

  // A real tap must land where the button is drawn, so the actions never move.
  it('.rs-actions and .rs-btn animate opacity only', () => {
    const played = resultRules.filter((r) => selectorsOf(r).some((s) => /\.rs-(actions|btn)\b/.test(lastCompound(s))))
      .flatMap((r) => animationNames(r.body));
    expect(played.length).toBeGreaterThan(0);
    const bad = played.filter((k) => /(^|[{;\s])(translate|scale|rotate|transform)\s*:/.test(keyframes[k] ?? ''));
    expect(bad).toEqual([]);
  });

  it('the coarse-pointer block sizes .rs-btn to at least 44 x 44', () => {
    const coarse = atRules('media', /^\(pointer:\s*coarse\)$/);
    expect(decls(bodyFor('.rs-btn', coarse))).toEqual(expect.arrayContaining([['min-height', '44px'], ['min-width', '44px']]));
  });

  // §7.5: compact is >= 44x44 for every pointer (a 200%-zoomed laptop is compact and fine).
  it('the compact stage tier sizes .rs-btn to at least 44 x 44', () => {
    const compact = atRules('container', /^\(max-height:\s*500px\)$/);
    expect(decls(bodyFor('.rs-btn', compact))).toEqual(expect.arrayContaining([['min-height', '44px'], ['min-width', '44px']]));
  });

  // What has to fit is the map rect, not the viewport: a 720-px window gives a ~620-px
  // stage that a viewport query calls tall (Task 8 audit, 1280x720 and iPad).
  it('no results rule is keyed to a viewport height query; the stage is the size container', () => {
    const viewport = atRules('media', /height/).filter((r) => names(r.selector)).map((r) => r.selector);
    expect(viewport).toEqual([]);
    expect(decls(bodyFor('.rs-stage'))).toContainEqual(['container-type', 'size']);
  });

  it('a short stage moves the actions into their own column beside stars, chips and caption', () => {
    const tiers = [...containerTiers].sort((a, b) => b.px - a.px);
    expect(tiers.length).toBeGreaterThanOrEqual(2);
    const short = tiers[0];
    // desktop1440's ~697-px map keeps the mockup composition.
    expect(short.px).toBeGreaterThanOrEqual(600);
    expect(short.px).toBeLessThan(697);
    expect(decls(bodyFor('.rs-actions', short.rules))).toEqual(expect.arrayContaining([['grid-column', '2'], ['grid-row', '2 / 5']]));
    for (const sel of ['.rs-stars', '.rs-chips', '.rs-caption']) {
      expect(decls(bodyFor(sel, short.rules)), sel).toContainEqual(['grid-column', '1']);
    }
    // The skew is set on the banner, where the layout audit reads it.
    expect(decls(bodyFor('.rs-banner', short.rules))).toContainEqual(['--rs-skew', 'var(--rs-compact-skew-deg, 3deg)']);
  });

  it('the whole overlay is one tap target that never selects text', () => {
    expect(decls(bodyFor('.rs-overlay'))).toEqual(expect.arrayContaining([
      ['cursor', 'pointer'], ['user-select', 'none'], ['-webkit-touch-callout', 'none'], ['touch-action', 'manipulation'],
    ]));
  });

  // §6.2: a clip-path on the element that carries the drop-shadow would clip it.
  it('no rule puts clip-path and filter on the same element', () => {
    const bySel = new Map();
    for (const r of resultRules) for (const sel of selectorsOf(r)) bySel.set(sel, `${bySel.get(sel) ?? ''};${r.body}`);
    const bad = [...bySel].filter(([, body]) => {
      const props = decls(body).map(([p]) => p);
      return props.includes('clip-path') && props.includes('filter');
    }).map(([sel]) => sel);
    expect(bad).toEqual([]);
  });
});
