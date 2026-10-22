vi.mock('phaser', () => ({
  default: {
    GameObjects: {
      Container: class {
        constructor(scene, x, y) { this.scene = scene; this.x = x; this.y = y; }
        add() {}
        setDepth() { return this; }
      }
    }
  }
}));

import { Enemy } from './Enemy.js';

const makeGraphics = () => ({
  clear() {}, fillStyle() {}, fillCircle() {}, fillRect() {},
  lineStyle() {}, strokeCircle() {}, strokeRect() {},
  fillEllipse() {}, fillPoints() {}, strokePoints() {},
  fillTriangle() {}, strokeTriangle() {}, strokeCircle() {},
  strokeRect() {}, setVisible(v) { this.visible = v; return this; },
  lineBetween() {}, // required by skitter branch in _redrawBody()
});

const makeScene = () => ({
  add: { graphics: makeGraphics, existing() {} },
});

const makeDef = () => ({
  hp: 100, speed: 80, armor: 0, reward: 10,
  radius: 10, color: 0x00ff00, type: 'drone', flying: false,
});

describe('Enemy stun', () => {
  it('applyStatus stun sets active and timer', () => {
    const e = new Enemy(makeScene(), { def: makeDef(), startX: 0, startY: 0 });
    e.applyStatus({ type: 'stun', duration: 3 });
    expect(e.statusEffects.stun.active).toBe(true);
    expect(e.statusEffects.stun.timer).toBe(3);
  });

  it('stun timer ticks down in update', () => {
    const e = new Enemy(makeScene(), { def: makeDef(), startX: 0, startY: 0 });
    e.applyStatus({ type: 'stun', duration: 3 });
    e.update(1);
    expect(e.statusEffects.stun.timer).toBeCloseTo(2);
  });

  it('stun clears when timer reaches 0', () => {
    const e = new Enemy(makeScene(), { def: makeDef(), startX: 0, startY: 0 });
    e.applyStatus({ type: 'stun', duration: 1 });
    e.update(1.5);
    expect(e.statusEffects.stun.active).toBe(false);
  });
});

const makeEnemy = () => {
  const emitted = [];
  const scene = {
    add: { graphics: makeGraphics, existing() {} },
    events: { emit(event, data) { emitted.push({ event, data }); }, _emitted: emitted },
    game: { registry: { get: () => null } },
  };
  return new Enemy(scene, { def: makeDef(), startX: 0, startY: 0 });
};

