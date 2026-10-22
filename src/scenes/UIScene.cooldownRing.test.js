vi.mock('phaser', () => ({
  default: { Scene: class { constructor(key) { this._key = key; } }, GameObjects: { Container: class {} } },
}));

import { describe, it, expect, beforeEach } from 'vitest';
import UIScene from './UIScene.js';

const btn = () => document.getElementById('ability-q');
const cd  = () => btn().style.getPropertyValue('--cd');

describe('UIScene ability cooldown ring (--cd)', () => {
  let scene;
  beforeEach(() => {
    document.body.innerHTML = '<button id="ability-q"><span class="ability-cd"></span></button>';
    scene = Object.create(UIScene.prototype);
  });

  it('captures the first non-zero value as max and sweeps remaining/max', () => {
    scene._setAbilityCd('ability-q', 30);
    expect(Number(cd())).toBe(1);
    scene._setAbilityCd('ability-q', 15);
    expect(Number(cd())).toBe(0.5);
    expect(btn().disabled).toBe(true);
    expect(btn().querySelector('.ability-cd').textContent).toBe('15s');
  });

  it('clears --cd at 0 and re-captures a new max next cooldown', () => {
    scene._setAbilityCd('ability-q', 30);
    scene._setAbilityCd('ability-q', 0);
    expect(cd()).toBe('');
    expect(btn().disabled).toBe(false);
    scene._setAbilityCd('ability-q', 10);
    scene._setAbilityCd('ability-q', 5);
    expect(Number(cd())).toBe(0.5);
  });

  it('tracks slots independently', () => {
    document.body.insertAdjacentHTML('beforeend', '<button id="ability-w"><span class="ability-cd"></span></button>');
    scene._setAbilityCd('ability-q', 30);
    scene._setAbilityCd('ability-w', 20);
    scene._setAbilityCd('ability-q', 15);
    scene._setAbilityCd('ability-w', 10);
    expect(Number(cd())).toBe(0.5);
    expect(Number(document.getElementById('ability-w').style.getPropertyValue('--cd'))).toBe(0.5);
  });
});
