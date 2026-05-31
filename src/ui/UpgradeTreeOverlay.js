import { UPGRADES } from '../data/upgrades.js';
import { HEROES }   from '../data/heroes.js';

const BRANCHES = [
  { id: 'rael',      title: 'Commander Rael',  subtitle: 'Generalist bruiser' },
  { id: 'engineer',  title: 'Engineer Dax',    subtitle: 'Support / builder' },
  { id: 'scout',     title: 'Scout Vex',       subtitle: 'Ranged DPS / anti-air' },
  { id: 'pyro',      title: 'Pyromancer Mira', subtitle: 'AoE / burn' },
  { id: 'logistics', title: 'Logistics',       subtitle: 'Economy' },
  { id: 'arsenal',   title: 'Arsenal',         subtitle: 'Towers & soldiers' },
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
      heading.textContent = branch.title;
      const sub = document.createElement('div');
      sub.className   = 'upgrade-branch-subtitle';
      sub.textContent = branch.subtitle;
      col.appendChild(heading);
      col.appendChild(sub);
      for (const node of UPGRADES.filter(u => u.branch === branch.id)) {
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

    if (state === 'locked-hero') {
      el.classList.add('locked-hero');
      const heroDef = HEROES[node.heroUnlock];
      el.title = `🔒 Locked — clear Map ${heroDef.unlockMapAfter + 1} to unlock ${heroDef.displayName}`;
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
