import { defineConfig } from 'vite';
import { resolve } from 'node:path';

// Dev pages (live-dev.html, ui-dev.html) are served by the dev server but kept
// out of the production build: only index.html ships.
export default defineConfig({
  server: { port: Number(process.env.PORT) || 5173 },
  worker: { format: 'es' },
  build: {
    target: 'es2022',
    // three.js is one 705 kB (181 kB gzip) chunk; it loads only for the jar
    // and is prefetched while the intro plays, so the warning is expected
    chunkSizeWarningLimit: 750,
    rollupOptions: { input: { main: resolve(import.meta.dirname, 'index.html') } },
  },
});
