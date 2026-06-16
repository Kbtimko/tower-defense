// Visual style per map ID. Each palette carries a `kind` that selects how a
// build pad is drawn: 'emplacement' (sandbagged gun position, for planet/rocky
// terrain) or 'disc' (themed platform disc, for the other environments).
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
  // Sandbagged emplacement: cleared packed-earth pad ringed by sandbags.
  rocky_outcrop: { kind: 'emplacement', pad: 0x7a5c3a, padEdge: 0x4a3824, bag: 0xc9ad7e, bagSeam: 0x4a3a24, marker: 0xefdcab },
  // Themed discs for the non-terrain environments.
  metal_grille:  { kind: 'disc', fill: 0x2a3040, edge: 0x6a8aaa, accent: 0x66ccff },
  debris_pad:    { kind: 'disc', fill: 0x2a2520, edge: 0x6a5040, accent: 0xffaa44 },
  organic_disc:  { kind: 'disc', fill: 0x0a2a30, edge: 0x00ffc8, accent: 0xffaaff },
  scorched_pad:  { kind: 'disc', fill: 0x3a0a08, edge: 0xff5522, accent: 0xffcc55 },
};

const TWO_PI = Math.PI * 2;

export function PLATFORM_STYLE_FOR_MAP(mapId) {
  return STYLE_BY_MAP[mapId] ?? 'rocky_outcrop';
}

/**
 * Render every tower slot as a theme-styled build pad. Empty slots get a
 * centered "+" build marker; occupied slots omit it (the tower renders on top).
 *
 * @param {Phaser.GameObjects.Graphics} gfx
 * @param {{cx:number,cy:number,radius:number,occupied:boolean}[]} slots
 * @param {number} mapId
 */
export function renderPlatforms(gfx, slots, mapId) {
  if (!slots || slots.length === 0) return;
  const pal = PALETTES[PLATFORM_STYLE_FOR_MAP(mapId)];

  for (const slot of slots) {
    if (pal.kind === 'emplacement') {
      drawEmplacementPad(gfx, slot, pal);
    } else {
      drawDiscPad(gfx, slot, pal);
    }
  }
}

// Sandbagged gun emplacement: a cleared packed-earth pad ringed by sandbags.
// Reads as a fortified build position and clearly marks the buildable set on
// open terrain, while the warm palette keeps it sitting in the desert.
function drawEmplacementPad(gfx, slot, pal) {
  const { cx, cy, radius: r } = slot;
  // Drop shadow
  gfx.fillStyle(0x000000, 0.40);
  gfx.fillCircle(cx + 1, cy + 2, r + 2);
  // Cleared packed-earth pad
  gfx.fillStyle(pal.pad, 1);
  gfx.fillCircle(cx, cy, r * 0.82);
  gfx.lineStyle(1.5, pal.padEdge, 0.8);
  gfx.strokeCircle(cx, cy, r * 0.80);
  // Sandbag ring around the rim
  const bags = 11;
  const br = r * 0.30;
  for (let i = 0; i < bags; i++) {
    const a = (i / bags) * TWO_PI;
    const bx = cx + Math.cos(a) * r;
    const by = cy + Math.sin(a) * r;
    gfx.fillStyle(pal.bagSeam, 1);
    gfx.fillCircle(bx, by, br + 1.2);
    gfx.fillStyle(pal.bag, 1);
    gfx.fillCircle(bx, by, br);
  }
  // Build marker (empty slots only)
  if (!slot.occupied) {
    gfx.lineStyle(3, pal.marker, 1);
    gfx.lineBetween(cx - r * 0.32, cy, cx + r * 0.32, cy);
    gfx.lineBetween(cx, cy - r * 0.32, cx, cy + r * 0.32);
  }
}

// Themed platform disc: disc + border + centered "+" accent when empty.
function drawDiscPad(gfx, slot, pal) {
  const { cx, cy, radius: r } = slot;
  // Outer shadow
  gfx.fillStyle(0x000000, 0.45);
  gfx.fillCircle(cx + 1, cy + 2, r + 1);
  // Base disc
  gfx.fillStyle(pal.fill, 1);
  gfx.fillCircle(cx, cy, r);
  // Edge ring
  gfx.lineStyle(2, pal.edge, 1);
  gfx.strokeCircle(cx, cy, r);

  if (!slot.occupied) {
    // Plus glyph: two crossed lines
    gfx.lineStyle(2.5, pal.accent, 1);
    gfx.lineBetween(cx - r * 0.4, cy, cx + r * 0.4, cy);
    gfx.lineBetween(cx, cy - r * 0.4, cx, cy + r * 0.4);
  }
}
