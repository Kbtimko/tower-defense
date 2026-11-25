import { describe, it, expect, vi } from 'vitest';
import { DamageNumberOverlay } from './DamageNumberOverlay.js';

function makeText() {
  return {
    setText: vi.fn(function (s) { this.text = s; return this; }),
    setStyle: vi.fn(function () { return this; }),
    setColor: vi.fn(function () { return this; }),
    setFontSize: vi.fn(function () { return this; }),
    setOrigin: vi.fn(function () { return this; }),
    setPosition: vi.fn(function (x, y) { this.x = x; this.y = y; return this; }),
    setAlpha: vi.fn(function (a) { this.alpha = a; return this; }),
    setVisible: vi.fn(function (v) { this.visible = v; return this; }),
    setActive: vi.fn(function (a) { this.active = a; return this; }),
    setStroke: vi.fn(function () { return this; }),
    setShadow: vi.fn(function () { return this; }),
    setDepth:  vi.fn(function () { return this; }),
  };
}

function makeScene() {
  const events = { handlers: {}, on(e, fn) { this.handlers[e] = fn; }, off() {}, emit(e, p) { if (this.handlers[e]) this.handlers[e](p); } };
  const tweens = {
    add: vi.fn(({ onComplete }) => { if (onComplete) onComplete(); return {}; }),
    killTweensOf: vi.fn(),
  };
  const add = { text: vi.fn(() => makeText()) };
  return { events, tweens, add };
}

describe('DamageNumberOverlay', () => {
  it('has no crit path — nothing in the game produces one', () => {
    // A stray isCrit must not bypass the small-hit threshold or style a
    // number for a feature that does not exist.
    const scene = makeScene();
    new DamageNumberOverlay(scene);
    scene.events.emit('damage-dealt', { target: { x: 100, y: 100 }, amount: 5, isCrit: true });
    expect(scene.add.text).not.toHaveBeenCalled();
  });

  it('spawns a number for an AoE hit regardless of amount', () => {
    const scene = makeScene();
    new DamageNumberOverlay(scene);
    scene.events.emit('damage-dealt', { target: { x: 0, y: 0 }, amount: 4, isAoe: true, abilityLabel: 'AIRSTRIKE' });
    expect(scene.add.text).toHaveBeenCalledTimes(1);
  });

  it('spawns a number for damage >= 30', () => {
    const scene = makeScene();
    new DamageNumberOverlay(scene);
    scene.events.emit('damage-dealt', { target: { x: 0, y: 0 }, amount: 30 });
    expect(scene.add.text).toHaveBeenCalledTimes(1);
  });

  it('suppresses small non-crit non-AoE hits', () => {
    const scene = makeScene();
    new DamageNumberOverlay(scene);
    scene.events.emit('damage-dealt', { target: { x: 0, y: 0 }, amount: 8 });
    scene.events.emit('damage-dealt', { target: { x: 0, y: 0 }, amount: 29 });
    expect(scene.add.text).not.toHaveBeenCalled();
  });

  it('returns text objects to the pool after expiry (tween onComplete)', () => {
    const scene = makeScene();
    new DamageNumberOverlay(scene);
    for (let i = 0; i < 5; i++) {
      scene.events.emit('damage-dealt', { target: { x: 0, y: 0 }, amount: 50 });
    }
    expect(scene.add.text).toHaveBeenCalledTimes(1);
  });

  it('drops new spawns silently when all 24 pool slots are in flight', () => {
    const scene = makeScene();
    scene.tweens.add = vi.fn(() => ({}));
    new DamageNumberOverlay(scene);
    for (let i = 0; i < 30; i++) {
      scene.events.emit('damage-dealt', { target: { x: 0, y: 0 }, amount: 50 });
    }
    expect(scene.add.text).toHaveBeenCalledTimes(24);
  });

  it('kills lingering tweens on a text object when returning it to the pool', () => {
    const scene = makeScene();
    new DamageNumberOverlay(scene);
    scene.events.emit('damage-dealt', { target: { x: 0, y: 0 }, amount: 50 });
    expect(scene.tweens.killTweensOf).toHaveBeenCalledTimes(1);
  });
});

