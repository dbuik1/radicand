import { defineConfig } from 'vite';
import { crx } from '@crxjs/vite-plugin';
import manifest from './src/manifest.config';

/**
 * Vite + @crxjs/vite-plugin build for the Manifest V3 extension.
 *
 * We deliberately keep the build simple and dependency-light: no UI
 * framework, MathLive bundled locally, and the heavy Speech Rule Engine is
 * dynamically imported so it is split into its own chunk and lazy-loaded.
 */
export default defineConfig({
  plugins: [crx({ manifest })],
  build: {
    target: 'es2022',
    // The main chunk carries MathLive (~870 kB minified), which cannot be
    // split further – the field IS the app. The limit accommodates it while
    // still flagging unexpected growth elsewhere.
    chunkSizeWarningLimit: 1000,
    // No source maps in the shipped extension: they multiply the package size
    // several-fold and end users never consume them. Re-enable locally when
    // debugging a production build.
    sourcemap: false,
    rollupOptions: {
      onwarn(warning, defaultHandler) {
        // SRE's only `eval` is `eval("require")` inside a Node-require shim
        // that is guarded behind environment detection (`documentSupported` /
        // `typeof process`). In the extension (a browser context) that branch
        // is never reached, so it cannot trip Manifest V3's CSP at runtime.
        // The warning is therefore a false positive for our usage; suppress it
        // only for SRE so genuine eval warnings elsewhere still surface.
        if (warning.code === 'EVAL' && /speech-rule-engine/.test(warning.id ?? '')) {
          return;
        }
        defaultHandler(warning);
      },
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
});
