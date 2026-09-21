import { describe, it, expect, beforeEach, vi } from 'vitest';
import { HeroManagementOverlay } from './HeroManagementOverlay.js';
import { HEROES } from '../data/heroes.js';

function setupDom() {
  document.body.replaceChildren();

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

  // AbilityTooltip writes into this shared element, same as the in-level HUD.
  const card = document.createElement('div');
  card.id = 'ability-card';
  document.body.appendChild(card);
}

// Must satisfy every call renderUpgradeNode makes (see upgradeNode.js):
// getNodeState, purchase, refund; plus getAvailableStars/getPurchasedUpgrades
// used directly by the overlay.
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
    getStars:        vi.fn(() => 0),
  };
}

beforeEach(() => setupDom());

const cardText  = () => document.getElementById('ability-card').textContent;
const cardShown = () => document.getElementById('ability-card').classList.contains('shown');

describe('HeroManagementOverlay — ability reference strip', () => {
  it('renders three ability rows with labels for the inspected hero', () => {
    const ov = new HeroManagementOverlay(makeMgr(), makeSave());
    ov.open();

    const rows = document.querySelectorAll('#hero-tree .ho-ability');
    expect(rows.length).toBe(3);
    expect(rows[0].textContent).toContain(HEROES.rael.abilities.q.label);
    expect(rows[1].textContent).toContain(HEROES.rael.abilities.w.label);
    expect(rows[2].textContent).toContain(HEROES.rael.abilities.e.label);
  });

  it('hovering a row shows the card with that ability effect text', () => {
    const ov = new HeroManagementOverlay(makeMgr(), makeSave());
    ov.open();

    const rows = document.querySelectorAll('#hero-tree .ho-ability');
    rows[0].dispatchEvent(new Event('pointerenter'));

    expect(cardShown()).toBe(true);
    expect(cardText()).toContain(HEROES.rael.abilities.q.tooltip);
  });

  it('for a locked hero, the card shows the hero unlock condition rather than a level requirement', () => {
    const save = makeSave({ selected: 'rael', unlocked: ['rael'] });
    const ov   = new HeroManagementOverlay(makeMgr(), save);
    ov.open();

    // Engineer (index 1 in HERO_ORDER) is locked in this fixture.
    document.querySelectorAll('#hero-rail .ho-card')[1].click();
    const rows = document.querySelectorAll('#hero-tree .ho-ability');
    rows[0].dispatchEvent(new Event('pointerenter'));

    expect(cardText()).toContain(`Clear Map ${HEROES.engineer.unlockMapAfter + 1}`);
    expect(cardText()).not.toContain('Unlocks at level');
  });

  it('tooltips are detached on close()', () => {
    const ov = new HeroManagementOverlay(makeMgr(), makeSave());
    ov.open();

    const row = document.querySelectorAll('#hero-tree .ho-ability')[0];
    ov.close();
    row.dispatchEvent(new Event('pointerenter'));

    expect(cardShown()).toBe(false);
  });

  it('re-rendering (e.g. inspecting a different hero) does not stack duplicate listeners', () => {
    const save = makeSave({ selected: 'rael', unlocked: ['rael', 'engineer'] });
    const ov   = new HeroManagementOverlay(makeMgr(), save);
    ov.open();

    const afterFirst = ov._abilityTip._listeners.length;
    expect(afterFirst).toBeGreaterThan(0);

    // _render() runs again on every rail click — the exact shape of the past
    // listener-leak bug if the strip forgot to detach before re-attaching.
    document.querySelectorAll('#hero-rail .ho-card')[1].click();
    const afterSecond = ov._abilityTip._listeners.length;

    expect(afterSecond).toBe(afterFirst);
  });
});
