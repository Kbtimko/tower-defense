import { defineConfig } from 'vite';
import thirdPartyNotices from './scripts/vitePluginNotices.mjs';

export default defineConfig({
  plugins: [thirdPartyNotices()],
  test: {
    environment: 'jsdom',
    globals: true,
  },
});
