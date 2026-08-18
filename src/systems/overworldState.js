// Classifies overworld nodes for rendering. Pure: data in, data out.
//   entries: [{ id, unlocked, stars }] (any order)
//   finalId: the map id that is the final/boss level
// Returns each entry with:
//   state: 'completed' | 'next' | 'unlocked' | 'locked'
//   isFinal: boolean (id === finalId)
// "next" is the single lowest-id unlocked entry with zero stars.
export function classifyOverworld(entries, finalId) {
  const nextEntry = [...entries]
    .sort((a, b) => a.id - b.id)
    .find(e => e.unlocked && e.stars === 0);
  const nextId = nextEntry ? nextEntry.id : null;

  return entries.map(e => {
    let state;
    if (!e.unlocked) state = 'locked';
    else if (e.stars > 0) state = 'completed';
    else if (e.id === nextId) state = 'next';
    else state = 'unlocked';
    return { ...e, state, isFinal: e.id === finalId };
  });
}
