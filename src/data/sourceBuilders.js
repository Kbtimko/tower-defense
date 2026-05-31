export function soldierSource(soldier) {
  return { kind:'tower', type:'barracks', tier: soldier.barracks.level, branch: soldier.barracks.branch };
}

export function heroSource(heroId = 'rael') {
  return { kind:'hero', heroId };
}

export function heroAbilitySource(heroId, ability) {
  return { kind:'hero', heroId, ability };
}

export function burnSource() {
  return { kind:'status', type:'burn' };
}

// Back-compat alias retained until T22 cleanup; one caller in GameScene._triggerAirstrike.
export function heroAirstrikeSource() {
  return heroAbilitySource('rael', 'airstrike');
}
