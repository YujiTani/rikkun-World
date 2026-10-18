// BOOK-1 挿絵を 作りなおす: ゲームの コードから 素材と キーの 割り当てを 書き出し → 40 まいを 組む。
//   node docs/art/book-1/tools/build_book_art.mjs            （public/book/ に 書く）
//   node docs/art/book-1/tools/build_book_art.mjs <出す フォルダ> [id ...]
// 素材は node_modules/.cache/book-art/ に 置く（コミットしない）。Chromium は Playwright の物を使う。
import { createServer } from 'vite';
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../../..');
const cache = resolve(root, 'node_modules/.cache/book-art');
const out = resolve(root, process.argv[2] ?? 'public/book');
mkdirSync(cache, { recursive: true });

const server = await createServer({ root, configFile: resolve(root, 'vite.config.ts'), server: { port: 0, strictPort: false }, logLevel: 'error' });
await server.listen();
const url = server.resolvedUrls.local[0];
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.error('ERR', e.message));
  await page.goto(url + 'docs/art/book-1/tools/export.html');
  await page.waitForFunction(() => window.__bookAssets, null, { timeout: 60_000 });
  const a = await page.evaluate(() => window.__bookAssets);
  for (const [k, u] of Object.entries(a.png)) writeFileSync(resolve(cache, k + '.png'), Buffer.from(u.split(',')[1], 'base64'));
  writeFileSync(resolve(cache, 'bindings.json'), JSON.stringify(a.bindings, null, 1));
  console.log(`素材 ${Object.keys(a.png).length} こ → ${cache}`);
} finally {
  await browser.close();
  await server.close();
}
execFileSync('python3', [resolve(here, 'compose_book_art.py'), cache, out, ...process.argv.slice(3)], { stdio: 'inherit' });
