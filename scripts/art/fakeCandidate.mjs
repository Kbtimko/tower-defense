import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const SIZE = 1024;
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

// Stand-in for a generated candidate so the whole review/apply flow can run with
// no Draw Things server. Each index gets a different hue so candidates are
// distinguishable on the review page; the red FAKE band makes it impossible to
// mistake one for real art (apply also refuses mode:fake picks).
export async function makeFakeCandidate({ outPath, index, label, basePng }) {
  let img;
  if (basePng) {
    img = sharp(basePng)
      .resize(SIZE, SIZE, { fit: 'contain', kernel: 'nearest', background: { r: 128, g: 128, b: 128, alpha: 1 } })
      .flatten({ background: { r: 128, g: 128, b: 128 } })
      .modulate({ hue: (index * 45) % 360 });
  } else {
    img = sharp({ create: { width: SIZE, height: SIZE, channels: 3, background: { r: 128, g: 128, b: 128 } } });
  }
  const overlay = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}">
      <polygon points="0,700 0,860 1024,420 1024,260" fill="rgba(210,30,30,0.85)"/>
      <text x="512" y="560" font-size="150" font-family="sans-serif" font-weight="bold" fill="#fff"
            text-anchor="middle" transform="rotate(-23 512 560)">FAKE</text>
      <text x="512" y="960" font-size="56" font-family="sans-serif" fill="#fff"
            text-anchor="middle" stroke="#000" stroke-width="2">${esc(label)}</text>
    </svg>`);
  mkdirSync(dirname(outPath), { recursive: true });
  await img.composite([{ input: overlay }]).png().toFile(outPath);
}
