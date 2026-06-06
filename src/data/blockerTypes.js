// Procedural blocker shapes. Each `draw` paints into a Phaser Graphics
// at (x, y) with a uniform `scale` (1.0 = ~80px diameter footprint).
// `tint` is the primary fill color; `defaultTint(mapId)` lets the per-map
// theme override if a blocker is used across themes.

const PALETTE = {
  // Lunar / planetary greys
  rock_grey:   { fill: 0x3a3540, stroke: 0x7a7480 },
  rock_warm:   { fill: 0x4a3a25, stroke: 0x8a6a45 },
  rock_pale:   { fill: 0x6a6470, stroke: 0xa0a0a8 },
  // Ship metals
  metal:       { fill: 0x3a4050, stroke: 0x5a6070 },
  metal_red:   { fill: 0x40262c, stroke: 0xaa3333 },
  // Asteroid browns
  asteroid_w:  { fill: 0x6a5a45, stroke: 0x9a8a65 },
  asteroid_d:  { fill: 0x2e251c, stroke: 0x5a4a35 },
  // Alien organics
  organic_teal:    { fill: 0x0a4a40, stroke: 0x00ffc8 },
  organic_magenta: { fill: 0x4a0a35, stroke: 0xff44aa },
  // Last light embers
  ember:       { fill: 0x6a1a08, stroke: 0xff7733 },
};

function fillCircle(gfx, x, y, r, color) { gfx.fillStyle(color, 1); gfx.fillCircle(x, y, r); }
function strokeCircle(gfx, x, y, r, color, w = 1) { gfx.lineStyle(w, color, 1); gfx.strokeCircle(x, y, r); }

export const BLOCKER_TYPES = {
  // ===== Crater: dark inner disc + light rim =====
  crater: {
    draw(gfx, x, y, scale, tint) {
      const r = 38 * scale;
      const p = PALETTE[tint] ?? PALETTE.rock_grey;
      fillCircle(gfx, x, y, r, p.fill);
      strokeCircle(gfx, x, y, r, p.stroke, 2);
      // shadow pool
      gfx.fillStyle(0x000000, 0.5);
      gfx.fillCircle(x - r * 0.15, y + r * 0.15, r * 0.55);
    },
    defaultTint(mapId) {
      return mapId === 0 ? 'rock_warm' : 'rock_grey';
    },
  },

  // ===== Rocks: irregular cluster (3 overlapping discs) =====
  rocks: {
    draw(gfx, x, y, scale, tint) {
      const r = 22 * scale;
      const p = PALETTE[tint] ?? PALETTE.rock_grey;
      gfx.fillStyle(p.fill, 1);
      gfx.fillCircle(x - r * 0.6, y + r * 0.2, r);
      gfx.fillCircle(x + r * 0.5, y + r * 0.3, r * 0.85);
      gfx.fillCircle(x, y - r * 0.5, r * 0.9);
      gfx.lineStyle(1, p.stroke, 1);
      gfx.strokeCircle(x - r * 0.6, y + r * 0.2, r);
      gfx.strokeCircle(x + r * 0.5, y + r * 0.3, r * 0.85);
      gfx.strokeCircle(x, y - r * 0.5, r * 0.9);
    },
    defaultTint(mapId) {
      if (mapId === 5) return 'rock_warm';
      if (mapId === 9) return 'ember';
      return 'rock_grey';
    },
  },

  // ===== Metal bulkhead: rectangle with rivets =====
  metal_bulkhead: {
    draw(gfx, x, y, scale, tint) {
      const w = 70 * scale, h = 36 * scale;
      const p = PALETTE[tint] ?? PALETTE.metal;
      gfx.fillStyle(p.fill, 1);
      gfx.fillRect(x - w / 2, y - h / 2, w, h);
      gfx.lineStyle(1.5, p.stroke, 1);
      gfx.strokeRect(x - w / 2, y - h / 2, w, h);
      // 6 rivets
      gfx.fillStyle(p.stroke, 1);
      for (let i = 0; i < 3; i++) {
        const rx = x - w / 2 + 8 + i * ((w - 16) / 2);
        gfx.fillCircle(rx, y - h / 2 + 5, 1.5);
        gfx.fillCircle(rx, y + h / 2 - 5, 1.5);
      }
      // status light
      gfx.fillStyle(0x44ff44, 1);
      gfx.fillCircle(x + w * 0.30, y, 2);
    },
    defaultTint(mapId) {
      return mapId === 6 ? 'metal_red' : 'metal';
    },
  },

  // ===== Asteroid: pseudo-organic blob via 6-point polygon =====
  asteroid: {
    draw(gfx, x, y, scale, tint) {
      const r = 28 * scale;
      const p = PALETTE[tint] ?? PALETTE.asteroid_w;
      const verts = [
        [r * 0.95, -r * 0.35], [r * 0.55,  r * 0.75], [-r * 0.15,  r * 0.95],
        [-r * 0.85,  r * 0.25], [-r * 0.65, -r * 0.55], [r * 0.10, -r * 0.85],
      ];
      gfx.fillStyle(p.fill, 1);
      gfx.beginPath();
      gfx.moveTo(x + verts[0][0], y + verts[0][1]);
      for (let i = 1; i < verts.length; i++) gfx.lineTo(x + verts[i][0], y + verts[i][1]);
      gfx.closePath();
      gfx.fillPath();
      gfx.lineStyle(1, p.stroke, 1);
      gfx.strokePath();
      // shadow side
      gfx.fillStyle(0x000000, 0.35);
      gfx.fillCircle(x - r * 0.3, y + r * 0.3, r * 0.55);
    },
    defaultTint(mapId) {
      return mapId === 7 ? 'asteroid_d' : 'asteroid_w';
    },
  },

  // ===== Organic spire: tall narrow triangle with glowing tip =====
  organic_spire: {
    draw(gfx, x, y, scale, tint) {
      const h = 60 * scale, w = 18 * scale;
      const p = PALETTE[tint] ?? PALETTE.organic_teal;
      gfx.fillStyle(p.fill, 1);
      gfx.beginPath();
      gfx.moveTo(x - w / 2, y + h / 2);
      gfx.lineTo(x + w / 2, y + h / 2);
      gfx.lineTo(x, y - h / 2);
      gfx.closePath();
      gfx.fillPath();
      gfx.lineStyle(1, p.stroke, 1);
      gfx.strokePath();
      // glowing tip
      gfx.fillStyle(p.stroke, 0.9);
      gfx.fillCircle(x, y - h / 2, 3);
    },
    defaultTint(mapId) {
      if (mapId === 8) return 'organic_magenta';
      return 'organic_teal';
    },
  },

  // ===== Glowing pool: filled circle with halo =====
  glowing_pool: {
    draw(gfx, x, y, scale, tint) {
      const r = 26 * scale;
      const p = PALETTE[tint] ?? PALETTE.organic_teal;
      // halo
      gfx.fillStyle(p.stroke, 0.25);
      gfx.fillCircle(x, y, r * 1.6);
      gfx.fillStyle(p.stroke, 0.4);
      gfx.fillCircle(x, y, r * 1.2);
      // pool
      gfx.fillStyle(p.fill, 1);
      gfx.fillCircle(x, y, r);
      gfx.lineStyle(2, p.stroke, 1);
      gfx.strokeCircle(x, y, r);
    },
    defaultTint(mapId) {
      return mapId === 9 ? 'ember' : 'organic_teal';
    },
  },
};
