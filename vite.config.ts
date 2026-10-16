import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: { port: 5173 },
  build: {
    // 本体と、妖怪の見本ページ（preview.html）の両方を出す
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        preview: resolve(import.meta.dirname, 'preview.html'),
        voxelProto: resolve(import.meta.dirname, 'voxel-proto.html'),
      },
    },
  },
});
