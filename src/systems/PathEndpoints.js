import { ENDPOINT_FX, ENDPOINT_LOOK } from '../data/roads.js';

const TAU = Math.PI * 2;
const FALLBACK_FAMILY = 'planet';
// Phaser accepts the blend-mode name; avoids importing Phaser (untestable under jsdom).
const ADD = 'ADD';

// Pulls the centre inward (plain x/y clamp) so the effect is never half off-screen when a
// path point lies on the canvas border.
function clampInside(point, radius, { width, height }) {
  return {
    x: Math.min(Math.max(point.x, radius), width - radius),
    y: Math.min(Math.max(point.y, radius), height - radius),
  };
}

// 0..1 sine pulse at `hz`.
function pulse01(t, hz) {
  return 0.5 + 0.5 * Math.sin(TAU * hz * t);
}

function lerp(range, k) {
  return range[0] + (range[1] - range[0]) * k;
}

// Enemy spawn portal and player-base beacon. Every Image is built once; update() only
// writes rotation/scale/alpha so there is no per-frame allocation.
export class PathEndpoints {
  constructor(scene, { start, end, family }) {
    const fx = ENDPOINT_FX[family] || ENDPOINT_FX[FALLBACK_FAMILY];
    const look = ENDPOINT_LOOK;
    this._portalFx = fx.portal;
    this._beaconFx = fx.beacon;
    this._t = 0;

    const p = clampInside(start, fx.portal.radius, look.canvas);
    const b = clampInside(end, fx.beacon.radius, look.canvas);
    const make = (pt, key, color, diameter) => scene.add.image(pt.x, pt.y, key)
      .setDepth(look.depth).setTint(color).setBlendMode(ADD).setDisplaySize(diameter, diameter);

    const pd = fx.portal.radius * 2;
    this._outer = make(p, 'fx-ring', fx.portal.colors[0], pd).setAlpha(look.ringAlpha);
    this._inner = make(p, 'fx-ring', fx.portal.colors[1], pd * look.innerRingScale).setAlpha(look.ringAlpha);
    this._portalGlow = make(p, 'fx-glow', fx.portal.colors[1], pd * look.portalGlow.scale);

    const bd = fx.beacon.radius * 2;
    this._beaconGlow = make(b, 'fx-glow', fx.beacon.color, bd * look.beaconGlow.scale);
    this._beaconRing = make(b, 'fx-ring', fx.beacon.color, bd * look.beaconRing.scale).setAlpha(look.beaconRing.alpha);
    // setScale() overwrites the scale setDisplaySize derived from the texture, so pulse
    // around a base captured here (Image.width is the frame width).
    this._portalGlowBase = pd * look.portalGlow.scale / this._portalGlow.width;
    this._beaconGlowBase = bd * look.beaconGlow.scale / this._beaconGlow.width;
    this._images = [this._outer, this._inner, this._portalGlow, this._beaconGlow, this._beaconRing];
  }

  update(dtSeconds) {
    this._t += dtSeconds;
    const t = this._t;
    const look = ENDPOINT_LOOK;

    const spin = this._portalFx.spin * t;
    this._outer.setRotation(spin);
    this._inner.setRotation(-spin);
    const pk = pulse01(t, this._portalFx.pulse);
    this._portalGlow.setAlpha(lerp(look.portalGlow.alpha, pk)).setScale(this._portalGlowBase * (1 + look.portalGlow.swing * (pk - 0.5) * 2));

    const bk = pulse01(t, this._beaconFx.pulse);
    this._beaconGlow.setAlpha(lerp(look.beaconGlow.alpha, bk)).setScale(this._beaconGlowBase * (1 + look.beaconGlow.swing * (bk - 0.5) * 2));
    this._beaconRing.setRotation(look.beaconRing.spin * t);
  }

  destroy() {
    for (const im of this._images) im.destroy();
    this._images = [];
  }
}
