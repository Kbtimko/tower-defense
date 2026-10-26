const validLivesLost = (n) => Number.isInteger(n) && n >= 0;
const validTime = (n) => Number.isFinite(n) && n > 0;

export function livesLostFor(startLivesOfRun, livesLeft) {
  if (!Number.isInteger(startLivesOfRun) || !Number.isInteger(livesLeft)) return null;
  return Math.max(0, startLivesOfRun - livesLeft);
}

export function sanitizeRecord(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const livesLost = validLivesLost(raw.livesLost) ? raw.livesLost : null;
  const timeMs = validTime(raw.timeMs) ? Math.round(raw.timeMs) : null;
  if (livesLost === null && timeMs === null) return null;
  return { livesLost, timeMs };
}

// Both fields are lower-is-better. NEW BEST needs a valid previous value to beat, strictly.
export function mergeRecord(prev, run) {
  const p = sanitizeRecord(prev);
  const runLives = validLivesLost(run?.livesLost) ? run.livesLost : null;
  const runTime = validTime(run?.timeMs) ? Math.round(run.timeMs) : null;
  const pick = (prevVal, runVal) => {
    if (runVal === null) return { value: prevVal, best: false };
    if (prevVal === null) return { value: runVal, best: false };
    return runVal < prevVal ? { value: runVal, best: true } : { value: prevVal, best: false };
  };
  const l = pick(p?.livesLost ?? null, runLives);
  const t = pick(p?.timeMs ?? null, runTime);
  return {
    record: sanitizeRecord({ livesLost: l.value, timeMs: t.value }),
    newBest: { livesLost: l.best, time: t.best },
  };
}
