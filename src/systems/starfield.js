// Seeded parallax starfield, so title/map captures are deterministic.
import { SeededRandom } from './SeededRandom.js';

export function makeStars(seed, layers, w, h) {
  const rng = new SeededRandom(seed);
  const stars = [];
  layers.forEach((layer, i) => {
    for (let n = 0; n < layer.count; n++) {
      stars.push({ x: rng.next() * w, y: rng.next() * h, layer: i, phase: rng.next() * Math.PI * 2 });
    }
  });
  return stars;
}

// Drifts left at each layer's px/s; modulo (not a single += w) keeps a long
// frame (tab refocus, big dt) inside [0, w).
export function advanceStars(stars, dtMs, w, layers) {
  // A canvas ticked before layout has w 0; x % 0 is NaN and never recovers.
  if (!(w > 0)) return stars;
  for (const s of stars) {
    const x = (s.x - layers[s.layer].speed * dtMs / 1000) % w;
    const wrapped = x < 0 ? x + w : x;
    // -1e-17 + w rounds to w; keep the half-open [0, w) contract.
    s.x = wrapped >= w ? 0 : wrapped;
  }
  return stars;
}
