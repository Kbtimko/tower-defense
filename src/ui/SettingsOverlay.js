const CHANNELS = [
  { id: 'master', input: 'vol-master', val: 'vol-master-val', setter: 'setMasterVolume', key: 'masterVol' },
  { id: 'sfx',    input: 'vol-sfx',    val: 'vol-sfx-val',    setter: 'setSfxVolume',    key: 'sfxVol'    },
  { id: 'music',  input: 'vol-music',  val: 'vol-music-val',  setter: 'setMusicVolume',  key: 'musicVol'  },
];

export class SettingsOverlay {
  constructor(audioManager, game = null) {
    this._am        = audioManager;
    this._game      = game;
    this._overlay   = document.getElementById('settings-overlay');
    this._closeBtn  = document.getElementById('settings-close');
    this._mute      = document.getElementById('mute-all');
    this._listeners = [];
    this._onClose   = () => this.close();
    this._onBackdrop = (e) => { if (e.target === this._overlay) this.close(); };
    this._onEsc     = (e) => { if (e.key === 'Escape') this.close(); };
  }

  open() {
    if (this._overlay.style.display === 'flex') return;
    const s = this._am.getSettings();
    for (const ch of CHANNELS) {
      const input = document.getElementById(ch.input);
      const valEl = document.getElementById(ch.val);
      const pct = Math.round(s[ch.key] * 100);
      input.value         = String(pct);
      valEl.textContent   = String(pct);
      const handler = (e) => {
        const v = Number(e.target.value);
        valEl.textContent = String(v);
        this._am[ch.setter](v / 100);
      };
      input.addEventListener('input', handler);
      this._listeners.push({ el: input, evt: 'input', fn: handler });
    }
    this._mute.checked = s.muted;
    const muteHandler = (e) => this._am.setMuted(e.target.checked);
    this._mute.addEventListener('change', muteHandler);
    this._listeners.push({ el: this._mute, evt: 'change', fn: muteHandler });
    const ambientCb = document.getElementById('ambient-motion');
    if (this._game && ambientCb) {
      ambientCb.checked = this._game.registry.get('ambientMotion') !== false;
      const ambientHandler = (e) => {
        const v = e.target.checked;
        this._game.registry.set('ambientMotion', v);
        this._game.registry.get('save')?.setSettings({ ambientMotion: v });
      };
      ambientCb.addEventListener('change', ambientHandler);
      this._listeners.push({ el: ambientCb, evt: 'change', fn: ambientHandler });
    }
    this._closeBtn.addEventListener('click', this._onClose);
    this._overlay.addEventListener('click', this._onBackdrop);
    document.addEventListener('keydown', this._onEsc);
    this._overlay.style.display = 'flex';
  }

  close() {
    for (const l of this._listeners) l.el.removeEventListener(l.evt, l.fn);
    this._listeners = [];
    this._closeBtn.removeEventListener('click', this._onClose);
    this._overlay.removeEventListener('click', this._onBackdrop);
    document.removeEventListener('keydown', this._onEsc);
    this._overlay.style.display = 'none';
  }
}
