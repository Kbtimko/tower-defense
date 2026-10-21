#!/usr/bin/env node
// Derives the shipped map backdrops from their source PNGs:
//   assets-src/backgrounds/<name>.png  ->  public/assets/backgrounds/<name>.webp
//                                          public/assets/backgrounds/<name>@0.5x.webp
// Run with: npm run optimize-assets [-- --force]
//
// Idempotent: an output newer than its source is skipped unless --force.
// Prints each file's size and PSNR against the source (full-size variant only)
// and fails if the shipped total exceeds BACKGROUND_BUDGET_BYTES. PSNR is a
// coarse regression guard: grainy terrain (map 0) scores low while looking
// fine, so judge a quality change in a capture, not by the number alone.
import { readdirSync, statSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { MAPS } from '../src/data/maps.js';
import { BACKGROUND_VARIANTS, BACKGROUND_SOURCE_WIDTH, BACKGROUND_BUDGET_BYTES } from '../src/data/backgroundAssets.js';
import { backgroundUrl } from '../src/systems/backgroundAsset.js';

const SRC_DIR = 'assets-src/backgrounds';
const force = process.argv.includes('--force');

async function psnr(sourcePath, webpPath) {
  const decode = p => sharp(p).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const [a, b] = await Promise.all([decode(sourcePath), decode(webpPath)]);
  let sum = 0;
  for (let i = 0; i < a.data.length; i++) {
    const d = a.data[i] - b.data[i];
    sum += d * d;
  }
  const mse = sum / a.data.length;
  return mse === 0 ? Infinity : 10 * Math.log10((255 * 255) / mse);
}

const sources = new Set(readdirSync(SRC_DIR).filter(f => f.endsWith('.png')));
let total = 0;
let failed = false;

for (const map of MAPS) {
  const srcName = map.backgroundImage;
  if (!sources.has(srcName)) {
    console.log(`✗ map ${map.id}: ${join(SRC_DIR, srcName)} missing`);
    failed = true;
    continue;
  }
  const srcPath = join(SRC_DIR, srcName);
  const meta = await sharp(srcPath).metadata();
  if (meta.width !== BACKGROUND_SOURCE_WIDTH) {
    // The variant picker assumes this width; a mismatch makes it pick wrong.
    console.log(`! map ${map.id}: source is ${meta.width}px wide, BACKGROUND_SOURCE_WIDTH says ${BACKGROUND_SOURCE_WIDTH}`);
  }
  for (const v of BACKGROUND_VARIANTS) {
    const out = join('public', backgroundUrl(srcName, v));
    mkdirSync(join(out, '..'), { recursive: true });
    const stale = !existsSync(out) || statSync(out).mtimeMs < statSync(srcPath).mtimeMs;
    if (force || stale) {
      await sharp(srcPath)
        .resize(Math.round(meta.width * v.scale))
        .webp({ quality: v.quality, effort: 6, smartSubsample: true })
        .toFile(out);
    }
    const bytes = statSync(out).size;
    total += bytes;
    const fidelity = v.scale === 1 ? `  PSNR ${(await psnr(srcPath, out)).toFixed(1)} dB` : '';
    console.log(`${force || stale ? 'wrote' : 'kept '} ${out}  ${(bytes / 1024).toFixed(0)} KB${fidelity}`);
  }
}

const mb = n => (n / 1024 / 1024).toFixed(2);
console.log(`\nShipped backdrops: ${mb(total)} MB (budget ${mb(BACKGROUND_BUDGET_BYTES)} MB)`);
if (total > BACKGROUND_BUDGET_BYTES) { console.log('✗ over budget'); failed = true; }
if (failed) process.exit(1);
