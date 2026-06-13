// Pure DOM-builder for a single upgrade node. Shared by UpgradeTreeOverlay
// and HeroManagementOverlay so both render nodes identically.
//
// Args:
//   node      — the upgrade def (from src/data/upgrades.js)
//   upgradeMgr — UpgradeManager instance (must expose getNodeState/purchase/refund)
//   heroDefs   — HEROES registry (for the locked-hero unlock tooltip)
//   onChange   — invoked after purchase or refund so the caller can re-render
//
// Returns: a <div class="upgrade-node {state}"> ready to append.
export function renderUpgradeNode(node, upgradeMgr, heroDefs, onChange) {
  const state = upgradeMgr.getNodeState(node.id);
  const el = document.createElement('div');
  el.className = `upgrade-node ${state}`;

  const name = document.createElement('div');
  name.className   = 'upgrade-node-name';
  name.textContent = node.name;

  const fx = document.createElement('div');
  fx.className   = 'upgrade-node-fx';
  fx.textContent = node.effect;

  const cost = document.createElement('div');
  cost.className   = 'upgrade-node-cost';
  cost.textContent = `${node.cost}★`;

  el.append(name, fx, cost);

  if (state === 'locked-threshold') {
    const gate = document.createElement('div');
    gate.className   = 'upgrade-node-gate';
    gate.textContent = `Needs ${node.starThreshold}★ earned`;
    el.appendChild(gate);
  }

  if (state === 'locked-hero') {
    const heroDef = heroDefs[node.heroUnlock];
    el.title = `🔒 Locked — Clear Map ${heroDef.unlockMapAfter + 1} to unlock ${heroDef.displayName}`;
  }

  if (state === 'affordable') {
    el.addEventListener('click', () => {
      upgradeMgr.purchase(node.id);
      onChange();
    });
  } else if (state === 'purchased') {
    const refund = document.createElement('button');
    refund.className   = 'upgrade-node-refund';
    refund.textContent = 'Refund';
    refund.addEventListener('click', (e) => {
      e.stopPropagation();
      upgradeMgr.refund(node.id);
      onChange();
    });
    el.appendChild(refund);
  }

  return el;
}
