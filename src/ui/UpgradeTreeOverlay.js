import { UPGRADES } from '../data/upgrades.js';

const BRANCHES = [
  { key: 'command',   label: 'Command'   },
  { key: 'logistics', label: 'Logistics' },
  { key: 'arsenal',   label: 'Arsenal'   },
];

export class UpgradeTreeOverlay {
  constructor(upgradeMgr) {
    this._mgr      = upgradeMgr;
    this._overlay  = document.getElementById('upgrade-overlay');
    this._tree     = document.getElementById('upgrade-tree');
    this._avail    = document.getElementById('upgrade-available');
    this._closeBtn = document.getElementById('upgrade-close');
    this._onClose  = () => this.close();
  }

  open() {
    this._closeBtn.addEventListener('click', this._onClose);
    this._overlay.style.display = 'flex';
    this._render();
  }

  close() {
    this._closeBtn.removeEventListener('click', this._onClose);
    this._overlay.style.display = 'none';
  }

  _render() {
    this._avail.textContent = `Available: ${this._mgr.getAvailableStars()}★`;
    this._tree.replaceChildren();
    for (const branch of BRANCHES) {
      const col = document.createElement('div');
      col.className = 'upgrade-branch';
      const heading = document.createElement('h3');
      heading.textContent = branch.label;
      col.appendChild(heading);
      for (const node of UPGRADES.filter(u => u.branch === branch.key)) {
        col.appendChild(this._renderNode(node));
      }
      this._tree.appendChild(col);
    }
  }

  _renderNode(node) {
    const state = this._mgr.getNodeState(node.id);
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

    if (state === 'affordable') {
      el.addEventListener('click', () => {
        this._mgr.purchase(node.id);
        this._render();
      });
    } else if (state === 'purchased') {
      const refund = document.createElement('button');
      refund.className   = 'upgrade-node-refund';
      refund.textContent = 'Refund';
      refund.addEventListener('click', (e) => {
        e.stopPropagation();
        this._mgr.refund(node.id);
        this._render();
      });
      el.appendChild(refund);
    }

    return el;
  }
}
