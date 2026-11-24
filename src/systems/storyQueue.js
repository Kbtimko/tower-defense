// A wave-start can skip past several story waves when spawn groups merge, so
// return everything owed up to throughWave rather than one exact-match panel.
export function dueStoryPanels(panels, storyKey, throughWave, shown) {
  const waves = panels[storyKey]?.waves ?? {};
  return Object.keys(waves)
    .map(Number)
    .filter(wave => wave <= throughWave && !shown.has(wave))
    .sort((a, b) => a - b)
    .map(wave => ({ wave, panel: waves[wave] }));
}
