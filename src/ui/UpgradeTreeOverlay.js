import { UPGRADES } from '../data/upgrades.js';
// HEROES satisfies renderUpgradeNode's signature; logistics/arsenal nodes
// carry no heroUnlock, so the helper's locked-hero branch never fires here.
import { HEROES }   from '../data/heroes.js';
import { renderUpgradeNode } from './upgradeNode.js';

const BRANCHES = [
  { id: 'logistics', title: 'Logistics', subtitle: 'Economy' },
  { id: 'arsenal',   title: 'Arsenal',   subtitle: 'Towers & soldiers' },
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
        col.appendChild(renderUpgradeNode(node, this._mgr, HEROES, () => this._render()));
      }
      this._tree.appendChild(col);
    }
  }
}
