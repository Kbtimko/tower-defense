export function starsDisplay(n) {
  return '★'.repeat(n) + '☆'.repeat(3 - n);
}

export function formatDuration(ms) {
  const total = Number.isFinite(ms) && ms > 0 ? Math.floor(ms / 1000) : 0;
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

export function formatCount(n) {
  return Number.isFinite(n) ? Math.round(n).toLocaleString('en-US') : '0';
}
