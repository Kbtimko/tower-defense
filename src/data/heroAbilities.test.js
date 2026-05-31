import { describe, it, expect } from 'vitest';
import { raelOvercharge, raelAirstrike, raelEmp } from './heroAbilities.js';
import { engRepair, engDeployTurret, engPowerSurge } from './heroAbilities.js';

const makeHero = (overrides = {}) => ({
  dead: false,
  overchargeActive: false,
  overchargeRemaining: 0,
  ...overrides,
});

describe('raelOvercharge', () => {
  it('sets active + remaining = 6 and returns kind:overcharge', () => {
    const h = makeHero();
    const r = raelOvercharge(h, {});
    expect(r).toEqual({ kind: 'overcharge' });
    expect(h.overchargeActive).toBe(true);
    expect(h.overchargeRemaining).toBe(6);
  });

  it('returns null when hero is dead', () => {
    const h = makeHero({ dead: true });
    expect(raelOvercharge(h, {})).toBeNull();
  });
});

describe('raelAirstrike', () => {
  it('returns hit zone with radius:70, damage:80, at clicked point', () => {
    const r = raelAirstrike(makeHero(), {}, { x: 100, y: 200 });
    expect(r).toEqual({ kind:'airstrike', x:100, y:200, radius:70, damage:80 });
  });

  it('returns null when hero is dead', () => {
    expect(raelAirstrike(makeHero({ dead: true }), {}, { x:0, y:0 })).toBeNull();
  });
});

describe('raelEmp', () => {
  it('returns kind:emp', () => {
    expect(raelEmp(makeHero(), {})).toEqual({ kind: 'emp' });
  });

  it('returns null when hero is dead', () => {
    expect(raelEmp(makeHero({ dead: true }), {})).toBeNull();
  });
});

describe('engineer abilities', () => {
  it('engRepair returns kind:repair when alive', () => {
    const h = { dead: false, hp: 40, maxHp: 95 };
    expect(engRepair(h, {})).toEqual({ kind:'repair', healHero: 60, soldierRadius: 100 });
  });
  it('engRepair returns null when dead', () => {
    expect(engRepair({ dead: true }, {})).toBeNull();
  });

  it('engDeployTurret returns kind:deploy_turret with position', () => {
    const h = { dead: false, x: 100, y: 200 };
    expect(engDeployTurret(h, {})).toEqual({ kind:'deploy_turret', x: 100, y: 200 });
  });
  it('engDeployTurret returns null when dead', () => {
    expect(engDeployTurret({ dead: true, x:0, y:0 }, {})).toBeNull();
  });

  it('engPowerSurge returns kind:power_surge with position + radius + multiplier + duration', () => {
    const h = { dead: false, x: 50, y: 50 };
    expect(engPowerSurge(h, {})).toEqual({ kind:'power_surge', x:50, y:50, radius:200, fireRateMult:2.0, duration:8 });
  });
});

import { scoutMark, scoutVolley, scoutPhase } from './heroAbilities.js';

describe('scout abilities', () => {
  it('scoutMark returns kind:mark with multiplier 2.0 and duration 6 for the aimed enemy', () => {
    const target = { id: 'e1' };
    const r = scoutMark({ dead: false }, {}, target);
    expect(r).toEqual({ kind:'mark', target, multiplier:2.0, duration:6 });
  });
  it('scoutMark returns null when target is missing', () => {
    expect(scoutMark({ dead: false }, {}, null)).toBeNull();
  });
  it('scoutMark returns null when dead', () => {
    expect(scoutMark({ dead: true }, {}, { id:'e' })).toBeNull();
  });

  it('scoutVolley returns kind:volley with damage 25, range 180, maxTargets 8', () => {
    const h = { dead: false, x: 100, y: 100 };
    expect(scoutVolley(h, {})).toEqual({ kind:'volley', x:100, y:100, range:180, damage:25, maxTargets:8 });
  });

  it('scoutPhase returns kind:phase_sprint with cloakDuration 4 and speedMult 2.0', () => {
    const h = { dead: false };
    expect(scoutPhase(h, {})).toEqual({ kind:'phase_sprint', cloakDuration:4, speedMult:2.0 });
  });
});

import { pyroFlameWave, pyroImmolate, pyroFirefield, pyroBurnOnHit } from './heroAbilities.js';
import { vi } from 'vitest';

describe('pyromancer abilities', () => {
  it('pyroFlameWave returns kind:flame_wave with cone params + burn', () => {
    const h = { dead: false, x: 0, y: 0, _facingX: 1 };
    expect(pyroFlameWave(h, {})).toEqual({
      kind:'flame_wave', x:0, y:0, facingX:1, length:100, halfAngle: Math.PI/4,
      damage:30, burn:{ duration:4, dps:5 },
    });
  });

  it('pyroImmolate returns kind:immolate with attached aura + atkDmgMult window', () => {
    const h = { dead: false };
    expect(pyroImmolate(h, {})).toEqual({
      kind:'immolate', radius:60, duration:8, dps:10, attackDamageMult:1.5,
    });
  });

  it('pyroFirefield returns kind:firefield at aim point with pool params', () => {
    const r = pyroFirefield({ dead: false }, {}, { x: 100, y: 200 });
    expect(r).toEqual({
      kind:'firefield', x:100, y:200, radius:100, duration:6, dps:15, slowFactor:0.7,
    });
  });

  it('pyroBurnOnHit applies 3dps/2s burn to the enemy', () => {
    const enemy = { applyStatus: vi.fn() };
    pyroBurnOnHit({}, enemy);
    expect(enemy.applyStatus).toHaveBeenCalledWith({ type:'burn', duration:2, dps:3 });
  });
});
