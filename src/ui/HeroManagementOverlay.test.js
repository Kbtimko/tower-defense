import { describe, it, expect, beforeEach, vi } from 'vitest';
import { HeroManagementOverlay } from './HeroManagementOverlay.js';

function setupDom() {
  while (document.body.firstChild) document.body.removeChild(document.body.firstChild);
  const overlay = document.createElement('div');
  overlay.id = 'hero-mgmt-overlay';
  overlay.style.display = 'none';

  const avail = document.createElement('span');
  avail.id = 'hero-mgmt-avail';
  overlay.appendChild(avail);

  const closeBtn = document.createElement('button');
  closeBtn.id = 'hero-mgmt-close';
  overlay.appendChild(closeBtn);

  const rail = document.createElement('div');
  rail.id = 'hero-rail';
  overlay.appendChild(rail);

  const tree = document.createElement('div');
  tree.id = 'hero-tree';
  overlay.appendChild(tree);

  document.body.appendChild(overlay);
}

function makeMgr() {
  return {
    getAvailableStars:    vi.fn(() => 5),
    getNodeState:         vi.fn(() => 'affordable'),
    getPurchasedUpgrades: vi.fn(() => []),
    purchase:             vi.fn(),
    refund:               vi.fn(),
  };
}

function makeSave({ selected = 'rael', unlocked = ['rael'] } = {}) {
  return {
    getSelectedHero: vi.fn(() => selected),
    setSelectedHero: vi.fn(function (id) { selected = id; }),
    isHeroUnlocked:  vi.fn(id => unlocked.includes(id)),
  };
}

beforeEach(() => setupDom());

describe('HeroManagementOverlay — render', () => {
  it('open() shows overlay and renders 4 cards in HERO_ORDER', () => {
    const ov = new HeroManagementOverlay(makeMgr(), makeSave());
    ov.open();
    expect(document.getElementById('hero-mgmt-overlay').style.display).toBe('flex');
    const cards = document.querySelectorAll('#hero-rail .ho-card');
    expect(cards.length).toBe(4);
    const names = Array.from(cards).map(c => c.querySelector('.ho-card-name').textContent);
    expect(names).toEqual(['Rael', 'Dax', 'Vex', 'Mira']);
  });

  it('initial inspected card matches selected hero (cyan border AND badge)', () => {
    const ov = new HeroManagementOverlay(makeMgr(), makeSave({ selected: 'rael', unlocked: ['rael'] }));
    ov.open();
    const cards = document.querySelectorAll('#hero-rail .ho-card');
    expect(cards[0].classList.contains('inspecting')).toBe(true);
    expect(cards[0].querySelector('.ho-card-badge')).not.toBeNull();
  });

  it('locked cards have .locked + unlock hint + no badge', () => {
    const ov = new HeroManagementOverlay(makeMgr(), makeSave({ selected: 'rael', unlocked: ['rael'] }));
    ov.open();
    const dax = document.querySelectorAll('#hero-rail .ho-card')[1];
    expect(dax.classList.contains('locked')).toBe(true);
    expect(dax.querySelector('.ho-card-unlock').textContent).toBe('Clear Map 3');
    expect(dax.querySelector('.ho-card-badge')).toBeNull();
  });

  it('tree pane renders header + nodes for the inspected hero', () => {
    const ov = new HeroManagementOverlay(makeMgr(), makeSave());
    ov.open();
    const head = document.querySelector('#hero-tree .ho-tree-head h4');
    expect(head.textContent).toBe('Commander Rael');
    const sub = document.querySelector('#hero-tree .ho-tree-head-sub');
    expect(sub.textContent).toBe('Generalist bruiser');
    // Rael has 4 nodes in upgrades.js
    expect(document.querySelectorAll('#hero-tree .upgrade-node').length).toBe(4);
  });

  it('stars header shows "★ X / Y spent on {shortName}" for inspected hero', () => {
    const mgr = makeMgr();
    // Rael branch nodes have costs 2, 3, 4, 6 → total 15. With no purchases, spent = 0.
    mgr.getPurchasedUpgrades = vi.fn(() => []);
    new HeroManagementOverlay(mgr, makeSave()).open();
    const stars = document.querySelector('#hero-tree .ho-tree-head-stars');
    expect(stars.textContent).toBe('★ 0 / 15 spent on Rael');
  });

  it('stars header sums only purchased nodes in the current branch', () => {
    const mgr = makeMgr();
    // Pretend Rael's first two nodes (cost 2 + 3) are purchased; a logistics
    // node is also purchased but must NOT contribute to Rael's branch total.
    mgr.getPurchasedUpgrades = vi.fn(() => ['rael_hp', 'rael_rapid_redeploy', 'log_supply_cache']);
    new HeroManagementOverlay(mgr, makeSave()).open();
    const stars = document.querySelector('#hero-tree .ho-tree-head-stars');
    expect(stars.textContent).toBe('★ 5 / 15 spent on Rael');
  });

  it('available-stars chip reflects getAvailableStars', () => {
    const mgr = makeMgr();
    mgr.getAvailableStars.mockReturnValue(7);
    new HeroManagementOverlay(mgr, makeSave()).open();
    expect(document.getElementById('hero-mgmt-avail').textContent).toBe('⭐ 7 to spend');
  });

  it('close() hides the overlay', () => {
    const ov = new HeroManagementOverlay(makeMgr(), makeSave());
    ov.open();
    ov.close();
    expect(document.getElementById('hero-mgmt-overlay').style.display).toBe('none');
  });

  it('close-button click closes the overlay', () => {
    const ov = new HeroManagementOverlay(makeMgr(), makeSave());
    ov.open();
    document.getElementById('hero-mgmt-close').click();
    expect(document.getElementById('hero-mgmt-overlay').style.display).toBe('none');
  });

  it('close() then open() does not stack close-button listeners', () => {
    const ov = new HeroManagementOverlay(makeMgr(), makeSave());
    ov.open(); ov.close(); ov.open();
    document.getElementById('hero-mgmt-close').click();
    expect(document.getElementById('hero-mgmt-overlay').style.display).toBe('none');
  });
});

