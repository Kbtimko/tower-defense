// Validates a picks.json downloaded from the review page against the job it came
// from and the candidates actually on disk. Every error is collected so one run
// shows the whole problem; apply plans nothing unless this returns [].
//
// picks.json: { batch, picks: { assetId: index }, flip: [assetId], reroll: [assetId] }
// existingByAsset: { assetId: [index, ...] } of candidates whose json landed.

const isPlainObject = v => v !== null && typeof v === 'object' && !Array.isArray(v);

export function validatePicks(picks, job, existingByAsset) {
  if (!isPlainObject(picks)) return ['picks.json is not an object'];
  if (picks.batch !== job.batch) return [`picks.json is for batch "${picks.batch}", not "${job.batch}"`];
  if (!isPlainObject(picks.picks)) return ['picks must be an object of assetId -> index'];
  for (const k of ['flip', 'reroll']) {
    if (picks[k] !== undefined && !Array.isArray(picks[k])) return [`${k} must be a list of assetIds`];
  }

  const errors = [];
  const assets = new Map(job.assets.map(a => [a.assetId, a]));
  const flip = picks.flip ?? [];
  const reroll = picks.reroll ?? [];
  const known = (id) => {
    if (assets.has(id)) return true;
    errors.push(`${id}: not an asset in batch "${job.batch}"`);
    return false;
  };

  for (const [id, index] of Object.entries(picks.picks)) {
    if (!known(id)) continue;
    // The page writes numbers; a string index is a hand edit and is not trusted.
    if (!Number.isInteger(index) || !(existingByAsset[id] ?? []).includes(index)) {
      errors.push(`${id}: no candidate #${index}`);
    }
  }
  for (const id of reroll) {
    if (!known(id)) continue;
    if (Object.hasOwn(picks.picks, id)) errors.push(`${id}: both picked and rerolled`);
  }
  for (const id of flip) {
    if (!known(id)) continue;
    if (assets.get(id).kind !== 'sprite') errors.push(`${id}: flip applies to sprites only`);
    else if (!Object.hasOwn(picks.picks, id)) errors.push(`${id}: flipped but not picked`);
  }
  return errors;
}
