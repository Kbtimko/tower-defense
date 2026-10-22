import { WAVE_BANNER, BOSS_WARNING } from '../data/juice.js';
import { waveBannerText } from '../systems/juiceMath.js';
import { ENEMY_DEFS } from '../data/enemies.js';
import { pulseClass } from './pulse.js';

// Top-centre "Wave N / M" banner plus an optional boss warning. Everything is
// CSS-animated and ends at opacity 0, so there are no timers to clean up and
// the elements are pointer-events: none (see index.html). The boss edge pulse
// lives on its own #boss-frame element: #game::after already belongs to the
// life-loss pulse and two animations on one pseudo-element would clobber.
export class WaveBanner {
  constructor() {
    this._banner = document.getElementById('wave-banner');
    this._boss = document.getElementById('wave-banner-boss');
    this._frame = document.getElementById('boss-frame');
    // Durations come from data/juice.js; CSS reads them via custom properties.
    this._banner?.style.setProperty('--wave-banner-ms', `${WAVE_BANNER.duration}ms`);
    this._boss?.style.setProperty('--boss-warning-ms', `${BOSS_WARNING.duration}ms`);
    this._frame?.style.setProperty('--boss-warning-ms', `${BOSS_WARNING.duration}ms`);
  }

  show({ waveNum, waveCount, bossType }) {
    if (this._banner) {
      this._banner.textContent = waveBannerText(waveNum, waveCount);
      pulseClass(this._banner, 'show');
    }
    if (bossType) {
      const name = ENEMY_DEFS[bossType]?.name ?? bossType;
      if (this._boss) {
        this._boss.textContent = `⚠ ${name} inbound`;
        pulseClass(this._boss, 'show');
      }
      pulseClass(this._frame, 'show');
    } else {
      // A boss wave's animation may still be running when the next wave starts.
      this._boss?.classList.remove('show');
      this._frame?.classList.remove('show');
    }
  }
}
