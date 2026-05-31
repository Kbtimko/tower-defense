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