describe('Enemy.takeDamage — weakness matrix integration', () => {
  const makeDefWith = (overrides) => ({
    hp: 100, speed: 80, armor: 0, reward: 10,
    radius: 10, color: 0x00ff00, type: 'drone', flying: false,
    ...overrides,
  });

  // Richer scene that satisfies takeDamage's audio/event hooks.
  const makeRichScene = () => {
    const emitted = [];
    return {
      add: { graphics: makeGraphics, existing() {} },
      events: { emit(event, data) { emitted.push({ event, data }); }, _emitted: emitted },
      game: { registry: { get: () => null } }, // no audio manager
    };
  };

  it('no source → backcompat (armor only)', () => {
    const scene = makeRichScene();
    const e = new Enemy(scene, { def: makeDefWith({ type: 'brute', hp: 200, armor: 8 }), startX: 0, startY: 0 });
    e.takeDamage(45);
    expect(e.hp).toBe(200 - 37); // max(1, 45-8) = 37
  });

  it('source applied post-armor (cannon vs brute, 1.5x)', () => {
    const scene = makeRichScene();
    const e = new Enemy(scene, { def: makeDefWith({ type: 'brute', hp: 200, armor: 8 }), startX: 0, startY: 0 });
    e.takeDamage(45, { source: { kind: 'tower', type: 'cannon', tier: 1, branch: null } });
    expect(e.hp).toBe(200 - 55); // floor((45-8) * 1.5) = 55
  });

  it('pierce + multiplier (sniper-Assassin vs titan, 2.5x)', () => {
    const scene = makeRichScene();
    const e = new Enemy(scene, { def: makeDefWith({ type: 'titan', hp: 5000, armor: 20 }), startX: 0, startY: 0 });
    e.takeDamage(300, { pierce: true, source: { kind: 'tower', type: 'sniper', tier: 4, branch: 'A' } });
    expect(e.hp).toBe(5000 - 750); // floor((300-0) * 2.5) = 750
  });

  it('floor at 1 (ice vs titan, 0.75x, armor 20)', () => {
    const scene = makeRichScene();
    const e = new Enemy(scene, { def: makeDefWith({ type: 'titan', hp: 100, armor: 20 }), startX: 0, startY: 0 });
    e.takeDamage(8, { source: { kind: 'tower', type: 'ice', tier: 1, branch: null } });
    expect(e.hp).toBe(99); // max(1, 8-20)=1, floor(1*0.75)=0, max(1,0)=1
  });

  it('cannon vs phantom (0.5x, no armor)', () => {
    const scene = makeRichScene();
    const e = new Enemy(scene, { def: makeDefWith({ type: 'phantom', hp: 60, armor: 0, flying: true }), startX: 0, startY: 0 });
    e.takeDamage(45, { source: { kind: 'tower', type: 'cannon', tier: 1, branch: null } });
    expect(e.hp).toBe(60 - 22); // floor((45-0) * 0.5) = 22
  });

  it('hero vs phantom (1.5x)', () => {
    const scene = makeRichScene();
    const e = new Enemy(scene, { def: makeDefWith({ type: 'phantom', hp: 60, armor: 0, flying: true }), startX: 0, startY: 0 });
    e.takeDamage(25, { source: { kind: 'hero', heroId: 'rael' } });
    expect(e.hp).toBe(60 - 37); // floor((25-0) * 1.5) = 37
  });

  it('damage-dealt event reports post-multiplier amount', () => {
    const scene = makeRichScene();
    const e = new Enemy(scene, { def: makeDefWith({ type: 'brute', hp: 200, armor: 8 }), startX: 0, startY: 0 });
    e.takeDamage(45, { source: { kind: 'tower', type: 'cannon', tier: 1, branch: null } });
    const evt = scene.events._emitted.find(x => x.event === 'damage-dealt');
    expect(evt).toBeDefined();
    expect(evt.data.amount).toBe(55);
  });

  it('bare-boolean pierce still works (backcompat path)', () => {
    const scene = makeRichScene();
    const e = new Enemy(scene, { def: makeDefWith({ type: 'brute', hp: 200, armor: 8 }), startX: 0, startY: 0 });
    e.takeDamage(45, true); // bare boolean
    expect(e.hp).toBe(200 - 45); // pierce → armor 0 → max(1, 45-0)=45, no source → mult 1.0
  });
});

describe('Enemy burn status', () => {
  it('takes dps damage at 1-second ticks', () => {
    const enemy = makeEnemy();
    const start = enemy.hp;
    enemy.applyStatus({ type:'burn', duration:4, dps:5 });
    enemy.update(0.5);
    expect(enemy.hp).toBe(start);
    enemy.update(0.5);
    expect(enemy.hp).toBe(start - 5);
  });

  it('clears burn when timer expires', () => {
    const enemy = makeEnemy();
    enemy.applyStatus({ type:'burn', duration:2, dps:5 });
    enemy.update(2.0);
    expect(enemy.statusEffects.burn.active).toBe(false);
  });

  it('re-applying with higher dps replaces dps and refreshes duration', () => {
    const enemy = makeEnemy();
    enemy.applyStatus({ type:'burn', duration:2, dps:3 });
    enemy.update(0.5);
    enemy.applyStatus({ type:'burn', duration:4, dps:5 });
    expect(enemy.statusEffects.burn.dps).toBe(5);
    expect(enemy.statusEffects.burn.timer).toBeCloseTo(4);
  });

  it('re-applying with lower dps keeps higher dps and refreshes duration', () => {
    const enemy = makeEnemy();
    enemy.applyStatus({ type:'burn', duration:2, dps:5 });
    enemy.update(0.5);
    enemy.applyStatus({ type:'burn', duration:4, dps:3 });
    expect(enemy.statusEffects.burn.dps).toBe(5);
    expect(enemy.statusEffects.burn.timer).toBeCloseTo(4);
  });
});

describe('Enemy vulnerable status', () => {
  it('multiplies incoming damage after the weakness multiplier', () => {
    const enemy = makeEnemy();
    enemy.applyStatus({ type:'vulnerable', duration:5, multiplier:2 });
    const start = enemy.hp;
    enemy.takeDamage(10);
    expect(start - enemy.hp).toBe(20);
  });

  it('multiplier replaces (does not stack) on re-apply', () => {
    const enemy = makeEnemy();
    enemy.applyStatus({ type:'vulnerable', duration:5, multiplier:2 });
    enemy.applyStatus({ type:'vulnerable', duration:5, multiplier:1.5 });
    expect(enemy.statusEffects.vulnerable.multiplier).toBe(1.5);
  });

  it('clears vulnerable when timer expires', () => {
    const enemy = makeEnemy();
    enemy.applyStatus({ type:'vulnerable', duration:2, multiplier:2 });
    enemy.update(2.0);
    expect(enemy.statusEffects.vulnerable.active).toBe(false);
  });

  it('vulnerable does not apply when not active', () => {
    const enemy = makeEnemy();
    const start = enemy.hp;
    enemy.takeDamage(10);
    expect(start - enemy.hp).toBe(10);
  });
});

