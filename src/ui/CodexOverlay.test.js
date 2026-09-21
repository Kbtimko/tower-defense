import { describe, it, expect, beforeEach } from 'vitest';
import { CodexOverlay } from './CodexOverlay.js';
import { buildCatalog } from '../systems/codexCatalog.js';
import { HERO_ORDER } from '../data/heroes.js';
import { TOWER_DEFS } from '../data/towers.js';
import { ENEMY_DEFS } from '../data/enemies.js';

const FRESH = { reachedMapIds: [0], unlockedHeroIds: ['rael'] };
const ALL   = { reachedMapIds: [0,1,2,3,4,5,6,7,8,9], unlockedHeroIds: [...HERO_ORDER] };

function setupDom() {
  document.body.replaceChildren();
  const overlay = document.createElement('div');
  overlay.id = 'codex-overlay';
  overlay.style.display = 'none';
  const tabs = document.createElement('div');
  tabs.id = 'codex-tabs';
  for (const t of ['towers', 'heroes', 'enemies']) {
    const b = document.createElement('button');
    b.className = 'codex-tab';
    b.dataset.tab = t;
    tabs.appendChild(b);
  }
  const list   = document.createElement('div'); list.id   = 'codex-list';
  const detail = document.createElement('div'); detail.id = 'codex-detail';
  const close  = document.createElement('button'); close.id = 'codex-close';
  overlay.append(tabs, list, detail, close);
  document.body.appendChild(overlay);
  return { overlay, tabs, list, detail, close };
}

