import { CANVAS_WIDTH, WORLD_HEIGHT, RAIL_WIDTH, HUD_CELL } from '../data/layout.js';

// The HUD is DOM laid out in game px (CANVAS_WIDTH x WORLD_HEIGHT) and pinned
// over the canvas with the same FIT factor, so one transform keeps every rail
// control exactly over its canvas rail at any window size.
export function hudLayerTransform({ canvasRect, gameRect, canvasWidth }) {
  return {
    left: canvasRect.left - gameRect.left,
    top: canvasRect.top - gameRect.top,
    scale: canvasRect.width / canvasWidth,
  };
}

export function fitHudLayer(doc, game) {
  const layer = doc.getElementById('hud-layer');
  const gameEl = doc.getElementById('game');
  if (!layer || !gameEl || !game?.canvas) return;
  const { left, top, scale } = hudLayerTransform({
    canvasRect: game.canvas.getBoundingClientRect(),
    gameRect: gameEl.getBoundingClientRect(),
    canvasWidth: CANVAS_WIDTH,
  });
  layer.style.transform = `translate(${left}px, ${top}px) scale(${scale})`;
}

// The rail CSS sizes itself from these, so layout.js stays the one source.
export function applyHudLayerSize(doc) {
  const s = doc.documentElement.style;
  s.setProperty('--canvas-w', `${CANVAS_WIDTH}px`);
  s.setProperty('--world-h', `${WORLD_HEIGHT}px`);
  s.setProperty('--rail-w', `${RAIL_WIDTH}px`);
  s.setProperty('--hud-cell', `${HUD_CELL}px`);
}

// Where a peek card should anchor for a rail control: the control's rows, the
// whole rail's columns, so a card opening over the map never covers the
// neighbouring column of the same rail.
export function railAnchorRect(el) {
  const r = el.getBoundingClientRect();
  const rail = el.closest('.hud-rail');
  if (!rail) return { left: r.left, top: r.top, width: r.width, height: r.height };
  const rr = rail.getBoundingClientRect();
  return { left: rr.left, top: r.top, width: rr.width, height: r.height };
}
