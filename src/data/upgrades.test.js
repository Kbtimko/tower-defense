import { UPGRADES } from './upgrades.js';

describe('UPGRADES catalog', () => {
  it('has 13 nodes', () => {
    expect(UPGRADES).toHaveLength(13);
  });

  it('every id is unique', () => {
    const ids = UPGRADES.map(u => u.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every non-null `requires` points to a real id in the same branch', () => {
    const byId = new Map(UPGRADES.map(u => [u.id, u]));
    for (const node of UPGRADES) {
      if (node.requires === null) continue;
      const parent = byId.get(node.requires);
      expect(parent, `${node.id} requires missing ${node.requires}`).toBeDefined();
      expect(parent.branch).toBe(node.branch);
    }
  });

  it('each branch has exactly one root (requires === null)', () => {
    for (const branch of ['command', 'logistics', 'arsenal']) {
      const roots = UPGRADES.filter(u => u.branch === branch && u.requires === null);
      expect(roots).toHaveLength(1);
    }
  });

  it('starThreshold is present only on the three deep nodes, all set to 15', () => {
    const gated = UPGRADES.filter(u => u.starThreshold != null);
    expect(gated.map(u => u.id).sort()).toEqual(
      ['ars_overcharge', 'cmd_elite', 'log_garrison'],
    );
    for (const node of gated) expect(node.starThreshold).toBe(15);
  });

  it('catalog total cost is 45', () => {
    expect(UPGRADES.reduce((s, u) => s + u.cost, 0)).toBe(45);
  });
});
