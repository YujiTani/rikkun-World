// 使い方: node capture.mjs <w> [pal]  → frames/<name>/0000.png …（1/60 秒の 固定ステップを 1 コマずつ）
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const [, , w = 'raijin', pal = 'yellow', only] = process.argv;
const name = w;
const types = { '.js': 'text/javascript', '.html': 'text/html', '.json': 'application/json', '.png': 'image/png' };
const srv = http.createServer((q, r) => { const f = path.join(root, decodeURIComponent(q.url.split('?')[0])); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); r.end(d); } }); }).listen(0);
const port = srv.address().port;
const out = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'frames2', name); fs.rmSync(out, { recursive: true, force: true }); fs.mkdirSync(out, { recursive: true });
const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const pg = await (await b.newContext({ deviceScaleFactor: 2, viewport: { width: (w === "fujin" || w === "niji") ? 900 : 750, height: 700 } })).newPage();
pg.on('console', m => { if (m.type() === 'error') console.log('console:', m.text()); }); pg.on('pageerror', e => console.log('pageerror:', e.message));
await pg.goto(`http://localhost:${port}/art/LEGEND-FX/proto/index2.html?w=${w}&pal=${pal}`); await pg.waitForFunction('window.READY', null, { timeout: 60000 });
await pg.waitForTimeout(500);
const total = await pg.evaluate('window.TOTAL'); const list = only ? only.split(',').map(Number) : [...Array(total).keys()];
for (const i of list) { await pg.evaluate(i => window.frame(i), i); await pg.locator('body').screenshot({ path: path.join(out, String(i).padStart(4, '0') + '.png') }); }
console.log(name, 'frames', list.length); await b.close(); srv.close();
