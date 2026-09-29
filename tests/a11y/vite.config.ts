import { defineConfig } from 'vite';
import { resolve } from 'node:path';

// Standalone build of the real side panel (no crx plugin) for a11y audits.
// Root is src/ so the HTML's ../ui/styles.css link stays inside the root.
export default defineConfig({
  root: resolve(__dirname, '..', '..', 'src'),
  base: './',
  // The vendored runtime assets (MathLive fonts, SRE mathmaps) live in the
  // repo-root public/ (populated by scripts/copy-mathlive-assets.mjs, run by
  // the pretest hook), so the audited page is served with the same assets as
  // the real extension.
  publicDir: resolve(__dirname, '..', '..', 'public'),
  build: {
    outDir: resolve(__dirname, 'dist'),
    emptyOutDir: true,
    rollupOptions: { input: resolve(__dirname, '..', '..', 'src', 'sidepanel', 'index.html') },
  },
});
