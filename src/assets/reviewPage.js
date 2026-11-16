// The candidate review page (layout C): one row per asset, today's art for
// comparison, then every candidate large AND at real in-game size on a map pad,
// so art that vanishes against the ground is visible while picking. Pure string
// rendering so Vitest can parse it; the page's own script holds the pick state.

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

const CSS = `
.rv{--bg:#0b1020;--panel:#141a2e;--line:#2a3350;--gold:#f0c060;--txt:#d8deea;--mut:#8a93ad;--warn:#ff8a6a;
  background:var(--bg);color:var(--txt);min-height:100vh;padding:12px 16px 40px;font:13px/1.35 system-ui,sans-serif}
.rv.light{--bg:#e9e4d8;--panel:#f6f2e8;--line:#c9c1ad;--txt:#222;--mut:#666;--warn:#b3401f}
body{margin:0}
.rv .bar{position:sticky;top:0;z-index:5;display:flex;gap:10px;align-items:center;padding:8px 0;margin-bottom:6px;
  background:var(--bg);color:var(--mut)}
.rv .bar b{color:var(--txt)} .rv .sp{flex:1}
.rv .btn{border:1px solid var(--line);background:var(--panel);color:var(--txt);padding:4px 10px;border-radius:4px;cursor:pointer;font:inherit}
.rv .btn.go{background:var(--gold);color:#111;border-color:var(--gold);font-weight:600}
.rv .btn.on{border-color:var(--gold);color:var(--gold)}
.rv .row{display:flex;gap:10px;align-items:flex-start;padding:10px 0;border-top:1px solid var(--line)}
.rv .lbl{width:130px;flex:0 0 130px;word-break:break-word}
.rv .lbl small{display:block;color:var(--mut)}
.rv .lbl .btn{margin-top:6px;font-size:12px}
.rv .cur{flex:0 0 auto;text-align:center;font-size:11px;color:var(--mut);min-width:64px}
.rv .cur .frame{overflow:hidden;margin:2px auto;border:1px dashed var(--line);border-radius:4px;opacity:.8}
.rv .cur .frame>div{transform-origin:0 0;background-repeat:no-repeat}
.rv .tiles{display:flex;flex-wrap:wrap;gap:8px}
.rv .c{position:relative;background:var(--panel);border:2px solid transparent;border-radius:6px;cursor:pointer;
  padding:4px 6px 6px;text-align:center}
.rv .c .n{position:absolute;top:2px;left:5px;font-size:11px;color:var(--mut)}
.rv .c.on{border-color:var(--gold);box-shadow:0 0 0 2px rgba(240,192,96,.25)}
.rv .c.on::after{content:'\\2605';position:absolute;top:0;right:5px;color:var(--gold)}
.rv .c img.big{display:block;margin:10px auto 0;width:160px;height:160px;object-fit:contain}
.rv .c.flipped img{transform:scaleX(-1)}
.rv .pad{position:relative;margin:6px auto 4px;border-radius:4px;overflow:hidden;background-position:center;
  display:flex;align-items:center;justify-content:center}
.rv .pad img{display:block;image-rendering:auto}
.rv .c .flip{font-size:11px;padding:1px 8px}
.rv .warn{color:var(--warn);font-size:11px;margin:2px 0}
.rv .none,.rv .empty{color:var(--mut);font-style:italic}
.rv .row.rr .tiles{opacity:.45}
`;

// Row data is rendered through escapeHtml; the page state is the only script input.
function renderCurrent(current) {
  if (!current) return '<div class="cur none">now<br>none yet</div>';
  const fw = current.frameWidth, fh = current.frameHeight;
  const k = Math.min(1, 80 / Math.max(fw, fh));
  return `<div class="cur">now<div class="frame" style="width:${Math.round(fw * k)}px;height:${Math.round(fh * k)}px">`
    + `<div style="width:${fw}px;height:${fh}px;transform:scale(${k});background-image:url('${escapeHtml(current.url)}')"></div></div></div>`;
}

function renderTile(row, c, padUrl) {
  const isSprite = row.kind === 'sprite';
  const big = c.cutUrl ?? c.rawUrl;
  const warnings = [];
  if (c.warning) warnings.push(c.warning);
  else if (isSprite && !c.cutUrl) warnings.push('no cutout: showing the raw render');
  const { width, height } = row.display;
  let body;
  if (isSprite && c.previewUrl) {
    const sw = Math.max(96, width + 32), sh = height + 20;
    body = `<img class="big" src="${escapeHtml(big)}" alt="">`
      + `<div class="pad" style="width:${sw}px;height:${sh}px;background-image:url('${escapeHtml(padUrl)}')">`
      + `<img class="game" src="${escapeHtml(c.previewUrl)}" width="${width}" height="${height}" alt=""></div>`;
  } else if (isSprite) {
    warnings.push('no game-size preview');
    body = `<img class="big" src="${escapeHtml(big)}" alt="">`;
  } else {
    body = `<img class="big" src="${escapeHtml(big)}" width="${width}" height="${height}" `
      + `style="width:${width}px;height:${height}px" alt="">`;
  }
  const warn = warnings.map((w) => `<div class="warn">${escapeHtml(w)}</div>`).join('');
  const flip = isSprite ? '<button type="button" class="btn flip">Flip</button>' : '';
  return `<div class="c" data-index="${c.index}"><span class="n">${c.index}</span>${body}${warn}${flip}</div>`;
}

