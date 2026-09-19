import { facingDirX, FACING_DEADZONE_PX } from './facing.js';
import { MAPS } from '../data/maps.js';
import { PathManager } from './PathManager.js';
import { ENEMY_DEFS } from '../data/enemies.js';

describe('facingDirX', () => {
  it('passes a rightward delta through once it clears the deadzone', () => {
    expect(facingDirX(20)).toBe(20);
  });

  it('passes a leftward delta through once it clears the deadzone', () => {
    expect(facingDirX(-20)).toBe(-20);
  });

  it('reports "no change" for deltas inside the deadzone', () => {
    // 0 is EntitySprite.setFacing's existing "keep current facing" signal, so
    // suppression needs no new branch at the call site.
    expect(facingDirX(3)).toBe(0);
    expect(facingDirX(-3)).toBe(0);
    expect(facingDirX(0)).toBe(0);
  });

  it('treats a delta exactly at the deadzone as a real direction', () => {
    expect(facingDirX(FACING_DEADZONE_PX)).toBe(FACING_DEADZONE_PX);
    expect(facingDirX(-FACING_DEADZONE_PX)).toBe(-FACING_DEADZONE_PX);
  });

  it('accepts an explicit deadzone', () => {
    expect(facingDirX(5, 4)).toBe(5);
    expect(facingDirX(5, 40)).toBe(0);
  });
});

// Replay of GameScene's movement + facing loop. Enemies pass a PIXEL delta
// (Hero passes a ±1 unit, which is why the deadzone lives at this call site
// and not inside EntitySprite.setFacing).
function countFacingChanges(map, def, { deadzone } = {}) {
  const path = new PathManager(map.waypoints, map.towerSlots, 1280, 720).path;
  let x = path[0].x, y = path[0].y, wi = 0, facing = 0, changes = 0;
  const dt = 1 / 60;
  for (let f = 0; wi < path.length - 1 && f < 100000; f++) {
    let rem = def.speed * dt;
    while (rem > 0 && wi < path.length - 1) {
      const t = path[wi + 1], dx = t.x - x, dy = t.y - y, d = Math.hypot(dx, dy);
      if (d <= rem) { x = t.x; y = t.y; wi++; rem -= d; }
      else { x += (dx / d) * rem; y += (dy / d) * rem; rem = 0; }
    }
    const raw = path[Math.min(wi + 1, path.length - 1)].x - x;
    const dirX = deadzone === undefined ? raw : facingDirX(raw, deadzone);
    if (dirX !== 0) {
      const next = dirX < 0 ? -1 : 1;
      if (next !== facing) { facing = next; changes++; }
    }
  }
  return changes;
}

describe('enemy facing across the shipped maps', () => {
  // Every shipped path runs left->right overall, so a drone should settle on
  // "facing right" exactly once and never mirror again.
  it.each(MAPS.map(m => [m.id, m.name, m]))(
    'map %i (%s) sets facing once and never flips again',
    (_id, _name, map) => {
      expect(countFacingChanges(map, ENEMY_DEFS.drone, { deadzone: FACING_DEADZONE_PX })).toBe(1);
    },
  );

  it('without the deadzone, hairpin bends cause repeated mirror flips', () => {
    // Guards the regression: Catmull-Rom sampling backtracks 13-26px at tight
    // bends, which is a real leftward delta, so a longer look-ahead does not
    // fix it -- only ignoring small deltas does.
    const worst = Math.max(...MAPS.map(m => countFacingChanges(m, ENEMY_DEFS.drone)));
    expect(worst).toBeGreaterThan(1);
  });
});
