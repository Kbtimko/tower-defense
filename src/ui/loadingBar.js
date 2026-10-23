// Boot progress, drawn on the canvas so it scales with FIT like the game.
// Colours follow docs/art-bible.md (panel navy, cyan-teal accent).

import { FONTS, PALETTE } from '../data/theme.js';
import { hexToInt } from './theme.js';

export function loadingLabel(progress) {
  const p = Number.isFinite(progress) ? Math.max(0, Math.min(1, progress)) : 0;
  return `Loading ${Math.round(p * 100)}%`;
}

const BAR_W = 420;
const BAR_H = 10;

export function attachLoadingBar(scene) {
  const { width, height } = scene.scale;
  const x = (width - BAR_W) / 2;
  const y = height / 2;
  const gfx = scene.add.graphics();
  const label = scene.add.text(width / 2, y - 22, loadingLabel(0), {
    fontFamily: FONTS.body, fontSize: '16px', color: PALETTE.accent,
  }).setOrigin(0.5);

  const draw = (p) => {
    gfx.clear();
    gfx.fillStyle(hexToInt(PALETTE.panel), 1).fillRect(x, y, BAR_W, BAR_H);
    gfx.lineStyle(1, hexToInt(PALETTE.panelEdge), 1).strokeRect(x, y, BAR_W, BAR_H);
    gfx.fillStyle(hexToInt(PALETTE.accent), 1).fillRect(x, y, BAR_W * Math.max(0, Math.min(1, p)), BAR_H);
    label.setText(loadingLabel(p));
  };
  draw(0);
  scene.load.on('progress', draw);
  scene.load.once('complete', () => {
    scene.load.off('progress', draw);
    gfx.destroy();
    label.destroy();
  });
}
