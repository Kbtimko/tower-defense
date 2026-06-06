// Visual style per map ID. Each style is rendered the same way (disc +
// border + accent), only the palette differs — keeps the renderer small.
const STYLE_BY_MAP = {
  0: 'rocky_outcrop',
  1: 'rocky_outcrop',
  2: 'rocky_outcrop',
  5: 'rocky_outcrop',
  3: 'metal_grille',
  6: 'metal_grille',
  4: 'debris_pad',
  7: 'debris_pad',
  8: 'organic_disc',
  9: 'scorched_pad',
};

const PALETTES = {
  rocky_outcrop: { fill: 0x3a3540, edge: 0x6a6470, accent: 0xc0a070 },
  metal_grille:  { fill: 0x2a3040, edge: 0x6a8aaa, accent: 0x66ccff },
  debris_pad:    { fill: 0x2a2520, edge: 0x6a5040, accent: 0xffaa44 },
  organic_disc:  { fill: 0x0a2a30, edge: 0x00ffc8, accent: 0xffaaff },
  scorched_pad:  { fill: 0x3a0a08, edge: 0xff5522, accent: 0xffcc55 },
};

export function PLATFORM_STYLE_FOR_MAP(mapId) {
  return STYLE_BY_MAP[mapId] ?? 'rocky_outcrop';
}

/**
 * Render every tower slot as a theme-styled disc. Empty slots get a
 * small accent-tinted "+" mark; occupied slots draw only the base disc
 * (the tower entity renders on top).
 *
 * @param {Phaser.GameObjects.Graphics} gfx
 * @param {{cx:number,cy:number,radius:number,occupied:boolean}[]} slots
 * @param {number} mapId
 */
export function renderPlatforms(gfx, slots, mapId) {
  if (!slots || slots.length === 0) return;
  const style = PLATFORM_STYLE_FOR_MAP(mapId);
  const pal = PALETTES[style];

  for (const slot of slots) {
    const r = slot.radius;
    // Outer shadow
    gfx.fillStyle(0x000000, 0.45);
    gfx.fillCircle(slot.cx + 1, slot.cy + 2, r + 1);
    // Base disc
    gfx.fillStyle(pal.fill, 1);
    gfx.fillCircle(slot.cx, slot.cy, r);
    // Edge ring
    gfx.lineStyle(2, pal.edge, 1);
    gfx.strokeCircle(slot.cx, slot.cy, r);

    if (!slot.occupied) {
      // Plus glyph: two crossed lines
      gfx.lineStyle(2.5, pal.accent, 1);
      gfx.lineBetween(slot.cx - r * 0.4, slot.cy, slot.cx + r * 0.4, slot.cy);
      gfx.lineBetween(slot.cx, slot.cy - r * 0.4, slot.cx, slot.cy + r * 0.4);
    }
  }
}
