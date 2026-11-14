// CSS-filter maths (W3C Filter Effects L1) so soldier textures can be recoloured
// once at boot without a canvas `filter`, which Safari ignores. Pure and
// import-free: the Node capture harness loads it too.

const clamp01 = (v) => Math.min(1, Math.max(0, v));

function sepiaM(amount) {
  const i = 1 - clamp01(amount);
  return [
    [0.393 + 0.607 * i, 0.769 - 0.769 * i, 0.189 - 0.189 * i],
    [0.349 - 0.349 * i, 0.686 + 0.314 * i, 0.168 - 0.168 * i],
    [0.272 - 0.272 * i, 0.534 - 0.534 * i, 0.131 + 0.869 * i],
  ];
}

function saturateM(s) {
  return [
    [0.213 + 0.787 * s, 0.715 - 0.715 * s, 0.072 - 0.072 * s],
    [0.213 - 0.213 * s, 0.715 + 0.285 * s, 0.072 - 0.072 * s],
    [0.213 - 0.213 * s, 0.715 - 0.715 * s, 0.072 + 0.928 * s],
  ];
}

function hueRotateM(deg) {
  const r = (deg * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return [
    [0.213 + c * 0.787 - s * 0.213, 0.715 - c * 0.715 - s * 0.715, 0.072 - c * 0.072 + s * 0.928],
    [0.213 - c * 0.213 + s * 0.143, 0.715 + c * 0.285 + s * 0.140, 0.072 - c * 0.072 - s * 0.283],
    [0.213 - c * 0.213 - s * 0.787, 0.715 - c * 0.715 + s * 0.715, 0.072 + c * 0.928 + s * 0.072],
  ];
}

const brightnessM = (b) => [[b, 0, 0], [0, b, 0], [0, 0, b]];

// Identity params emit no stage at all, so untouched channels can't pick up
// float drift (E35).
export function filterStages({ sepia = 0, saturate = 1, hueRotate = 0, brightness = 1 } = {}) {
  const stages = [];
  if (sepia !== 0) stages.push(sepiaM(sepia));
  if (saturate !== 1) stages.push(saturateM(saturate));
  if (hueRotate !== 0) stages.push(hueRotateM(hueRotate));
  if (brightness !== 1) stages.push(brightnessM(brightness));
  return stages;
}

// Round + clamp after every stage: browsers quantise between chained filter
// functions, and the clamp is what makes white under sepia 1 land on 239 blue.
export function applyColorStages(rgba, stages) {
  for (let p = 0; p < rgba.length; p += 4) {
    if (rgba[p + 3] === 0) continue;
    let r = rgba[p];
    let g = rgba[p + 1];
    let b = rgba[p + 2];
    for (const m of stages) {
      const nr = Math.min(255, Math.max(0, Math.round(m[0][0] * r + m[0][1] * g + m[0][2] * b)));
      const ng = Math.min(255, Math.max(0, Math.round(m[1][0] * r + m[1][1] * g + m[1][2] * b)));
      const nb = Math.min(255, Math.max(0, Math.round(m[2][0] * r + m[2][1] * g + m[2][2] * b)));
      r = nr; g = ng; b = nb;
    }
    rgba[p] = r; rgba[p + 1] = g; rgba[p + 2] = b;
  }
  return rgba;
}

export function rgbToHue(r, g, b) {
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  if (d === 0) return 0;
  let h;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}

function hslSaturation(r, g, b) {
  const mx = Math.max(r, g, b) / 255;
  const mn = Math.min(r, g, b) / 255;
  const d = mx - mn;
  if (d === 0) return 0;
  return d / (1 - Math.abs(mx + mn - 1));
}

// Circular mean: a plain average of 350 and 10 would say 180.
export function meanHue(rgba, minSat = 0.2) {
  let x = 0;
  let y = 0;
  let n = 0;
  for (let p = 0; p < rgba.length; p += 4) {
    if (rgba[p + 3] === 0) continue;
    const r = rgba[p]; const g = rgba[p + 1]; const b = rgba[p + 2];
    if (hslSaturation(r, g, b) <= minSat) continue;
    const a = (rgbToHue(r, g, b) * Math.PI) / 180;
    x += Math.cos(a);
    y += Math.sin(a);
    n++;
  }
  if (n === 0) return null;
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

export function hueDistance(a, b) {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}
