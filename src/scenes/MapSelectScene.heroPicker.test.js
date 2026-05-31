import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('phaser', () => ({
  default: { Scene: class { constructor(){} events = { on(){} } } },
}));

import MapSelectScene from './MapSelectScene.js';
import { SaveManager } from '../systems/SaveManager.js';

function setupDom() {
  document.body.replaceChildren();
  const picker = document.createElement('div');
  picker.id = 'hero-picker';
  const label = document.createElement('div');
  label.className = 'hero-picker-label';
  label.textContent = 'Commander:';
  const cards = document.createElement('div');
  cards.id = 'hero-picker-cards';
  cards.className = 'hero-picker-cards';
  picker.append(label, cards);
  document.body.appendChild(picker);
}

describe('MapSelectScene._renderHeroPicker', () => {
  let scene, save;

  beforeEach(() => {
    setupDom();
    localStorage.clear();
    save  = new SaveManager();
    scene = new MapSelectScene();
    scene._saveMgr = save;
  });

  it('renders one card per hero in HERO_ORDER', () => {
    scene._renderHeroPicker();
    expect(document.querySelectorAll('.hero-card').length).toBe(4);
  });

  it('Rael is unlocked + active by default', () => {
    scene._renderHeroPicker();
    const rael = document.querySelectorAll('.hero-card')[0];
    expect(rael.classList.contains('locked')).toBe(false);
    expect(rael.classList.contains('active')).toBe(true);
  });

  it('Engineer card is locked when Map 3 (index 2) has 0 stars', () => {
    scene._renderHeroPicker();
    const eng = document.querySelectorAll('.hero-card')[1];
    expect(eng.classList.contains('locked')).toBe(true);
  });

  it('Engineer card unlocks after Map index 2 ≥1 star', () => {
    save.setStars(2, 1);
    scene._renderHeroPicker();
    const eng = document.querySelectorAll('.hero-card')[1];
    expect(eng.classList.contains('locked')).toBe(false);
  });

  it('clicking an unlocked card sets active and calls setSelectedHero', () => {
    save.setStars(2, 1);
    scene._renderHeroPicker();
    const cards = document.querySelectorAll('.hero-card');
    cards[1].click();
    expect(save.getSelectedHero()).toBe('engineer');
    scene._renderHeroPicker();
    expect(document.querySelectorAll('.hero-card')[1].classList.contains('active')).toBe(true);
  });

  it('clicking a locked card is a no-op', () => {
    scene._renderHeroPicker();
    document.querySelectorAll('.hero-card')[1].click();
    expect(save.getSelectedHero()).toBe('rael');
  });
});
