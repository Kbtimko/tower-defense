// Per-map ambient motion. Each family is pure and deterministic from a
// SeededRandom instance. init() builds element state; step() advances it in
// place; draw() issues only Phaser.Graphics primitive calls. The owning
// AmbientBackgroundLayer sets the gfx blend mode once from family.blendMode.

export const MAX_ELEMENTS = 90;
const TWO_PI = Math.PI * 2;

function wrap(v, max) {
  return ((v % max) + max) % max;
}

export const FX_FAMILIES = {
  // Slow warm motes drifting on a shared wind vector with a sinusoidal sway.
  dust: {
    blendMode: 'NORMAL',
    init(rng, w, h) {
      const motes = [];
      for (let i = 0; i < 40; i++) {
        motes.push({
          x: rng.next() * w,
          y: rng.next() * h,
          r: 1 + rng.next(),
          baseAlpha: 0.08 + rng.next() * 0.10,
          phase: rng.next() * TWO_PI,
          swayAmp: 4 + rng.next() * 6,
          swayFreq: 0.0003 + rng.next() * 0.0004,
        });
      }
      return {
        w, h, motes, t: 0, color: 0x9a8c70,
        driftX: (rng.next() * 0.02 - 0.01),
        driftY: (rng.next() * 0.008 - 0.004),
      };
    },
    step(s, dtMs) {
      s.t += dtMs;
      for (const m of s.motes) {
        m.x = wrap(m.x + s.driftX * dtMs, s.w);
        m.y = wrap(m.y + s.driftY * dtMs, s.h);
      }
    },
    draw(gfx, s) {
      for (const m of s.motes) {
        const sway = Math.sin(s.t * m.swayFreq + m.phase) * m.swayAmp;
        gfx.fillStyle(s.color, m.baseAlpha);
        gfx.fillCircle(wrap(m.x + sway, s.w), m.y, m.r);
      }
    },
  },

  // Warm embers rising with horizontal sway, fading as they climb, wrapping
  // back to the bottom. Additive glow over dark backdrops.
  embers: {
    blendMode: 'ADD',
    init(rng, w, h) {
      const palette = [0xff8844, 0xffaa44];
      const embers = [];
      for (let i = 0; i < 35; i++) {
        embers.push({
          x: rng.next() * w,
          y: rng.next() * h,
          r: 1 + rng.next(),
          vy: -(0.01 + rng.next() * 0.02),
          baseAlpha: 0.3 + rng.next() * 0.4,
          swayAmp: 3 + rng.next() * 5,
          swayFreq: 0.0006 + rng.next() * 0.0006,
          phase: rng.next() * TWO_PI,
          color: palette[Math.floor(rng.next() * palette.length)],
        });
      }
      return { w, h, embers, t: 0 };
    },
    step(s, dtMs) {
      s.t += dtMs;
      for (const e of s.embers) {
        e.y += e.vy * dtMs;
        if (e.y < -10) e.y += s.h + 20;
      }
    },
    draw(gfx, s) {
      for (const e of s.embers) {
        const sway = Math.sin(s.t * e.swayFreq + e.phase) * e.swayAmp;
        const a = e.baseAlpha * Math.max(0, Math.min(1, e.y / s.h));
        gfx.fillStyle(e.color, a);
        gfx.fillCircle(wrap(e.x + sway, s.w), e.y, e.r);
      }
    },
  },

  // Two parallax drift layers plus subtle twinkle. Additive over dark space.
  stars: {
    blendMode: 'ADD',
    init(rng, w, h) {
      const mk = (count, rMin, rRange, aMin, aRange) => {
        const out = [];
        for (let i = 0; i < count; i++) {
          out.push({
            x: rng.next() * w,
            y: rng.next() * h,
            r: rMin + rng.next() * rRange,
            baseAlpha: aMin + rng.next() * aRange,
            phase: rng.next() * TWO_PI,
            twFreq: 0.0008 + rng.next() * 0.0010,
            color: rng.next() < 0.5 ? 0xffffff : 0xcfe6ff,
          });
        }
        return out;
      };
      const far = mk(60, 0.5, 0.6, 0.20, 0.30);
      const near = mk(25, 1.0, 0.7, 0.50, 0.40);
      return { w, h, far, near, t: 0, driftFar: -0.004, driftNear: -0.010 };
    },
    step(s, dtMs) {
      s.t += dtMs;
      for (const p of s.far) p.x = wrap(p.x + s.driftFar * dtMs, s.w);
      for (const p of s.near) p.x = wrap(p.x + s.driftNear * dtMs, s.w);
    },
    draw(gfx, s) {
      for (const p of [...s.far, ...s.near]) {
        const a = p.baseAlpha * (0.6 + 0.4 * Math.sin(s.t * p.twFreq + p.phase));
        gfx.fillStyle(p.color, Math.max(0, a));
        gfx.fillCircle(p.x, p.y, p.r);
      }
    },
  },

  // Blinking station lights (smooth alpha oscillation) plus occasional brief
  // spark arcs along seeded conduit segments. Additive cool-blue glow.
  electrical: {
    blendMode: 'ADD',
    init(rng, w, h) {
      const color = 0x3a8ad0;
      const lights = [];
      for (let i = 0; i < 20; i++) {
        lights.push({
          x: rng.next() * w,
          y: rng.next() * h,
          r: 1.5 + rng.next() * 1.5,
          baseAlpha: 0.4 + rng.next() * 0.4,
          period: 700 + rng.next() * 1800,
          phase: rng.next() * TWO_PI,
        });
      }
      const conduits = [];
      for (let i = 0; i < 4; i++) {
        const x1 = rng.next() * w, y1 = rng.next() * h;
        conduits.push({
          x1, y1,
          x2: x1 + (rng.next() * 80 - 40),
          y2: y1 + (rng.next() * 80 - 40),
          period: 1200 + rng.next() * 2400,
          phase: rng.next() * TWO_PI,
        });
      }
      return { w, h, lights, conduits, t: 0, color };
    },
    step(s, dtMs) {
      s.t += dtMs;
    },
    draw(gfx, s) {
      for (const l of s.lights) {
        const a = l.baseAlpha * (0.5 + 0.5 * Math.sin(s.t * (TWO_PI / l.period) + l.phase));
        gfx.fillStyle(s.color, Math.max(0, a));
        gfx.fillCircle(l.x, l.y, l.r);
      }
      for (const c of s.conduits) {
        const spark = Math.sin(s.t * (TWO_PI / c.period) + c.phase);
        if (spark > 0.9) {
          gfx.lineStyle(2, s.color, 0.7);
          gfx.lineBetween(c.x1, c.y1, c.x2, c.y2);
        }
      }
    },
  },
};
