import { defineConfig } from 'vite';
import legacy from '@vitejs/plugin-legacy';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [legacy({ targets: ['defaults', 'not IE 11'] })],
  build: {
    manifest: true,
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: resolve(__dirname, 'src/index/index.js'),
        session: resolve(__dirname, 'src/session/session.js'),
        live: resolve(__dirname, 'src/live/live.js')
      }
    }
  }
});
