import { describe, it, expect, beforeEach } from 'vitest';
import { WaveBanner } from './WaveBanner.js';
import { WAVE_BANNER, BOSS_WARNING } from '../data/juice.js';

function mountDom() {
  document.body.innerHTML = `
    <div id="game">
      <div id="wave-banner"></div>
      <div id="wave-banner-boss"></div>
      <div id="boss-frame"></div>
    </div>`;
}
const $ = (id) => document.getElementById(id);

describe('WaveBanner', () => {
  beforeEach(mountDom);

  it('shows the wave text and restarts the animation class', () => {
    const b = new WaveBanner();
    b.show({ waveNum: 2, waveCount: 10, bossType: null });
    expect($('wave-banner').textContent).toBe('Wave 2 / 10');
    expect($('wave-banner').classList.contains('show')).toBe(true);
  });

  it('says Final wave on the last wave', () => {
    new WaveBanner().show({ waveNum: 10, waveCount: 10, bossType: null });
    expect($('wave-banner').textContent).toBe('Final wave');
  });

  it('shows no boss line or frame pulse without a boss', () => {
    new WaveBanner().show({ waveNum: 1, waveCount: 10, bossType: null });
    expect($('wave-banner-boss').classList.contains('show')).toBe(false);
    expect($('boss-frame').classList.contains('show')).toBe(false);
  });

  it('shows a named boss warning and edge pulse', () => {
    new WaveBanner().show({ waveNum: 5, waveCount: 10, bossType: BOSS_WARNING.types[0] });
    expect($('wave-banner-boss').textContent).toMatch(/^⚠ .+ inbound$/);
    expect($('wave-banner-boss').classList.contains('show')).toBe(true);
    expect($('boss-frame').classList.contains('show')).toBe(true);
  });

  it('clears a previous boss warning on a non-boss wave', () => {
    const b = new WaveBanner();
    b.show({ waveNum: 5, waveCount: 10, bossType: BOSS_WARNING.types[0] });
    b.show({ waveNum: 6, waveCount: 10, bossType: null });
    expect($('wave-banner-boss').classList.contains('show')).toBe(false);
    expect($('boss-frame').classList.contains('show')).toBe(false);
  });

  it('feeds durations to CSS from data', () => {
    new WaveBanner();
    expect($('wave-banner').style.getPropertyValue('--wave-banner-ms')).toBe(`${WAVE_BANNER.duration}ms`);
    expect($('boss-frame').style.getPropertyValue('--boss-warning-ms')).toBe(`${BOSS_WARNING.duration}ms`);
    expect($('boss-frame').style.getPropertyValue('--boss-warning-color')).toBe(BOSS_WARNING.color);
    expect($('wave-banner-boss').style.getPropertyValue('--boss-warning-color')).toBe(BOSS_WARNING.color);
  });

  it('is a no-op when the DOM is absent', () => {
    document.body.innerHTML = '';
    expect(() => new WaveBanner().show({ waveNum: 1, waveCount: 3, bossType: 'x' })).not.toThrow();
  });
});