describe('CodexOverlay', () => {
  let dom, codex;
  beforeEach(() => { dom = setupDom(); codex = new CodexOverlay(); });

  it('opens on the towers tab and lists all six towers', () => {
    codex.open(buildCatalog(ALL));
    expect(dom.overlay.style.display).toBe('flex');
    // Derived, not hardcoded: a hardcoded 6 would silently stop catching a
    // new tower being added without a codex entry.
    expect(dom.list.querySelectorAll('.codex-entry').length).toBe(Object.keys(TOWER_DEFS).length);
  });

  it('switches tabs', () => {
    codex.open(buildCatalog(ALL));
    dom.tabs.querySelector('[data-tab="enemies"]').dispatchEvent(new Event('click', { bubbles: true }));
    expect(dom.list.querySelectorAll('.codex-entry').length).toBe(Object.keys(ENEMY_DEFS).length);
    expect(dom.list.textContent).toContain('Veth Drone');
  });

  // The decision: dim, tag, but never hide or disable.
  it('dims unencountered entries but keeps them readable and clickable', () => {
    codex.open(buildCatalog(FRESH));
    dom.tabs.querySelector('[data-tab="enemies"]').dispatchEvent(new Event('click', { bubbles: true }));
    const entries = [...dom.list.querySelectorAll('.codex-entry')];
    const titan = entries.find(e => e.textContent.includes('Titan'));
    expect(titan.classList.contains('codex-unseen')).toBe(true);
    expect(titan.textContent).toContain('Veth Titan');
    expect(titan.disabled).toBeFalsy();
    titan.dispatchEvent(new Event('click', { bubbles: true }));
    expect(dom.detail.textContent).toContain('Veth Titan');
  });

  it('marks nothing unseen at full progress', () => {
    codex.open(buildCatalog(ALL));
    dom.tabs.querySelector('[data-tab="heroes"]').dispatchEvent(new Event('click', { bubbles: true }));
    expect(dom.list.querySelectorAll('.codex-unseen').length).toBe(0);
  });

  it('shows the selected entry detail with stats', () => {
    codex.open(buildCatalog(ALL));
    dom.tabs.querySelector('[data-tab="enemies"]').dispatchEvent(new Event('click', { bubbles: true }));
    const brute = [...dom.list.querySelectorAll('.codex-entry')].find(e => e.textContent.includes('Brute'));
    brute.dispatchEvent(new Event('click', { bubbles: true }));
    // Derived from balance data, not a bare '120' literal (which would also
    // be a weak substring match against unrelated text).
    expect(dom.detail.textContent).toContain(String(ENEMY_DEFS.brute.hp));
  });

  it('renders the tier ladder for a tower', () => {
    codex.open(buildCatalog(ALL));
    const archer = [...dom.list.querySelectorAll('.codex-entry')].find(e => e.textContent.includes('Archer'));
    archer.dispatchEvent(new Event('click', { bubbles: true }));
    expect(dom.detail.textContent).toContain('Eagle Eye');
    expect(dom.detail.textContent).toContain('Marksman');
  });

  // The barracks deals 0 damage; a blank damage row would read as a bug.
  it('renders soldier stats for the barracks instead of a damage row', () => {
    codex.open(buildCatalog(ALL));
    const b = [...dom.list.querySelectorAll('.codex-entry')].find(e => e.textContent.includes('Barracks'));
    b.dispatchEvent(new Event('click', { bubbles: true }));
    expect(dom.detail.textContent.toLowerCase()).toContain('soldier');
    expect(dom.detail.textContent).not.toMatch(/Damage:\s*0\b/);
  });

  it('renders hero abilities on a hero entry', () => {
    codex.open(buildCatalog(ALL));
    dom.tabs.querySelector('[data-tab="heroes"]').dispatchEvent(new Event('click', { bubbles: true }));
    const rael = [...dom.list.querySelectorAll('.codex-entry')].find(e => e.textContent.includes('Rael'));
    rael.dispatchEvent(new Event('click', { bubbles: true }));
    expect(dom.detail.textContent).toContain('Overcharge');
    expect(dom.detail.textContent).toContain('EMP Pulse');
  });

  it('opens directly on a requested tab and entry', () => {
    codex.open(buildCatalog(ALL), { initialTab: 'enemies', initialEntry: 'phantom' });
    expect(dom.detail.textContent).toContain('Veth Phantom');
  });

  it('closes on the close button, on backdrop click, and on Escape', () => {
    codex.open(buildCatalog(ALL));
    dom.close.dispatchEvent(new Event('click', { bubbles: true }));
    expect(dom.overlay.style.display).toBe('none');

    codex.open(buildCatalog(ALL));
    dom.overlay.dispatchEvent(new Event('click', { bubbles: true }));
    expect(dom.overlay.style.display).toBe('none');

    codex.open(buildCatalog(ALL));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(dom.overlay.style.display).toBe('none');
  });

  it('calls onClose when it closes', () => {
    let closed = 0;
    codex.open(buildCatalog(ALL), { onClose: () => closed++ });
    codex.close();
    expect(closed).toBe(1);
  });

  it('removes every listener on close', () => {
    codex.open(buildCatalog(ALL));
    codex.close();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    dom.close.dispatchEvent(new Event('click', { bubbles: true }));
    expect(dom.overlay.style.display).toBe('none');
  });

  it('is idempotent when opened twice', () => {
    codex.open(buildCatalog(ALL));
    codex.open(buildCatalog(ALL));
    expect(dom.list.querySelectorAll('.codex-entry').length).toBe(Object.keys(TOWER_DEFS).length);
  });

  // _renderList reruns on every tab switch and rebinds one click listener
  // per entry button. Those buttons are discarded by replaceChildren, so a
  // stale listener can't fire through the live DOM — but this project has
  // already shipped one listener leak that doubled enemy spawns on replay,
  // so prove teardown actually happens rather than assume it from the code.
  it('does not leave a stale listener on a discarded entry button after a tab switch', () => {
    codex.open(buildCatalog(ALL));
    const staleArcherBtn = [...dom.list.querySelectorAll('.codex-entry')].find(e => e.textContent.includes('Archer'));
    dom.tabs.querySelector('[data-tab="enemies"]').dispatchEvent(new Event('click', { bubbles: true }));
    staleArcherBtn.dispatchEvent(new Event('click', { bubbles: true }));
    expect(dom.detail.textContent).not.toContain('Archer');
  });

  // Design decision: every entry is always listed (dim, never hidden), so a
  // genuinely empty tab only happens for a malformed/partial catalog. Cover
  // it anyway rather than let the list silently render blank.
  it('shows an empty-state message instead of a blank list for an empty tab', () => {
    expect(() => codex.open({ towers: [], heroes: [], enemies: [] })).not.toThrow();
    expect(dom.list.querySelector('.wp-empty')).toBeTruthy();
    expect(dom.detail.textContent).toBe('');
  });

  it('does not throw when opened with a null catalog', () => {
    expect(() => codex.open(null)).not.toThrow();
    expect(dom.list.querySelector('.wp-empty')).toBeTruthy();
  });

  it('close() before open() does not throw, and neither does operating with no codex markup in the DOM', () => {
    document.body.replaceChildren();
    const bare = new CodexOverlay();
    expect(() => bare.close()).not.toThrow();
    expect(() => bare.open(buildCatalog(ALL))).not.toThrow();
    expect(() => bare.close()).not.toThrow();
  });
});
