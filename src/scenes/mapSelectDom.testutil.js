// Test helper: mounts index.html's real <body> markup (minus scripts) so the
// MapSelectScene tests run against the ids, classes and nesting the page ships,
// not a hand-built copy that can drift from it.
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Path-based: Vite rewrites `new URL(…, import.meta.url)` in non-test modules.
const html = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../../index.html'), 'utf8');
const body = new DOMParser().parseFromString(html, 'text/html').body;
for (const s of body.querySelectorAll('script')) s.remove();
const BODY_HTML = body.innerHTML;

export function mountMapSelectDom() {
  document.body.innerHTML = BODY_HTML;
}

// A scene wired like Phaser would: `once('shutdown')` handlers run on emitShutdown().
export function wireScene(scene, registry = new Map()) {
  const onceHandlers = [];
  scene.events = { once: (evt, fn, ctx) => onceHandlers.push({ evt, fn, ctx }), on() {} };
  scene.game = { registry };
  scene.scene = { start: () => {} };
  scene.emitShutdown = () => {
    for (const h of onceHandlers.splice(0).filter((h) => h.evt === 'shutdown')) h.fn.call(h.ctx);
  };
  return scene;
}

// v4 save envelope with the given per-map stars.
export function seedSave(maps, extra = {}) {
  localStorage.setItem('lastlight_save', JSON.stringify({
    version: 4,
    maps,
    upgrades: [],
    stats: { kills: 0, gamesPlayed: 0, victories: 0, defeats: 0, bestWave: 0 },
    settings: { masterVol: 0, sfxVol: 0, musicVol: 0, muted: true, ambientMotion: null },
    selectedHeroId: 'rael',
    seenStoryBeats: { campaign_intro: true },
    ...extra,
  }));
}
