import { describe, it, expect } from 'vitest';
import { PathEndpoints } from './PathEndpoints.js';
import { ENDPOINT_FX, ENDPOINT_LOOK } from '../data/roads.js';

function stubScene() {
  const images = [];
  const scene = {
    images,
    add: {
      image(x, y, key) {
        const im = { x, y, key, width: 64, rotation: 0, scale: 1, alpha: 1, destroyed: false };
        for (const m of ['setDepth', 'setTint', 'setBlendMode', 'setDisplaySize', 'setRotation', 'setScale', 'setAlpha']) {
          im[m] = (v) => {
            if (m === 'setDepth') im.depth = v;
            if (m === 'setTint') im.tint = v;
            if (m === 'setRotation') im.rotation = v;
            if (m === 'setScale') im.scale = v;
            if (m === 'setAlpha') im.alpha = v;
            if (m === 'setDisplaySize') im.scale = v / im.width;
            return im;
          };
        }
        im.destroy = () => { im.destroyed = true; };
        images.push(im);
        return im;
      },
    },
  };
  return scene;
}

const mk = (scene, o = {}) => new PathEndpoints(scene, { start: { x: 100, y: 200 }, end: { x: 900, y: 400 }, family: 'planet', ...o });
const snap = (s) => JSON.stringify(s.images.map((i) => [i.rotation, i.scale, i.alpha]));

describe('PathEndpoints', () => {
  it('creates 5 images once at depth 9, tinted from ENDPOINT_FX', () => {
    const s = stubScene();
    const e = mk(s);
    const n = s.images.length;
    expect(n).toBe(5);
    for (let i = 0; i < 50; i++) e.update(0.016);
    expect(s.images.length).toBe(n);
    expect(s.images.every((i) => i.depth === ENDPOINT_LOOK.depth)).toBe(true);
    const tints = s.images.map((i) => i.tint);
    expect(tints).toContain(ENDPOINT_FX.planet.portal.colors[0]);
    expect(tints).toContain(ENDPOINT_FX.planet.beacon.color);
  });

  it('update is deterministic and animates', () => {
    const a = stubScene(), b = stubScene();
    const ea = mk(a), eb = mk(b);
    const before = snap(a);
    for (const dt of [0.1, 0.2, 0.05]) { ea.update(dt); eb.update(dt); }
    expect(snap(a)).toBe(snap(b));
    expect(snap(a)).not.toBe(before);
  });

  it('portal rings counter-rotate', () => {
    const s = stubScene();
    const e = mk(s);
    e.update(0.5);
    const [outer, inner] = s.images;
    expect(outer.rotation).toBeGreaterThan(0);
    expect(inner.rotation).toBeLessThan(0);
  });

  it.each(['planet', 'space'])('glows keep their intended diameter while pulsing (%s)', (family) => {
    const s = stubScene();
    const e = mk(s, { family });
    const { portal, beacon } = ENDPOINT_FX[family];
    const L = ENDPOINT_LOOK;
    const cases = [[s.images[2], portal.radius * 2 * L.portalGlow.scale, L.portalGlow.swing],
      [s.images[3], beacon.radius * 2 * L.beaconGlow.scale, L.beaconGlow.swing]];
    for (let i = 0; i < 40; i++) {
      e.update(0.037);
      for (const [im, d, swing] of cases) {
        expect(im.scale * im.width).toBeGreaterThanOrEqual(d * (1 - swing) - 1e-9);
        expect(im.scale * im.width).toBeLessThanOrEqual(d * (1 + swing) + 1e-9);
      }
    }
  });

  it('destroy destroys every image', () => {
    const s = stubScene();
    mk(s).destroy();
    expect(s.images.every((i) => i.destroyed)).toBe(true);
  });

  it('clamps edge points inside the canvas by radius', () => {
    const s = stubScene();
    mk(s, { start: { x: 0, y: 360 }, end: { x: 1280, y: 720 } });
    const { portal, beacon } = ENDPOINT_FX.planet;
    const [p0] = s.images;
    expect(p0.x).toBe(portal.radius);
    expect(p0.y).toBe(360);
    const beaconImg = s.images[s.images.length - 1];
    expect(beaconImg.x).toBe(1280 - beacon.radius);
    expect(beaconImg.y).toBe(720 - beacon.radius);
  });

  it('unknown family falls back to planet', () => {
    const s = stubScene();
    mk(s, { family: 'nope' });
    expect(s.images.map((i) => i.tint)).toContain(ENDPOINT_FX.planet.portal.colors[1]);
  });
});
