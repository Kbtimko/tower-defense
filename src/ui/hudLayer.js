import { CANVAS_WIDTH, WORLD_WIDTH, WORLD_HEIGHT, RAIL_WIDTH, HUD_CELL, HUD_K } from '../data/layout.js';
import { PEEK_GAP_PX } from '../data/input.js';
import { radialMetrics } from '../systems/radialLayout.js';

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

// The map viewport (canvas minus a rail each side) in #game-local CSS px. With
// no canvas yet it falls back to the whole #game box.
export function mapRectIn({ gameRect, canvasRect }) {
  if (!canvasRect) return { left: 0, top: 0, width: gameRect.width, height: gameRect.height };
  const scale = canvasRect.width / CANVAS_WIDTH;
  return {
    left: canvasRect.left - gameRect.left + RAIL_WIDTH * scale,
    top: canvasRect.top - gameRect.top,
    width: WORLD_WIDTH * scale,
    height: WORLD_HEIGHT * scale,
  };
}

// Page-coordinate bounds a floating body-level card may occupy: the MAP, so a
// card near the right edge never covers a rail button (it is z40+ and would
// swallow the tap). No #game (bare DOM) falls back to the window.
export function mapRectPage(doc) {
  const gameEl = doc.getElementById('game');
  if (!gameEl) {
    return { left: 0, top: 0, width: window.innerWidth || 1024, height: window.innerHeight || 768 };
  }
  const gameRect = gameEl.getBoundingClientRect();
  // Direct child only: #map-select inside #game holds the world map's own canvases.
  const canvas = doc.querySelector('#game > canvas');
  const map = mapRectIn({ gameRect, canvasRect: canvas?.getBoundingClientRect() ?? null });
  return { ...map, left: map.left + gameRect.left, top: map.top + gameRect.top };
}

// Also publishes the map rect on #game, so DOM anchored to #game (toast,
// banners) can sit over the map instead of the rails/letterbox.
export function fitHudLayer(doc, game) {
  const layer = doc.getElementById('hud-layer');
  const gameEl = doc.getElementById('game');
  if (!layer || !gameEl || !game?.canvas) return;
  const canvasRect = game.canvas.getBoundingClientRect();
  const gameRect = gameEl.getBoundingClientRect();
  const { left, top, scale } = hudLayerTransform({ canvasRect, gameRect, canvasWidth: CANVAS_WIDTH });
  layer.style.transform = `translate(${left}px, ${top}px) scale(${scale})`;
  const map = mapRectIn({ gameRect, canvasRect });
  gameEl.style.setProperty('--map-left', `${map.left}px`);
  gameEl.style.setProperty('--map-top', `${map.top}px`);
  gameEl.style.setProperty('--map-width', `${map.width}px`);
  gameEl.style.setProperty('--map-height', `${map.height}px`);
}

// The rail CSS sizes itself from these, so layout.js stays the one source.
export function applyHudLayerSize(doc) {
  const s = doc.documentElement.style;
  s.setProperty('--canvas-w', `${CANVAS_WIDTH}px`);
  s.setProperty('--world-h', `${WORLD_HEIGHT}px`);
  s.setProperty('--rail-w', `${RAIL_WIDTH}px`);
  s.setProperty('--hud-cell', `${HUD_CELL}px`);
  s.setProperty('--hud-k', String(HUD_K));
  s.setProperty('--peek-gap', `${PEEK_GAP_PX}px`);
  const radial = radialMetrics(HUD_CELL);
  s.setProperty('--radial-item', `${radial.item}px`);
  s.setProperty('--radial-hub', `${radial.hub}px`);
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
