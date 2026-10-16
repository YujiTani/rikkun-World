import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: { port: 5173 },
  build: {
    // main.ts は 起動で IndexedDB の保存を待つ（トップレベル await）
    target: 'es2022',
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
