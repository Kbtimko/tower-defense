import { armourRowLabel } from '../systems/armourLegibility.js';

// Floored rows (every shot lands exactly 1) get their own class so they read as
// worse than merely heavy absorption; the tower inspector and branch peeks share it.
export function appendArmourRows(parent, rows) {
  rows.forEach((row, i) => {
    const span = document.createElement('span');
    span.className = row.band === 'floored' ? 'ar-floor' : 'ar-heavy';
    span.textContent = armourRowLabel(row);
    parent.appendChild(span);
    if (i < rows.length - 1) parent.appendChild(document.createTextNode(' · '));
  });
}
