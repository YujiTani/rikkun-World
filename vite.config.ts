import { resolve } from 'node:path';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vite';

/** CHAR-2: 開発サーバーだけ、もとの格子の絵（art/char-sheets/）を /__char-orig/<キャラ>/ で見せる（?charsheets=orig 用） */
const charOrig = (): Plugin => ({
  name: 'char-orig',
  apply: 'serve',
  configureServer(server) {
    server.middlewares.use('/__char-orig', (req, res, next) => {
      const name = (req.url ?? '').split('?')[0]!.replace(/^\//, '');
      if (!/^(girl|boy)\/[A-Za-z_]+\.(png|json)$/.test(name)) return next();
      const file = resolve(import.meta.dirname, 'art/char-sheets', name);
      if (!existsSync(file) || !statSync(file).isFile()) return next();
      res.setHeader('Content-Type', name.endsWith('.png') ? 'image/png' : 'application/json');
      createReadStream(file).pipe(res);
    });
  },
});

export default defineConfig({
  base: './',
  plugins: [charOrig()],
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
        sound: resolve(import.meta.dirname, 'sound.html'),
      },
    },
  },
});
