// World-space replacement for Phaser's camera Vignette postFX. The postFX ran
// over the whole renderer, so once the canvas grew HUD rails its UV no longer
// matched the map and the edges lightened. These pure helpers bake the same
// falloff, measured in MAP UV, into a texture drawn over the world.

// Mirrors FXVignette.frag, including its 3.14 (not Math.PI): darkness 0 at the
// centre rising to 1 at `radius` (fraction of the surface, per axis).
export function vignetteDarkness(u, v, radius, strength) {
  const d = Math.hypot(u - 0.5, v - 0.5);
  if (d > radius) return 1;
  return Math.sin((d / radius) * 3.14 * strength) ** 3;
}

// Fills RGBA pixels: every texel is `color`, alpha = darkness at the texel
// centre. The shader multiplied colour AND alpha by (1 - darkness), so the
// framebuffer showed the canvas clear colour through it — an overlay of that
// colour at that alpha reproduces it. u0..u1 / v0..v1 is the map-UV span the
// texture covers (wider than 0..1 when it carries a margin).
export function fillVignette(data, width, height, { radius, strength, color, u0, u1, v0, v1 }) {
  const r = (color >> 16) & 0xff;
  const g = (color >> 8) & 0xff;
  const b = color & 0xff;
  for (let j = 0; j < height; j++) {
    const v = v0 + ((j + 0.5) / height) * (v1 - v0);
    for (let i = 0; i < width; i++) {
      const u = u0 + ((i + 0.5) / width) * (u1 - u0);
      const k = (j * width + i) * 4;
      data[k] = r;
      data[k + 1] = g;
      data[k + 2] = b;
      data[k + 3] = Math.round(vignetteDarkness(u, v, radius, strength) * 255);
    }
  }
}

export function vignetteTextureKey(radius, strength, color) {
  return `vignette_${radius}_${strength}_${color.toString(16)}`;
}
