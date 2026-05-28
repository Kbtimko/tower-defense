export function soldierSource(soldier) {
  return { kind: 'tower', type: 'barracks', tier: soldier.barracks.level, branch: soldier.barracks.branch };
}

export function heroSource() {
  return { kind: 'hero' };
}

export function heroAirstrikeSource() {
  return { kind: 'hero', ability: 'airstrike' };
}
