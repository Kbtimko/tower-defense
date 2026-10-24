// Deferred-asset slot for the world-map far layer (spec 4.4). BootScene stores the
// art URL in the registry when the file loaded, or false when it 404'd; until the
// art exists the renderer draws the whole vista procedurally.
export function worldBackdropSource(registered) {
  return typeof registered === 'string' && registered ? registered : 'procedural';
}