describe('absorbed hits', () => {
  it('prints a sub-threshold hit when armour absorbed it', () => {
    const scene = makeScene();
    new DamageNumberOverlay(scene);
    scene.events.emit('damage-dealt', { target: { x: 10, y: 10 }, amount: 1, absorbedBand: 'floored' });
    expect(scene.add.text).toHaveBeenCalledTimes(1);
  });

  it('still hides a sub-threshold hit that armour did not absorb', () => {
    const scene = makeScene();
    new DamageNumberOverlay(scene);
    scene.events.emit('damage-dealt', { target: { x: 10, y: 10 }, amount: 1, absorbedBand: 'none' });
    expect(scene.add.text).not.toHaveBeenCalled();
  });

  it('marks an absorbed number with the shield glyph', () => {
    const scene = makeScene();
    const made = [];
    scene.add.text = vi.fn(() => { const t = makeText(); made.push(t); return t; });
    new DamageNumberOverlay(scene);
    scene.events.emit('damage-dealt', { target: { x: 0, y: 0 }, amount: 1, absorbedBand: 'floored' });
    expect(made[0].text).toBe('🛡1');
  });

  // Note on these throttle tests: DamageNumberOverlay's object pool recycles a
  // text object synchronously in this test harness (the mocked tweens.add
  // fires onComplete immediately), so `scene.add.text` is only called once no
  // matter how many logical spawns happen afterward — it counts object
  // allocation, not spawn attempts, and a repeat emit reuses the pooled
  // object either way. That makes `scene.add.text` call-count blind to
  // whether the throttle actually fired. Asserting on the captured object's
  // `setText` calls instead counts spawn attempts correctly, since every
  // spawn (fresh or pooled) re-invokes setText — so a broken/missing/global
  // throttle is caught rather than masked by pool reuse.
  it('throttles repeat absorbed numbers on the same enemy', () => {
    const scene = makeScene();
    const made = [];
    scene.add.text = vi.fn(() => { const t = makeText(); made.push(t); return t; });
    new DamageNumberOverlay(scene);
    const target = { x: 0, y: 0 };
    scene.events.emit('damage-dealt', { target, amount: 1, absorbedBand: 'floored' });
    scene.events.emit('damage-dealt', { target, amount: 1, absorbedBand: 'floored' });
    expect(made[0].setText).toHaveBeenCalledTimes(1);
  });

  it('lets a different enemy through inside the same window', () => {
    const scene = makeScene();
    const made = [];
    scene.add.text = vi.fn(() => { const t = makeText(); made.push(t); return t; });
    new DamageNumberOverlay(scene);
    scene.events.emit('damage-dealt', { target: { x: 0, y: 0 }, amount: 1, absorbedBand: 'floored' });
    scene.events.emit('damage-dealt', { target: { x: 5, y: 5 }, amount: 1, absorbedBand: 'floored' });
    expect(made[0].setText).toHaveBeenCalledTimes(2);
  });

  it('admits the same enemy again once the window has passed', () => {
    const scene = makeScene();
    const made = [];
    scene.add.text = vi.fn(() => { const t = makeText(); made.push(t); return t; });
    const overlay = new DamageNumberOverlay(scene);
    const target = { x: 0, y: 0 };
    let now = 1000;
    overlay._now = () => now;
    scene.events.emit('damage-dealt', { target, amount: 1, absorbedBand: 'floored' });
    now += 701;
    scene.events.emit('damage-dealt', { target, amount: 1, absorbedBand: 'floored' });
    expect(made[0].setText).toHaveBeenCalledTimes(2);
  });

  it('still prints when the absorbed hit is the killing blow', () => {
    // The overlay has never suppressed a killing blow; only the hit FLASH is
    // skipped on death (Enemy.js:131). Suppressing the number here would be a
    // new and inconsistent rule.
    const scene = makeScene();
    new DamageNumberOverlay(scene);
    scene.events.emit('damage-dealt', {
      target: { x: 0, y: 0, dead: true }, amount: 1, absorbedBand: 'floored',
    });
    expect(scene.add.text).toHaveBeenCalledTimes(1);
  });

  it('does not throttle an ordinary big hit', () => {
    const scene = makeScene();
    const made = [];
    scene.add.text = vi.fn(() => { const t = makeText(); made.push(t); return t; });
    new DamageNumberOverlay(scene);
    const target = { x: 0, y: 0 };
    scene.events.emit('damage-dealt', { target, amount: 50 });
    scene.events.emit('damage-dealt', { target, amount: 50 });
    expect(made[0].setText).toHaveBeenCalledTimes(2);
  });

  it('does not consume the throttle window when the pool is exhausted', () => {
    // Fill every pool slot with in-flight numbers (tweens.add never fires
    // onComplete here, so nothing gets recycled), then send an absorbed hit
    // on a fresh enemy that the pool has to drop. If the throttle timestamp
    // were written before the pool check, that dropped hit would still burn
    // the enemy's 700ms window and swallow the next legitimate one.
    const scene = makeScene();
    scene.tweens.add = vi.fn(() => ({}));
    const made = [];
    scene.add.text = vi.fn(() => { const t = makeText(); made.push(t); return t; });
    const overlay = new DamageNumberOverlay(scene);
    const target = { x: 0, y: 0 };

    for (let i = 0; i < 24; i++) {
      scene.events.emit('damage-dealt', { target: { x: i, y: i }, amount: 50 });
    }
    expect(made.length).toBe(24);

    // Pool is exhausted: this absorbed hit is dropped before it can set the
    // throttle timestamp for `target`.
    scene.events.emit('damage-dealt', { target, amount: 1, absorbedBand: 'floored' });
    expect(overlay._absorbedAt.has(target)).toBe(false);
  });

  it('drops its throttle state on destroy', () => {
    const scene = makeScene();
    const overlay = new DamageNumberOverlay(scene);
    const before = overlay._absorbedAt;
    overlay.destroy();
    expect(overlay._absorbedAt).not.toBe(before);
  });
});

