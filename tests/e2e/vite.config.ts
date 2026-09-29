import { defineConfig } from 'vite';
import { resolve } from 'node:path';

// Standalone build of the e2e harness (no extension plugins).
export default defineConfig({
  root: resolve(__dirname),
  base: './',
  // Serve the vendored runtime assets (MathLive fonts) exactly as the real
  // extension does; populated by the pretest copy-assets hook.
  publicDir: resolve(__dirname, '..', '..', 'public'),
  build: {
    outDir: resolve(__dirname, 'dist'),
    emptyOutDir: true,
    rollupOptions: { input: resolve(__dirname, 'harness.html') },
  },
});