describe('Enemy status overlay', () => {
  it('creates a separate overlay graphic distinct from the body', () => {
    const e = makeEnemy();
    expect(e._overlay).toBeDefined();
    expect(e._overlay).not.toBe(e._body);
  });
  it('redraws the overlay without throwing when slow is applied', () => {
    const e = makeEnemy();
    expect(() => e.applyStatus({ type: 'slow', duration: 2, factor: 0.5 })).not.toThrow();
    expect(e.statusEffects.slow.active).toBe(true);
  });
});

describe('Enemy death presentation', () => {
  it('reports no death animation while no death art is registered', () => {
    const e = new Enemy(makeScene(), { def: makeDef(), startX: 0, startY: 0 });
    expect(e.hasDeathAnimation()).toBe(false);
  });

  it('reports a death animation once the sprite has death art', () => {
    const e = new Enemy(makeScene(), { def: makeDef(), startX: 0, startY: 0 });
    e._sprite = { hasState: (n) => n === 'death', playOnce: vi.fn(), setBaseTint: vi.fn(), setSquash: vi.fn() };
    expect(e.hasDeathAnimation()).toBe(true);
  });

  it('hides the HP bar and status rings, then plays the one-shot', () => {
    const e = new Enemy(makeScene(), { def: makeDef(), startX: 0, startY: 0 });
    const playOnce = vi.fn();
    e._sprite = { hasState: () => true, playOnce, setBaseTint: vi.fn(), setSquash: vi.fn() };
    const done = vi.fn();

    e.playDeathAnimation(done);

    expect(e._hpBar.visible).toBe(false);
    expect(e._overlay.visible).toBe(false);
    expect(playOnce).toHaveBeenCalledWith('death', done);
  });
});

// Regression: a tier-1 archer is floored to 1 damage against a wave-5 colossus
// (660 HP), which moved the HP bar by 0.05px and printed no damage number, so
// twenty consecutive landed hits rendered pixel-identically. Damage was always
// applying — nothing on screen said so.
describe('Enemy hit feedback for chip damage', () => {
  const armouredDef = () => ({
    hp: 660, speed: 28, armor: 15, reward: 55,
    radius: 16, color: 0x880044, type: 'colossus', flying: false,
  });
  const archer = { kind: 'tower', type: 'archer', tier: 1, branch: null };

  const recordingScene = () => {
    const rects = [];
    const gfx = () => {
      const g = makeGraphics();
      g.fillRect = (x, y, w, h) => { rects.push({ x, y, w, h }); };
      return g;
    };
    return {
      rects,
      add: { graphics: gfx, existing() {} },
      events: { emit() {} },
      game: { registry: { get: () => null } },
    };
  };

  it('flashes on a hit that only chips one point off a 660 HP enemy', () => {
    const e = new Enemy(recordingScene(), { def: armouredDef(), startX: 0, startY: 0 });

    e.takeDamage(15, { source: archer });

    expect(e.maxHp - e.hp).toBe(1);  // the armour floor, not a rounding accident
    expect(e.hitFlash.active).toBe(true);
  });

  it('clears the flash once its timer runs out', () => {
    const e = makeEnemy();
    e.takeDamage(5);
    expect(e.hitFlash.active).toBe(true);
    e.update(1);
    expect(e.hitFlash.active).toBe(false);
  });

  it('restarts the flash on a second hit instead of letting it expire early', () => {
    const e = makeEnemy();
    e.takeDamage(5);
    e.update(0.05);
    const partly = e.hitFlash.timer;
    e.takeDamage(5);
    expect(e.hitFlash.timer).toBeGreaterThan(partly);
  });

  it('flashes for burn ticks too, not just direct hits', () => {
    const e = makeEnemy();
    e.applyStatus({ type: 'burn', duration: 3, dps: 4 });
    e.update(1);
    expect(e.hitFlash.active).toBe(true);
  });

  it('leaves no flash on a corpse when the killing blow lands', () => {
    const e = new Enemy(recordingScene(), { def: armouredDef(), startX: 0, startY: 0 });
    e.takeDamage(15, { source: archer });     // light the flash
    expect(e.hitFlash.active).toBe(true);

    e.takeDamage(99999, { source: archer });  // and now kill it
    expect(e.dead).toBe(true);
    expect(e.hitFlash.active).toBe(false);
  });

  it('drops the flash when the death animation takes over', () => {
    const e = makeEnemy();
    e._sprite = { hasState: () => true, playOnce: vi.fn(), setFlash: vi.fn(), setSquash: vi.fn(), setBaseTint: vi.fn() };
    e.takeDamage(5);
    e.playDeathAnimation(vi.fn());
    expect(e.hitFlash.active).toBe(false);
    expect(e._flash.visible).toBe(false);
  });

  it('draws a visibly shorter HP bar after a single 1-damage chip hit', () => {
    const scene = recordingScene();
    const e = new Enemy(scene, { def: armouredDef(), startX: 0, startY: 0 });
    // Last fillRect of each _redrawHpBar pass is the coloured fill.
    const fillWidth = () => scene.rects[scene.rects.length - 1].w;
    const full = fillWidth();

    e.takeDamage(15, { source: archer });

    expect(full - fillWidth()).toBeGreaterThanOrEqual(1);
  });

  it('still draws a full bar on an undamaged enemy', () => {
    const scene = recordingScene();
    const e = new Enemy(scene, { def: armouredDef(), startX: 0, startY: 0 });
    const last = scene.rects[scene.rects.length - 1];
    expect(last.w).toBeCloseTo(armouredDef().radius * 2.2);
  });
});

