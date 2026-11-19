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
  lines.push('Caveat (#75): most tier-4 abilities are text only (chain lightning, 2 arrows, split shells,');
  lines.push('frozen 2x, ignores armour, boss stun), and mage 4B and ice 4B apply no slow because a splash');
  lines.push('shot skips it. The sweep measures the tiers as the game plays them today.');
  return lines;
}
