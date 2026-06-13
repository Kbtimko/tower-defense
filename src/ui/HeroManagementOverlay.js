import { HEROES, HERO_ORDER }  from '../data/heroes.js';
import { UPGRADES }            from '../data/upgrades.js';
import { renderUpgradeNode }   from './upgradeNode.js';

function toCssColor(hex) {
  return '#' + ('000000' + hex.toString(16)).slice(-6);
}

export class HeroManagementOverlay {
  constructor(upgradeMgr, saveMgr) {
    this._mgr      = upgradeMgr;
    this._save     = saveMgr;
    this._overlay  = document.getElementById('hero-mgmt-overlay');
    this._rail     = document.getElementById('hero-rail');
    this._tree     = document.getElementById('hero-tree');
    this._avail    = document.getElementById('hero-mgmt-avail');
    this._closeBtn = document.getElementById('hero-mgmt-close');
    this._onClose  = () => this.close();
    this._inspectedHeroId = null;
  }

  open() {
    this._inspectedHeroId = this._save.getSelectedHero();
    this._closeBtn.addEventListener('click', this._onClose);
    this._overlay.style.display = 'flex';
    this._render();
  }

  close() {
    this._closeBtn.removeEventListener('click', this._onClose);
    this._overlay.style.display = 'none';
  }

  _render() {
    this._avail.textContent = `⭐ ${this._mgr.getAvailableStars()} to spend`;
    this._renderRail();
    this._renderTree(this._inspectedHeroId);
  }

  _renderRail() {
    this._rail.replaceChildren();
    // committedHeroId = who drops into the next match (single source: SaveManager).
    // Distinct from this._inspectedHeroId, which is local to this overlay (whose
    // tree is currently shown). They diverge whenever the player previews a locked hero.
    const committedHeroId = this._save.getSelectedHero();
    for (const heroId of HERO_ORDER) {
      const def      = HEROES[heroId];
      const unlocked = this._save.isHeroUnlocked(heroId);

      const card = document.createElement('div');
      card.className = 'ho-card';
      if (heroId === this._inspectedHeroId) card.classList.add('inspecting');
      if (!unlocked) card.classList.add('locked');

      const portrait = document.createElement('div');
      portrait.className   = 'ho-card-portrait';
      if (unlocked) {
        portrait.style.background = toCssColor(def.bodyColor);
        portrait.style.border     = `2px solid ${toCssColor(def.strokeColor)}`;
        portrait.style.color      = toCssColor(def.strokeColor);
        portrait.textContent      = def.portraitChar;
      } else {
        portrait.style.background = '#222';
        portrait.style.border     = '2px solid #444';
        portrait.style.color      = '#666';
        portrait.textContent      = '🔒';
      }

      const meta = document.createElement('div');
      meta.className = 'ho-card-meta';
      const nameEl = document.createElement('div');
      nameEl.className   = 'ho-card-name';
      nameEl.textContent = def.shortName;
      const roleEl = document.createElement('div');
      roleEl.className   = 'ho-card-role';
      roleEl.textContent = def.role;
      meta.append(nameEl, roleEl);
      if (!unlocked && def.unlockMapAfter != null) {
        const unlockEl = document.createElement('div');
        unlockEl.className   = 'ho-card-unlock';
        unlockEl.textContent = `Clear Map ${def.unlockMapAfter + 1}`;
        meta.appendChild(unlockEl);
      }

      card.append(portrait, meta);

      if (unlocked && heroId === committedHeroId) {
        const badge = document.createElement('div');
        badge.className   = 'ho-card-badge';
        badge.textContent = '✓ SELECTED';
        card.appendChild(badge);
      }

      card.addEventListener('click', () => {
        if (unlocked) this._save.setSelectedHero(heroId);
        this._inspectedHeroId = heroId;
        this._render();
      });

      this._rail.appendChild(card);
    }
  }

  _renderTree(heroId) {
    const def = HEROES[heroId];
    this._tree.replaceChildren();

    const head = document.createElement('div');
    head.className = 'ho-tree-head';
    const h4 = document.createElement('h4');
    h4.textContent       = def.displayName;
    h4.style.color       = toCssColor(def.strokeColor);
    const sub = document.createElement('span');
    sub.className   = 'ho-tree-head-sub';
    sub.textContent = def.role;
    const stars = document.createElement('span');
    stars.className   = 'ho-tree-head-stars';
    stars.textContent = this._branchStarsLabel(heroId);
    head.append(h4, sub, stars);
    this._tree.appendChild(head);

    if (!this._save.isHeroUnlocked(heroId)) {
      const banner = document.createElement('div');
      banner.className   = 'ho-tree-banner';
      banner.textContent = `🔒 Clear Map ${def.unlockMapAfter + 1} to unlock ${def.displayName}`;
      this._tree.appendChild(banner);
    }

    for (const node of UPGRADES.filter(u => u.branch === heroId)) {
      this._tree.appendChild(renderUpgradeNode(node, this._mgr, HEROES, () => this._render()));
    }
  }

  _branchStarsLabel(heroId) {
    const branchNodes = UPGRADES.filter(u => u.branch === heroId);
    const totalCost   = branchNodes.reduce((s, n) => s + n.cost, 0);
    const purchased   = new Set(this._mgr.getPurchasedUpgrades());
    const spent       = branchNodes
      .filter(n => purchased.has(n.id))
      .reduce((s, n) => s + n.cost, 0);
    return `★ ${spent} / ${totalCost} spent on ${HEROES[heroId].shortName}`;
  }
}
