// #293 試作: 大きい がしゃどくろ（?proto=gashaBig）の スクショを 2 枚（正面から ぜんたい／肩の 雲の 上の プレイヤー）。開発サーバー http://localhost:5173 が 動いて いること
//   node scripts/shot-gasha-big.mjs [出力フォルダ]
//   開発サーバーは playwright.config.ts の webServer と おなじ 環境変数で 立てる:
//   VITE_START_MENU=off VITE_SHADOW_DEFAULT=off VITE_MICRO_DEFAULT=off VITE_FRAME_CLOCK=count VITE_RING_DEFAULT=small npx vite --port 5173 --strictPort
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const OUT = process.argv[2] ?? '/mnt/project-files/gashadokuro/design-big/';
const BASE = process.env.BASE ?? 'http://localhost:5173';
const EXTRA = process.env.EXTRA ?? '';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1000, height: 700 } });
page.on('console', (m) => { if (/proto|error/i.test(m.text())) console.log('[page]', m.text()); });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(`${BASE}/?proto=gashaBig&nosave=1&char=boy&ring=full${EXTRA}`);
await page.waitForFunction(() => window.__rikkun?.ready === true, null, { timeout: 120_000 });
await page.waitForFunction(() => !!window.__gashaBig, null, { timeout: 60_000 });
await page.evaluate(() => window.__rikkun.suspendRender(true));
await page.waitForFunction(() => { window.__rikkun.step(1); return window.__rikkun.player.doll().sprite.loaded === true; }, null, { timeout: 120_000 });
await page.evaluate(() => window.__rikkun.suspendRender(false));

const X0 = 20.5, Z0 = 140.5;
await page.evaluate(([x, z]) => {
  const h = window.__rikkun;
  h.achievements.mute(true); h.lock.simulate(true); h.pause(); h.input.releaseAll();
  h.settings.set('yokaiAutoSpawn', false); h.settings.set('yokaiWander', false); h.yokai.clear(); h.time.set(0);
  const fy = h.world.groundHeight(Math.floor(x), Math.floor(z));
  h.player.set({ position: { x, y: fy + 2, z }, velocity: { x: 0, y: 0, z: 0 }, yaw: 0, pitch: 0 });
}, [X0, Z0]);
await page.evaluate(() => window.__rikkun.step(120));
await page.evaluate(() => window.__gashaBig.place());
const info = await page.evaluate(() => window.__gashaBig.info());
console.log('info', JSON.stringify(info));
await page.addStyleTag({ content: '#hud{display:none !important}' });
const step = (n) => page.evaluate((n) => window.__rikkun.step(n), n);
const put = (x, y, z, yaw, pitch) => page.evaluate(([x, y, z, yaw, pitch]) => window.__rikkun.player.set({ position: { x, y, z }, velocity: { x: 0, y: 0, z: 0 }, yaw, pitch }), [x, y, z, yaw, pitch]);

// 1: 正面から ぜんたい（プレイヤーを うしろに さげる）
const mpos = info.pos;
const fy = await page.evaluate(([x, z]) => window.__rikkun.world.groundHeight(Math.floor(x), Math.floor(z)), [X0, Z0 + Number(process.env.BACK1 ?? 60)]);
await put(X0, fy + 1, Z0 + Number(process.env.BACK1 ?? 60), 0, Number(process.env.PITCH1 ?? 12));
await step(180);
await page.screenshot({ path: join(OUT, 'gasha-big-front.png') });
console.log('shot1', mpos);

// 2: 肩の 雲の 上に プレイヤー
const hits = await page.evaluate(() => window.__gashaBig.colliders().filter((c) => c.name === 'shoulderL').map((c) => ({ c: c.center, h: c.half, a: c.axes })));
const sh = hits[0];
const topY = sh.c[1] + sh.h[1];
const px = sh.c[0] + sh.a[0][0] * sh.h[0] * 0.2, pz = sh.c[2] + sh.a[0][2] * sh.h[0] * 0.2;
await page.evaluate((d) => window.__rikkun.settings.set('thirdPersonDistance', d), Number(process.env.CAM2 ?? 4));
await put(px, topY + 0.05, pz, Number(process.env.YAW2 ?? 150), Number(process.env.PITCH2 ?? -5));
await step(120);
await page.screenshot({ path: join(OUT, 'gasha-big-shoulder.png') });
console.log('shot2 player at', px.toFixed(1), topY.toFixed(1), pz.toFixed(1), 'state', JSON.stringify(await page.evaluate(() => window.__rikkun.player.get().position)));
await browser.close();
