// Shared matchup-list formatter. Three UI surfaces (codex, wave preview, and
// tooltips) each render enemy vulnerableTo/resists lists, which mix towers
// and heroes ({kind, type, name, icon} entries from describeEnemy). A flat
// comma list makes a hero (e.g. Dax) look like a buildable tower — this is
// the single place that distinguishes them, so the two consumers can't drift
// back into flattening it themselves.
export function formatCounters(entries) {
  const towers = entries.filter(e => e.kind === 'tower').map(e => e.name);
  const heroes = entries.filter(e => e.kind === 'hero').map(e => e.name);

  if (!towers.length && !heroes.length) return '';
  if (!heroes.length) return towers.join(', ');
  if (!towers.length) return `heroes: ${heroes.join(', ')}`;
  return `${towers.join(', ')} (heroes: ${heroes.join(', ')})`;
}