describe('Enemy hit squash and status visuals', () => {
  const squashDef = () => ({
    hp: 100, speed: 80, armor: 0, reward: 10,
    radius: 10, color: 0x00ff00, type: 'drone', flying: false,
  });
  const trackingGraphics = () => {
    const g = makeGraphics();
    g.visible = true;
    g.calls = [];
    for (const m of ['fillTriangle', 'strokeCircle', 'clear']) {
      const orig = g[m];
      g[m] = (...a) => { g.calls.push(m); return orig.apply(g, a); };
    }
    return g;
  };
  const build = ({ spawner } = {}) => {
    const scene = {
      add: { graphics: trackingGraphics, existing() {} },
      events: { emit() {} },
      game: { registry: { get: () => null } },
      particleSpawner: spawner,
    };
    const e = new Enemy(scene, { def: squashDef(), startX: 0, startY: 0 });
    e._sprite = {
      active: true, setFlash: vi.fn(), setBaseTint: vi.fn(), setSquash: vi.fn(),
      getDisplaySize: () => null, hasState: () => false,
    };
    return e;
  };

  it('a non-lethal hit squashes the sprite on the next update, then restores exactly', () => {
    const e = build();
    e.takeDamage(5);
    e.update(0.03);
    const [x, y] = e._sprite.setSquash.mock.lastCall;
    expect(x).toBeGreaterThan(1);
    expect(y).toBeLessThan(1);
    e.update(1);
    expect(e._sprite.setSquash).toHaveBeenLastCalledWith(1, 1);
  });

  it('stops calling setSquash once the squash has finished', () => {
    const e = build();
    e.takeDamage(5);
    e.update(1);
    e._sprite.setSquash.mockClear();
    e.update(0.016);
    expect(e._sprite.setSquash).not.toHaveBeenCalled();
  });

  it('a lethal hit does not squash, and cancels a squash in progress', () => {
    const e = build();
    e.takeDamage(5);
    e.update(0.03);
    e.takeDamage(99999);
    expect(e._sprite.setSquash).toHaveBeenLastCalledWith(1, 1);
    e._sprite.setSquash.mockClear();
    e.update(0.03);
    expect(e._sprite.setSquash).not.toHaveBeenCalled();
  });

  it('slow tints cyan on start and clears on expiry', () => {
    const e = build();
    e.applyStatus({ type: 'slow', duration: 1, factor: 0.5 });
    expect(e._sprite.setBaseTint).toHaveBeenLastCalledWith(0x7fe9ff);
    e.update(2);
    expect(e._sprite.setBaseTint).toHaveBeenLastCalledWith(null);
  });

  it('stun outranks burn and slow; falls back to the next status on expiry', () => {
    const e = build();
    e.applyStatus({ type: 'slow', duration: 5, factor: 0.5 });
    e.applyStatus({ type: 'burn', duration: 5, dps: 0 });
    e.applyStatus({ type: 'stun', duration: 1 });
    expect(e._sprite.setBaseTint).toHaveBeenLastCalledWith(0xffe14d);
    e.update(1.5);
    expect(e._sprite.setBaseTint).toHaveBeenLastCalledWith(0xff8a1f);
  });

  it('draws frost crystals on the overlay for slow', () => {
    const e = build();
    e._overlay.calls.length = 0;
    e.applyStatus({ type: 'slow', duration: 1, factor: 0.5 });
    expect(e._overlay.calls.filter((c) => c === 'fillTriangle')).toHaveLength(4);
  });

  it('stun draws 3 stars on the dedicated child each frame and hides them on expiry', () => {
    const e = build();
    e.applyStatus({ type: 'stun', duration: 1 });
    expect(e._stars.visible).toBe(true);
    e._stars.calls.length = 0;
    e.update(0.1);
    expect(e._stars.calls.filter((c) => c === 'fillTriangle').length).toBe(6); // 2 triangles per star
    e.update(2);
    expect(e._stars.visible).toBe(false);
  });

  it('stun no longer draws the white ring on the overlay', () => {
    const e = build();
    e._overlay.calls.length = 0;
    e.applyStatus({ type: 'stun', duration: 1 });
    expect(e._overlay.calls).not.toContain('strokeCircle');
  });

  it('burn emits embers through the spawner every update while burning, not after', () => {
    const spawner = { emitStatus: vi.fn() };
    const e = build({ spawner });
    e.applyStatus({ type: 'burn', duration: 1, dps: 0 });
    e.update(0.1);
    expect(spawner.emitStatus).toHaveBeenCalledWith('burn', e, 0.1);
    e.update(2);
    spawner.emitStatus.mockClear();
    e.update(0.1);
    expect(spawner.emitStatus).not.toHaveBeenCalled();
  });

  it('burn works without a particle spawner', () => {
    const e = build();
    e.applyStatus({ type: 'burn', duration: 1, dps: 0 });
    expect(() => e.update(0.1)).not.toThrow();
  });

  it('death animation hides the stars', () => {
    const e = build();
    e._sprite.playOnce = vi.fn();
    e.applyStatus({ type: 'stun', duration: 5 });
    e.playDeathAnimation(vi.fn());
    expect(e._stars.visible).toBe(false);
  });

  it('death animation clears the status tint so the corpse is not tinted', () => {
    const e = build();
    e._sprite.playOnce = vi.fn();
    e.applyStatus({ type: 'slow', duration: 5, factor: 0.5 });
    e.playDeathAnimation(vi.fn());
    expect(e._sprite.setBaseTint).toHaveBeenLastCalledWith(null);
  });

  it('a hit landing mid-squash leaves the HP bar geometry unchanged', () => {
    const e = build();
    let sx = 1, sy = 1;
    // Mimics EntitySprite: display size is the unsquashed art times the squash.
    e._sprite.setSquash = vi.fn((x, y) => { sx = x; sy = y; });
    e._sprite.getDisplaySize = () => ({ width: 53, height: 112 });
    const rects = [];
    e._hpBar.fillRect = (...a) => rects.push(a.slice(0, 3));
    e.takeDamage(5);
    const first = rects.splice(0).map((r) => r.join());
    e.update(0.03);
    e.takeDamage(5);
    const second = rects.splice(0).map((r) => r.join());
    expect(sx).not.toBe(1);
    expect(second.slice(0, 2)).toEqual(first.slice(0, 2));
  });

  it('stars orbit above the top of tall art, not inside the body', () => {
    const e = build();
    e._sprite.getDisplaySize = () => ({ width: 53, height: 112 });
    const ys = [];
    e._stars.fillTriangle = (x1, y1, x2, y2, x3, y3) => ys.push(y1, y2, y3);
    e.applyStatus({ type: 'stun', duration: 5 });
    e.update(0.1);
    expect(ys.length).toBeGreaterThan(0);
    expect(Math.max(...ys)).toBeLessThan(-56); // art top is -56
  });

  it('works on the Graphics fallback (inactive sprite) without throwing', () => {
    const e = build();
    e._sprite = { active: false, setFlash() {}, setBaseTint() {}, setSquash() {}, getDisplaySize: () => null };
    e.applyStatus({ type: 'slow', duration: 1, factor: 0.5 });
    e.takeDamage(5);
    expect(() => e.update(0.05)).not.toThrow();
  });
});
