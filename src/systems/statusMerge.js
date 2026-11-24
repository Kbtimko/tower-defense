// Shared by Enemy.applyStatus and the simulator so a weaker status can never
// overwrite a stronger one (Frost Mage's 0.7 slow over Permafrost's 0.15, or
// an Assassin's 1s boss stun over a 3s EMP stun) and the two cannot drift.

export function mergeSlow(current, incoming) {
  if (!current.active || incoming.factor < current.factor) {
    return { active: true, timer: incoming.duration, factor: incoming.factor };
  }
  if (incoming.factor === current.factor) {
    return { active: true, timer: Math.max(current.timer, incoming.duration), factor: current.factor };
  }
  return { active: true, timer: current.timer, factor: current.factor };
}

export function mergeStun(current, incoming) {
  return { active: true, timer: Math.max(current.active ? current.timer : 0, incoming.duration) };
}
