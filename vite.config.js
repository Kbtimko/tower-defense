import { defineConfig } from 'vite';
import thirdPartyNotices, { stripGplPolyfill } from './scripts/vitePluginNotices.mjs';

export default defineConfig({
  plugins: [stripGplPolyfill(), thirdPartyNotices()],
  test: {
    environment: 'jsdom',
    globals: true,
  },
});