describe('HeroManagementOverlay — click semantics', () => {
  it('clicking an unlocked card calls setSelectedHero AND moves the inspecting border', () => {
    const save = makeSave({ selected: 'rael', unlocked: ['rael', 'engineer'] });
    const ov   = new HeroManagementOverlay(makeMgr(), save);
    ov.open();
    document.querySelectorAll('#hero-rail .ho-card')[1].click();
    expect(save.setSelectedHero).toHaveBeenCalledWith('engineer');
    const cards = document.querySelectorAll('#hero-rail .ho-card');
    expect(cards[1].classList.contains('inspecting')).toBe(true);
    expect(cards[0].classList.contains('inspecting')).toBe(false);
  });

  it('clicking an unlocked card moves the ✓ SELECTED badge to that card', () => {
    const save = makeSave({ selected: 'rael', unlocked: ['rael', 'engineer'] });
    const ov   = new HeroManagementOverlay(makeMgr(), save);
    ov.open();
    document.querySelectorAll('#hero-rail .ho-card')[1].click();
    const cards = document.querySelectorAll('#hero-rail .ho-card');
    expect(cards[1].querySelector('.ho-card-badge')).not.toBeNull();
    expect(cards[0].querySelector('.ho-card-badge')).toBeNull();
  });

  it('clicking an unlocked card swaps the tree to that hero', () => {
    const save = makeSave({ selected: 'rael', unlocked: ['rael', 'engineer'] });
    const ov   = new HeroManagementOverlay(makeMgr(), save);
    ov.open();
    document.querySelectorAll('#hero-rail .ho-card')[1].click();
    const head = document.querySelector('#hero-tree .ho-tree-head h4');
    expect(head.textContent).toBe('Engineer Dax');
  });

  it('clicking a locked card does NOT call setSelectedHero', () => {
    const save = makeSave({ selected: 'rael', unlocked: ['rael'] });
    const ov   = new HeroManagementOverlay(makeMgr(), save);
    ov.open();
    document.querySelectorAll('#hero-rail .ho-card')[1].click();
    expect(save.setSelectedHero).not.toHaveBeenCalled();
  });

  it('clicking a locked card switches inspecting border AND tree to that hero', () => {
    const save = makeSave({ selected: 'rael', unlocked: ['rael'] });
    const ov   = new HeroManagementOverlay(makeMgr(), save);
    ov.open();
    document.querySelectorAll('#hero-rail .ho-card')[1].click();
    const cards = document.querySelectorAll('#hero-rail .ho-card');
    expect(cards[1].classList.contains('inspecting')).toBe(true);
    expect(document.querySelector('#hero-tree .ho-tree-head h4').textContent).toBe('Engineer Dax');
  });

  it('clicking a locked card shows the orange unlock banner in the tree', () => {
    const save = makeSave({ selected: 'rael', unlocked: ['rael'] });
    const ov   = new HeroManagementOverlay(makeMgr(), save);
    ov.open();
    document.querySelectorAll('#hero-rail .ho-card')[1].click();
    const banner = document.querySelector('#hero-tree .ho-tree-banner');
    expect(banner).not.toBeNull();
    expect(banner.textContent).toContain('Clear Map 3');
    expect(banner.textContent).toContain('Engineer Dax');
  });

  it('the ✓ SELECTED badge stays on Rael when inspecting a locked hero', () => {
    const save = makeSave({ selected: 'rael', unlocked: ['rael'] });
    const ov   = new HeroManagementOverlay(makeMgr(), save);
    ov.open();
    document.querySelectorAll('#hero-rail .ho-card')[1].click();
    const cards = document.querySelectorAll('#hero-rail .ho-card');
    expect(cards[0].querySelector('.ho-card-badge')).not.toBeNull();
    expect(cards[1].querySelector('.ho-card-badge')).toBeNull();
  });

  it('open() always resets _inspectedHeroId to the selected hero', () => {
    const save = makeSave({ selected: 'rael', unlocked: ['rael'] });
    const ov   = new HeroManagementOverlay(makeMgr(), save);
    ov.open();
    document.querySelectorAll('#hero-rail .ho-card')[1].click();  // inspect locked engineer
    ov.close();
    ov.open();
    const cards = document.querySelectorAll('#hero-rail .ho-card');
    expect(cards[0].classList.contains('inspecting')).toBe(true);
    expect(cards[1].classList.contains('inspecting')).toBe(false);
  });
});
