// Pure ability impl functions. Each takes (hero, scene, aimTarget?) and returns
// the ability-result shape (or null on cooldown/dead). Hero.fireAbility is the
// dispatcher; impls do NOT touch hero._timers — Hero does that.

export function raelOvercharge(hero, _scene) {
  if (hero.dead) return null;
  hero.overchargeActive    = true;
  hero.overchargeRemaining = 6;
  return { kind: 'overcharge' };
}

export function raelAirstrike(hero, _scene, { x, y }) {
  if (hero.dead) return null;
  return { kind: 'airstrike', x, y, radius: 70, damage: 80 };
}

export function raelEmp(hero, _scene) {
  if (hero.dead) return null;
  return { kind: 'emp' };
}

export function engRepair(hero, _scene) {
  if (hero.dead) return null;
  return { kind: 'repair', healHero: 60, soldierRadius: 100 };
}

export function engDeployTurret(hero, _scene) {
  if (hero.dead) return null;
  return { kind: 'deploy_turret', x: hero.x, y: hero.y };
}

export function engPowerSurge(hero, _scene) {
  if (hero.dead) return null;
  return { kind: 'power_surge', x: hero.x, y: hero.y, radius: 200, fireRateMult: 2.0, duration: 8 };
}

export function scoutMark(hero, _scene, target) {
  if (hero.dead) return null;
  if (!target) return null;
  return { kind: 'mark', target, multiplier: 2.0, duration: 6 };
}

export function scoutVolley(hero, _scene) {
  if (hero.dead) return null;
  return { kind: 'volley', x: hero.x, y: hero.y, range: 180, damage: 25, maxTargets: 8 };
}

export function scoutPhase(hero, _scene) {
  if (hero.dead) return null;
  return { kind: 'phase_sprint', cloakDuration: 4, speedMult: 2.0 };
}

export function pyroFlameWave(hero, _scene) {
  if (hero.dead) return null;
  return {
    kind: 'flame_wave',
    x: hero.x, y: hero.y, facingX: hero._facingX,
    length: 100, halfAngle: Math.PI / 4,
    damage: 30, burn: { duration: 4, dps: 5 },
  };
}

export function pyroImmolate(hero, _scene) {
  if (hero.dead) return null;
  return { kind: 'immolate', radius: 60, duration: 8, dps: 10, attackDamageMult: 1.5 };
}

export function pyroFirefield(hero, _scene, { x, y }) {
  if (hero.dead) return null;
  return { kind: 'firefield', x, y, radius: 100, duration: 6, dps: 15, slowFactor: 0.7 };
}

export function pyroBurnOnHit(_hero, enemy) {
  enemy.applyStatus({ type: 'burn', duration: 2, dps: 3 });
}
