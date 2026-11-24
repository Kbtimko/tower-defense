// Pure formatter for `npm run balance -- --t4`: kept out of the script so the
// column layout is pinned by a test rather than eyeballed.
const TYPE_WIDTH = 10;
const MULT_WIDTH = 5;
const LIVES_WIDTH = 3;
const WAVE_WIDTH = 4;

const mult = m => (m === null ? '—' : `x${m.toFixed(2)}`);
const pct = l => Math.round(l * 100);

function cell(row) {
  const reached = row.reachedWave === null ? '@—' : `@w${row.reachedWave}`;
  return `${row.tier} ${mult(row.multiplier).padStart(MULT_WIDTH)} ${String(pct(row.livesKept)).padStart(LIVES_WIDTH)}% ${reached.padEnd(WAVE_WIDTH)}`;
}

export function formatT4Sweep(results) {
  const lines = [];
  for (const { map, baseline, livesMult, rows } of results) {
    lines.push(`Map ${map.id} ${map.name} — baseline ${baseline.label}: ${mult(baseline.multiplier)}, lives at ${mult(livesMult)}`);
    const types = [...new Set(rows.map(r => r.type))];
    for (const type of types) {
      const cells = rows.filter(r => r.type === type).map(cell);
      lines.push(`  ${type.padEnd(TYPE_WIDTH)}  ${cells.join('  ')}`.trimEnd());
    }
    lines.push('');
  }
  lines.push('Legend: lower x = stronger; lives are taken at the baseline\'s win multiplier; @wN is the wave the');
  lines.push('anchor reached its tier, and a row that never reached tier 4 (@—) says nothing about that tier.');
  lines.push('To read it, compare within a row; the baseline is context: every anchor takes the top slot and holds gold');
  lines.push('until it is affordable, so part of the gap from the baseline is that cost.');
  lines.push('Tier-4 abilities (#75) are modelled: 2 arrows, chain, split shells, 2x vs slowed, boss stun, splash slow.');
  return lines;
}