function renderRow(row, padUrl) {
  const tiles = row.candidates.length
    ? `<div class="tiles">${row.candidates.map((c) => renderTile(row, c, padUrl)).join('')}</div>`
    : '<div class="empty">no candidates yet</div>';
  return `<div class="row" data-asset="${escapeHtml(row.assetId)}">`
    + `<div class="lbl">${escapeHtml(row.label ?? row.assetId)}<small>${escapeHtml(row.kind)}${row.mode ? ` · ${escapeHtml(row.mode)}` : ''}</small>`
    + `<button type="button" class="btn reroll">None — reroll</button></div>`
    + renderCurrent(row.current) + tiles + '</div>';
}

// Runs in the page. State: picks {assetId: index}, flip {"assetId/index": true},
// reroll {assetId: true}. Storage is best-effort: it can throw (private windows).
const SCRIPT = `
(function () {
  var batch = JSON.parse(document.getElementById('batch-data').textContent);
  var key = 'art-review:' + batch;
  var root = document.querySelector('.rv');
  var state = { picks: {}, flip: {}, reroll: {}, light: false };
  try {
    var saved = JSON.parse(localStorage.getItem(key) || 'null');
    if (saved && typeof saved === 'object') {
      state.picks = saved.picks || {}; state.flip = saved.flip || {};
      state.reroll = saved.reroll || {}; state.light = !!saved.light;
    }
  } catch (e) {}
  function save() { try { localStorage.setItem(key, JSON.stringify(state)); } catch (e) {} }
  function render() {
    var rows = document.querySelectorAll('.row'), n = 0, r = 0;
    rows.forEach(function (row) {
      var id = row.getAttribute('data-asset');
      var picked = state.picks[id];
      if (picked !== undefined) n++;
      if (state.reroll[id]) r++;
      row.classList.toggle('rr', !!state.reroll[id]);
      row.querySelector('.reroll').classList.toggle('on', !!state.reroll[id]);
      row.querySelectorAll('.c').forEach(function (c) {
        var i = c.getAttribute('data-index');
        c.classList.toggle('on', String(picked) === i);
        c.classList.toggle('flipped', !!state.flip[id + '/' + i]);
        var f = c.querySelector('.flip');
        if (f) f.classList.toggle('on', !!state.flip[id + '/' + i]);
      });
    });
    document.getElementById('count').textContent = n + ' / ' + rows.length + ' picked' + (r ? ' \\u00b7 ' + r + ' reroll' : '');
    root.classList.toggle('light', state.light);
  }
  document.addEventListener('click', function (e) {
    var t = e.target.closest ? e.target : e.target.parentElement;
    var row = t.closest('.row');
    if (t.closest('#tone')) { state.light = !state.light; }
    else if (t.closest('#download')) { download(); return; }
    else if (row && t.closest('.reroll')) {
      var rid = row.getAttribute('data-asset');
      if (state.reroll[rid]) delete state.reroll[rid]; else { state.reroll[rid] = true; delete state.picks[rid]; }
    } else if (row && t.closest('.flip')) {
      var fc = t.closest('.c'), fk = row.getAttribute('data-asset') + '/' + fc.getAttribute('data-index');
      if (state.flip[fk]) delete state.flip[fk]; else state.flip[fk] = true;
    } else if (row && t.closest('.c')) {
      var id = row.getAttribute('data-asset'), idx = Number(t.closest('.c').getAttribute('data-index'));
      if (state.picks[id] === idx) delete state.picks[id]; else { state.picks[id] = idx; delete state.reroll[id]; }
    } else return;
    save(); render();
  });
  function download() {
    // flip lists only assets whose PICKED candidate is flipped; other flips are UI-only.
    var picks = state.picks;
    var out = {
      batch: batch, picks: picks,
      flip: Object.keys(picks).filter(function (id) { return state.flip[id + '/' + picks[id]]; }),
      reroll: Object.keys(state.reroll)
    };
    var url = URL.createObjectURL(new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' }));
    var a = document.createElement('a');
    a.href = url; a.download = 'picks.json';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }
  render();
})();
`;

export function renderReviewPage({ job, rows, padUrl }) {
  const batch = job.batch;
  const data = JSON.stringify(batch).replace(/</g, '\\u003c');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Art review: ${escapeHtml(batch)}</title><style>${CSS}</style></head>
<body><div class="rv">
<div class="bar"><b>Batch: ${escapeHtml(batch)}</b><span id="count"></span><span class="sp"></span>
<button type="button" class="btn" id="tone">Dark / Light</button>
<button type="button" class="btn go" id="download">Download picks.json</button></div>
${rows.map((r) => renderRow(r, padUrl)).join('\n')}
</div>
<script type="application/json" id="batch-data">${data}</script>
<script>${SCRIPT}</script>
</body></html>
`;
}
