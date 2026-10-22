// Shrink-to-fit for the HUD rail labels. The rail CSS sizes text in game px for
// the bundled condensed stack; a device without any of those fonts falls back
// to a wider face, and an unbreakable word ("Barracks", "Resume") would spill
// out of its 88-px cell. Text width scales linearly with font size, so one
// measurement gives the size that fits. Never clips; the label only shrinks.

const SPAN_LABELS = '.hud-rail button > span, .hud-stat > span';
const LABEL = `${SPAN_LABELS}, .hud-rail button`;

export function fittedFontPx({ fontPx, naturalWidth, available }) {
  if (naturalWidth <= available) return fontPx;
  return Math.floor(((fontPx * available) / naturalWidth) * 4) / 4;
}

const computedFontPx = el => parseFloat(getComputedStyle(el).fontSize);

const horizontalPadding = el => {
  const cs = getComputedStyle(el);
  return (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
};

// The text's own width in the button's untransformed px. scrollWidth cannot do
// this once the button has horizontal padding: a centred label that fits the
// padding box but not the padded content box overflows nothing it can see, so
// it would touch the ring the padding exists to clear.
export function textWidthOf(el) {
  const range = document.createRange();
  range.selectNodeContents(el);
  const shown = el.getBoundingClientRect().width;
  if (!shown) return 0;
  return (range.getBoundingClientRect().width * el.offsetWidth) / shown;
}

// A plain-text button is measured by its text width against its padded content
// box; a span
// label by its own box against its button / stat cell. Offsets ignore the HUD
// layer's transform, so this works in game px.
// Text is only nearly linear (an emoji glyph, hinting), so a pass that lands a
// hair wide re-measures; a few passes always converge.
const MAX_PASSES = 4;

export function fitLabels(els, { baseFontPx = computedFontPx, measureText = textWidthOf } = {}) {
  for (const el of els) el.style.removeProperty('font-size');
  for (const el of els) {
    const plain = el.tagName === 'BUTTON';
    let fontPx = baseFontPx(el);
    for (let pass = 0; pass < MAX_PASSES; pass++) {
      const naturalWidth = plain ? measureText(el) : el.offsetWidth;
      const available = plain ? el.clientWidth - horizontalPadding(el) : el.parentElement.clientWidth;
      const px = fittedFontPx({ fontPx, naturalWidth, available });
      if (px === fontPx) break;
      fontPx = px;
      el.style.fontSize = `${px}px`;
    }
  }
}

export function railLabels(root) {
  const plainButtons = [...root.querySelectorAll('.hud-rail button')].filter(b => !b.firstElementChild);
  return [...plainButtons, ...root.querySelectorAll(SPAN_LABELS)];
}

// Page lifetime (main.js). Refits everything when the layer is shown, refitted
// or fonts finish loading; otherwise only the labels whose text or [hidden]
// changed (a hidden label measures 0 and is fitted when Cancel appears; the
// pause/speed/wave buttons relabel, the stats tick on every kill).
export function watchRailLabels(doc) {
  const layer = doc.getElementById('hud-layer');
  if (!layer) return;
  let all = false;
  const changed = new Set();
  let queued = false;
  const flush = () => {
    queued = false;
    fitLabels(all ? railLabels(layer) : [...changed].filter(el => el.isConnected));
    all = false;
    changed.clear();
  };
  const schedule = () => { if (!queued) { queued = true; requestAnimationFrame(flush); } };
  const refitAll = () => { all = true; schedule(); };
  new MutationObserver((records) => {
    for (const r of records) {
      const node = r.target.nodeType === Node.ELEMENT_NODE ? r.target : r.target.parentElement;
      const el = node?.closest(LABEL);
      if (el) changed.add(el);
    }
    schedule();
  }).observe(layer, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['hidden'] });
  new MutationObserver(refitAll).observe(layer, { attributes: true, attributeFilter: ['style'] });
  doc.fonts?.ready.then(refitAll);
}
