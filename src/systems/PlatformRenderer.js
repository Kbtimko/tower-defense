// Visual style per map ID. Every theme renders its tower slots as a "ringed
// emplacement" — a cleared platform ringed by themed studs with a build marker
// — so the buildable set reads clearly on open terrain. Only the palette differs.
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

// Palette fields: pad (cleared platform), padEdge (inner rim), stud (ring
// element), studSeam (stud shadow/seam), marker (centered "+" build glyph).
const PALETTES = {
  // Sandbagged dirt emplacement (planet / rocky surfaces).
  rocky_outcrop: { pad: 0x7a5c3a, padEdge: 0x4a3824, stud: 0xc9ad7e, studSeam: 0x4a3a24, marker: 0xefdcab },
  // Bolted steel deck hardpoint (station).
  metal_grille:  { pad: 0x39424c, padEdge: 0x1c2228, stud: 0x8aa6bc, studSeam: 0x20272e, marker: 0x9fe0ff },
  // Clamped rock mining pad (open space / asteroids).
  debris_pad:    { pad: 0x3a3026, padEdge: 0x1e1814, stud: 0xb8956a, studSeam: 0x2a2018, marker: 0xffc070 },
  // Bioluminescent nest socket (organic homeworld).
  organic_disc:  { pad: 0x123a34, padEdge: 0x06201c, stud: 0x2fd0a0, studSeam: 0x0a2a24, marker: 0xff8af0 },
  // Basalt platform ringed by magma studs (volcanic).
  scorched_pad:  { pad: 0x2a1d18, padEdge: 0x120a08, stud: 0xff7a30, studSeam: 0x3a1408, marker: 0xffd060 },
};

const TWO_PI = Math.PI * 2;

export function PLATFORM_STYLE_FOR_MAP(mapId) {
  return STYLE_BY_MAP[mapId] ?? 'rocky_outcrop';
}

/**
 * Render every tower slot as a themed ringed emplacement. Empty slots get a
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
    drawEmplacementPad(gfx, slot, pal);
  }
}

// Ringed emplacement: a cleared platform ringed by themed studs + build marker.
function drawEmplacementPad(gfx, slot, pal) {
  const { cx, cy, radius: r } = slot;
  // Drop shadow
  gfx.fillStyle(0x000000, 0.40);
  gfx.fillCircle(cx + 1, cy + 2, r + 2);
  // Cleared platform
  gfx.fillStyle(pal.pad, 1);
  gfx.fillCircle(cx, cy, r * 0.82);
  gfx.lineStyle(1.5, pal.padEdge, 0.8);
  gfx.strokeCircle(cx, cy, r * 0.80);
  // Stud ring around the rim
  const studs = 11;
  const sr = r * 0.30;
  for (let i = 0; i < studs; i++) {
    const a = (i / studs) * TWO_PI;
    const bx = cx + Math.cos(a) * r;
    const by = cy + Math.sin(a) * r;
    gfx.fillStyle(pal.studSeam, 1);
    gfx.fillCircle(bx, by, sr + 1.2);
    gfx.fillStyle(pal.stud, 1);
    gfx.fillCircle(bx, by, sr);
  }
  // Build marker (empty slots only)
  if (!slot.occupied) {
    gfx.lineStyle(3, pal.marker, 1);
    gfx.lineBetween(cx - r * 0.32, cy, cx + r * 0.32, cy);
    gfx.lineBetween(cx, cy - r * 0.32, cx, cy + r * 0.32);
  }
}
