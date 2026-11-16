// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { JSDOM } from 'jsdom';
import { renderReviewPage } from './reviewPage.js';

const sprite = (assetId, cands, extra = {}) => ({
  assetId, kind: 'sprite', label: assetId, mode: 'fake',
  current: { url: `../x/${assetId}.png`, frameWidth: 64, frameHeight: 64 },
  display: { width: 55, height: 55 }, candidates: cands, ...extra,
});
const cand = (index, extra = {}) => ({
  index, rawUrl: `r${index}.png`, cutUrl: `r${index}.cut.png`, previewUrl: `r${index}.preview.png`, ...extra,
});
const rows = [
  sprite('tower_cannon', [cand(1), cand(2), cand(3, { cutUrl: undefined })]),
  sprite('tower_mage', [], { current: null }),
  { assetId: 'overworld_1', kind: 'overworld', label: 'overworld_1', mode: 'txt2img', current: null,
    display: { width: 160, height: 160 }, candidates: [{ index: 0, rawUrl: 'o0.png' }] },
];
const html = () => renderReviewPage({ job: { batch: 'b<1>' }, rows, padUrl: 'pad.jpg' });
const doc = () => new JSDOM(html()).window.document;

function load({ storage, html: h = html() } = {}) {
  const captured = [];
  const dom = new JSDOM(h, {
    runScripts: 'dangerously', url: 'http://localhost/',
    beforeParse(w) {
      w.URL.createObjectURL = (b) => { captured.push(b); return 'blob:x'; };
      w.URL.revokeObjectURL = () => {};
      w.HTMLAnchorElement.prototype.click = function () {};
      if (storage) Object.defineProperty(w, 'localStorage', { get: storage });
    },
  });
  const w = dom.window;
  const click = (sel) => w.document.querySelector(sel).dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  const download = () => new Promise((res) => {
    click('#download');
    const fr = new w.FileReader();
    fr.onload = () => res(JSON.parse(fr.result));
    fr.readAsText(captured.at(-1));
  });
  return { w, click, download, dom };
}

describe('renderReviewPage markup', () => {
  it('one .row per asset with data-asset, and a tile per candidate', () => {
    const d = doc();
    expect([...d.querySelectorAll('.row')].map((r) => r.dataset.asset))
      .toEqual(['tower_cannon', 'tower_mage', 'overworld_1']);
    expect(d.querySelectorAll('[data-asset="tower_cannon"] .c')).toHaveLength(3);
  });
  it('missing cut shows the raw image with a visible warning', () => {
    const t = doc().querySelector('[data-asset="tower_cannon"] .c[data-index="3"]');
    expect(t.querySelector('img.big').getAttribute('src')).toBe('r3.png');
    expect(t.querySelector('.warn').textContent).toMatch(/cutout/);
  });
  it('zero candidates says no candidates yet; no current says none yet', () => {
    const r = doc().querySelector('[data-asset="tower_mage"]');
    expect(r.textContent).toContain('no candidates yet');
    expect(r.textContent).toContain('none yet');
  });
  it('game-size img width equals display.width, on the pad', () => {
    const t = doc().querySelector('[data-asset="tower_cannon"] .c[data-index="1"]');
    expect(t.querySelector('.pad img.game').getAttribute('width')).toBe('55');
    expect(t.querySelector('.pad').getAttribute('style')).toContain('pad.jpg');
  });
  it('overworld rows have no strip and no Flip, image at display size', () => {
    const t = doc().querySelector('[data-asset="overworld_1"] .c');
    expect(t.querySelector('.pad')).toBeNull();
    expect(t.querySelector('.flip')).toBeNull();
    expect(t.querySelector('img.big').getAttribute('width')).toBe('160');
  });
  it('escapes batch and labels', () => {
    const h = renderReviewPage({ job: { batch: '<b>' },
      rows: [sprite('<i>x</i>', [])], padUrl: 'p' });
    expect(h).not.toContain('<i>x</i>');
    expect(h).toContain('&lt;i&gt;x&lt;/i&gt;');
  });
});

describe('review page script', () => {
  it('picking tile 2 then Download yields the picks JSON', async () => {
    const p = load();
    p.click('[data-asset="tower_cannon"] .c[data-index="2"]');
    expect(await p.download()).toEqual({ batch: 'b<1>', picks: { tower_cannon: 2 }, flip: [], reroll: [] });
    expect(p.w.document.getElementById('count').textContent).toContain('1 / 3 picked');
  });
  it('reroll removes the pick, and picking clears the reroll', async () => {
    const p = load();
    p.click('[data-asset="tower_cannon"] .c[data-index="2"]');
    p.click('[data-asset="tower_cannon"] .reroll');
    const out = await p.download();
    expect(out.picks).toEqual({});
    expect(out.reroll).toEqual(['tower_cannon']);
    p.click('[data-asset="tower_cannon"] .c[data-index="1"]');
    expect(await p.download()).toEqual({ batch: 'b<1>', picks: { tower_cannon: 1 }, flip: [], reroll: [] });
  });
  it('flip is listed only when the picked candidate is flipped', async () => {
    const p = load();
    p.click('[data-asset="tower_cannon"] .c[data-index="1"] .flip');
    p.click('[data-asset="tower_cannon"] .c[data-index="2"]');
    expect((await p.download()).flip).toEqual([]);
    p.click('[data-asset="tower_cannon"] .c[data-index="1"]');
    expect((await p.download()).flip).toEqual(['tower_cannon']);
    expect(p.w.document.querySelector('.c[data-index="1"]').classList.contains('flipped')).toBe(true);
  });
  it('state survives a re-render with the same localStorage', async () => {
    const a = load();
    a.click('[data-asset="tower_cannon"] .c[data-index="2"]');
    const saved = a.w.localStorage.getItem('art-review:b<1>');
    expect(saved).toBeTruthy();
    const store = { 'art-review:b<1>': saved };
    const b = load({ storage: () => ({ getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = v; } }) });
    expect(await b.download()).toMatchObject({ picks: { tower_cannon: 2 } });
  });
  it('a throwing localStorage still lets picking work', async () => {
    const p = load({ storage: () => { throw new Error('denied'); } });
    p.click('[data-asset="tower_cannon"] .c[data-index="3"]');
    expect(await p.download()).toMatchObject({ picks: { tower_cannon: 3 } });
  });
});
