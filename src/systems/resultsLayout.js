// Pure verdicts for the results screen's painted layout (spec §8.4). The capture harness
// measures rects in a real browser after the reveal; this decides what is wrong.

import { targetSizeProblems } from './layoutAudit.js';

const EDGE_TOLERANCE_PX = 1;
// The type floor (--ui-fs-xs); this checks what actually computed after clamp()/media queries.
const FONT_FLOOR_PX = 11;

const fmt = r => `[${[r.left, r.top, r.right, r.bottom].map(n => Math.round(n)).join(',')}]`;

const outside = (r, m) => r.left < m.left - EDGE_TOLERANCE_PX || r.top < m.top - EDGE_TOLERANCE_PX
  || r.right > m.right + EDGE_TOLERANCE_PX || r.bottom > m.bottom + EDGE_TOLERANCE_PX;

const intersects = (a, b) => a.left < b.right - EDGE_TOLERANCE_PX && a.right > b.left + EDGE_TOLERANCE_PX
  && a.top < b.bottom - EDGE_TOLERANCE_PX && a.bottom > b.top + EDGE_TOLERANCE_PX;

// The banner is rotated about its centre, so its lower edge is a slanted line, not box.bottom.
// Comparing against the bounding box would flag the empty corners and miss the skew bleed.
export function bannerLowerEdge(box, skewDeg) {
  const cx = (box.left + box.right) / 2;
  const slope = Math.tan(skewDeg * Math.PI / 180);
  return x => box.bottom + slope * (cx - x);
}

export function resultsProblems(m) {
  const problems = [];
  const named = [
    ['kicker', m.kicker],
    ['bannerText', m.bannerText],
    ...(m.result === 'defeat' ? [] : [['stars', m.stars]]),
    ...m.chips.map((r, i) => [`chips[${i}]`, r]),
    ...m.newBest.map((r, i) => [`newBest[${i}]`, r]),
    ['caption', m.caption],
    ['actions', m.actions],
    ...m.buttons.filter(b => b.visible).map(b => [`button ${b.name}`, b.rect]),
  ];
  // A selector that matched nothing measures null; skipping it would pass vacuously.
  if (!m.bannerBox) problems.push('bannerBox missing');
  if (!m.chips.length) problems.push('chips missing');
  for (const [name, r] of named) {
    if (!r) problems.push(`${name} missing`);
    else if (outside(r, m.mapRect)) problems.push(`${name} outside map ${fmt(r)}`);
  }

  if (m.bannerTextScroll.scrollWidth > m.bannerTextScroll.clientWidth + EDGE_TOLERANCE_PX) {
    problems.push(`banner text overflows: scrollWidth ${m.bannerTextScroll.scrollWidth} > clientWidth ${m.bannerTextScroll.clientWidth}`);
  }
  if (m.captionScroll.scrollHeight > m.captionScroll.clientHeight + EDGE_TOLERANCE_PX) {
    problems.push(`caption overflows: scrollHeight ${m.captionScroll.scrollHeight} > clientHeight ${m.captionScroll.clientHeight}`);
  }

  const pairs = [];
  if (m.stars) {
    for (const [i, c] of m.chips.entries()) pairs.push(['stars', m.stars, `chip ${i}`, c]);
    pairs.push(['stars', m.stars, 'actions', m.actions]);
  }
  for (const [i, c] of m.chips.entries()) {
    pairs.push([`chip ${i}`, c, 'caption', m.caption], [`chip ${i}`, c, 'actions', m.actions]);
    for (let j = i + 1; j < m.chips.length; j++) pairs.push([`chip ${i}`, c, `chip ${j}`, m.chips[j]]);
  }
  pairs.push(['caption', m.caption, 'actions', m.actions]);
  for (const [an, a, bn, b] of pairs) {
    if (a && b && intersects(a, b)) problems.push(`${an} overlaps ${bn}`);
  }

  const edge = m.bannerBox ? bannerLowerEdge(m.bannerBox, m.skewDeg) : null;
  const below = [['stars', m.stars], ...m.chips.map((r, i) => [`chip ${i}`, r]), ['caption', m.caption], ['actions', m.actions]];
  for (const [name, r] of below) {
    if (!r || !edge) continue;
    const overlapsX = r.left < m.bannerBox.right && r.right > m.bannerBox.left;
    if (overlapsX && (r.top < edge(r.left) || r.top < edge(r.right))) problems.push(`${name} collides with banner`);
  }

  problems.push(...targetSizeProblems(m.buttons, m.minTouchPx));
  for (const f of m.fonts) {
    if (f.px < FONT_FLOOR_PX) problems.push(`${f.name} font-size ${f.px}px < ${FONT_FLOOR_PX}px`);
  }
  return problems;
}
