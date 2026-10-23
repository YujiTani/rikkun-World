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

/** #293 試作: 開発サーバーだけ、少女の GLB の フォルダを /__proto-gasha/ で見せる（試作のブランチだけ proto-assets/ に置く。マージ前に消す） */
const protoGasha = (): Plugin => ({
  name: 'proto-gasha',
  apply: 'serve',
  configureServer(server) {
    server.middlewares.use('/__proto-gasha', (req, res, next) => {
      const name = (req.url ?? '').split('?')[0]!.replace(/^\//, '');
      // 手元（yuzu の Mac）は リポジトリの proto-assets/、クラウドは 共有フォルダ。ファイルが なければ next()（音なし・絵なしで 動く）
      let candidates: string[];
      let type: string;
      if (/^girl-rig\/[A-Za-z_-]+\.glb$/.test(name)) {
        candidates = [resolve(import.meta.dirname, 'proto-assets', name), resolve('/mnt/project-files/gashadokuro/design-v2/', name)];
        type = 'model/gltf-binary';
      } else if (/^bgm\/[A-Za-z_-]+\.mp3$/.test(name)) {
        candidates = [resolve(import.meta.dirname, 'proto-assets', name), resolve('/mnt/project-files/gashadokuro/', name)]; // BGM は リポジトリに 入れない（.gitignore）
        type = 'audio/mpeg';
      } else return next();
      const file = candidates.find((f) => existsSync(f) && statSync(f).isFile());
      if (!file) return next();
      res.setHeader('Content-Type', type);
      createReadStream(file).pipe(res);
    });
  },
});

export default defineConfig({
  base: './',
  plugins: [charOrig(), protoGasha()],
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
