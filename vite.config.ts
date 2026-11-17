import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  publicDir: 'public',

  build: {
    outDir: 'dist',
    emptyOutDir: true,

    rollupOptions: {
      input: {
        background: resolve(import.meta.dirname, 'src/extension/background.ts'),
        content: resolve(import.meta.dirname, 'src/extension/content.ts'),
        offscreen: resolve(import.meta.dirname, 'offscreen.html'),
        preview: resolve(import.meta.dirname, 'preview.html'),
      },

      output: {
        entryFileNames: 'assets/[name].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name][extname]',
      },
    },
  },
});
