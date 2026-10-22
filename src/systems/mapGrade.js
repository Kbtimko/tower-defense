// Per-map colour grade (roadmap 1.4). Pure: builds the 4x5 colour matrix that
// Phaser's ColorMatrix FX takes (`set()`, offsets in 0-255 units) from a map's
// `grade` in maps.js, and decides whether grading runs at all.

const LUM = [0.2126, 0.7152, 0.0722];

// 4x5 affine matrices as flat 20-arrays, row-major: [r g b a offset] x 4.
function compose(a, b) {           // a after b
  const out = new Array(20).fill(0);
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 5; c++) {
      let v = c === 4 ? a[r * 5 + 4] : 0;
      for (let k = 0; k < 4; k++) v += a[r * 5 + k] * (c === 4 ? b[k * 5 + 4] : b[k * 5 + c]);
      out[r * 5 + c] = v;
    }
  }
  return out;
}

function saturationMatrix(s) {
  const m = [];
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) m.push(LUM[c] * (1 - s) + (r === c ? s : 0));
    m.push(0, 0);
  }
  return [...m, 0, 0, 0, 1, 0];
}

function contrastMatrix(c) {
  const o = 127.5 * (1 - c);
  return [c,0,0,0,o, 0,c,0,0,o, 0,0,c,0,o, 0,0,0,1,0];
}

function gainMatrix([r, g, b]) {
  return [r,0,0,0,0, 0,g,0,0,0, 0,0,b,0,0, 0,0,0,1,0];
}

/** Saturation, then contrast, then brightness x tint — composed into one matrix. */
export function gradeMatrix({ tint = [1, 1, 1], contrast = 1, saturation = 1, brightness = 1 } = {}) {
  const gain = tint.map(t => t * brightness);
  return compose(gainMatrix(gain), compose(contrastMatrix(contrast), saturationMatrix(saturation)));
}

// For tests and tooling: run an RGB triple (0-255) through a matrix.
export function applyMatrix(m, [r, g, b], a = 255) {
  return [0, 1, 2].map(i => m[i * 5] * r + m[i * 5 + 1] * g + m[i * 5 + 2] * b + m[i * 5 + 3] * a + m[i * 5 + 4]);
}

/**
 * Same shape as resolveAmbientMotion: a saved boolean wins; null means auto,
 * which grades only on a non-touch device — phones are where the FX cost
 * hurts. Canvas has no FX pipeline, so it never grades.
 */
export function resolveMapGrade(saved, { webgl, touch }) {
  if (!webgl) return false;
  if (typeof saved === 'boolean') return saved;
  return !touch;
}
