export class StoryManager {
  constructor(panels) {
    this._panels    = panels;
    this._onDismiss = null;

    const btn = document.getElementById('story-dismiss');
    if (btn) {
      btn.addEventListener('click', () => {
        this.hideBanner();
        if (this._onDismiss) this._onDismiss();
      });
    }
  }

  getPanelForWave(storyKey, waveNum) {
    return this._panels[storyKey]?.waves?.[waveNum] ?? null;
  }

  getUnlockPanel(storyKey) {
    return this._panels[storyKey]?.unlock ?? null;
  }

  showBanner(panel, onDismiss) {
    this._onDismiss = onDismiss;
    document.getElementById('story-headline').textContent = panel.headline;
    document.getElementById('story-body').textContent     = panel.body;
    document.getElementById('story-banner').classList.add('visible');
  }

  hideBanner() {
    document.getElementById('story-banner').classList.remove('visible');
  }
}