describe('DamageNumberOverlay resolution', () => {
  it('restyled numbers keep render resolution', async () => {
    const { setRenderScale } = await import('./renderScale.js');
    setRenderScale(2);
    try {
      const scene = makeScene();
      const txt = makeText();
      scene.add.text = vi.fn(() => txt);
      new DamageNumberOverlay(scene);
      scene.events.emit('damage-dealt', { target: { x: 0, y: 0 }, amount: 50 });
      expect(txt.setStyle.mock.calls[0][0].resolution).toBe(2);
    } finally {
      setRenderScale(1);
    }
  });
});

describe('pool priority', () => {
  // Models Phaser: killTweensOf destroys a target's tweens WITHOUT firing
  // onComplete, and nothing completes unless the test asks.
  function makePoolScene() {
    const scene = makeScene();
    const texts = [];
    const tweenLog = new Map();
    scene.add.text = vi.fn(() => { const t = makeText(); texts.push(t); return t; });
    scene.tweens.add = vi.fn((cfg) => {
      const list = tweenLog.get(cfg.targets) ?? [];
      list.push(cfg);
      tweenLog.set(cfg.targets, list);
      return {};
    });
    scene.tweens.killTweensOf = vi.fn((t) => { tweenLog.delete(t); });
    const overlay = new DamageNumberOverlay(scene);
    let n = 0;
    const emit = (p) => scene.events.emit('damage-dealt', { target: { x: ++n, y: n }, ...p });
    const reading = (s) => texts.filter((t) => t.text === s && t.visible !== false);
    const complete = (text) => {
      const cfg = (tweenLog.get(text) ?? []).find((c) => c.onComplete);
      cfg.onComplete();
      // onComplete's own cleanup calls killTweensOf; the tests assert on
      // evictions only.
      scene.tweens.killTweensOf.mockClear();
    };
    return { scene, overlay, emit, reading, complete, texts };
  }
  const fillAbsorbed = (emit) => {
    for (let i = 0; i < 24; i++) emit({ amount: 1, absorbedBand: 'floored' });
  };

  it('a big hit evicts an absorbed number when the pool is full', () => {
    const { scene, emit, reading } = makePoolScene();
    fillAbsorbed(emit);
    emit({ amount: 50 });
    expect(scene.add.text).toHaveBeenCalledTimes(24);
    expect(scene.tweens.killTweensOf).toHaveBeenCalledTimes(1);
    expect(reading('50')).toHaveLength(1);
  });

  it('evicts the OLDEST absorbed number', () => {
    const { scene, emit, texts } = makePoolScene();
    for (let i = 0; i < 12; i++) emit({ amount: 50 });
    for (let i = 1; i <= 12; i++) emit({ amount: i, absorbedBand: 'heavy' });
    const oldest = texts.find((t) => t.text === '🛡1');
    emit({ amount: 7, isAoe: true });
    expect(scene.tweens.killTweensOf).toHaveBeenCalledWith(oldest);
    expect(oldest.text).toBe('7');
  });

  it('an absorbed hit never evicts', () => {
    const { scene, emit, reading } = makePoolScene();
    fillAbsorbed(emit);
    emit({ amount: 99, absorbedBand: 'heavy' });
    expect(scene.tweens.killTweensOf).not.toHaveBeenCalled();
    expect(reading('🛡99')).toHaveLength(0);
  });

  it('a completed absorbed number is no longer evictable', () => {
    const { scene, emit, reading, complete, texts } = makePoolScene();
    emit({ amount: 3, absorbedBand: 'heavy' });
    complete(texts[0]);
    for (let i = 30; i <= 53; i++) emit({ amount: i });
    emit({ amount: 77 });
    expect(scene.tweens.killTweensOf).not.toHaveBeenCalled();
    expect(reading('77')).toHaveLength(0);
    expect(texts[0].text).toBe('30');
  });

  it('the pool stays at 24 across evictions', () => {
    const { scene, emit, reading } = makePoolScene();
    fillAbsorbed(emit);
    for (const a of [60, 61, 62]) emit({ amount: a });
    emit({ amount: 5, absorbedBand: 'heavy' });
    expect(scene.add.text).toHaveBeenCalledTimes(24);
    expect(reading('60')).toHaveLength(1);
    expect(reading('61')).toHaveLength(1);
    expect(reading('62')).toHaveLength(1);
    expect(reading('🛡5')).toHaveLength(0);
  });

  it('a big hit is still dropped when the pool holds no absorbed numbers', () => {
    const { scene, emit, reading } = makePoolScene();
    for (let i = 0; i < 24; i++) emit({ amount: 50 });
    emit({ amount: 88 });
    expect(scene.tweens.killTweensOf).not.toHaveBeenCalled();
    expect(reading('88')).toHaveLength(0);
  });
});
