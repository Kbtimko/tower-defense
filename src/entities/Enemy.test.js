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
