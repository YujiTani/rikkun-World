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

// 地面が 平らな 場所を さがす（からだの 下 ±45 × 前後 90 の 高さの ちがいが いちばん 小さい 所）
const step = (n) => page.evaluate((n) => window.__rikkun.step(n), n);
const SITE = await page.evaluate(() => {
  const h = window.__rikkun;
  let best = null;
  for (let x = -240; x <= 240; x += 30) for (let z = 100; z <= 300; z += 30) {
    let lo = 1e9, hi = -1e9;
    for (let dx = -48; dx <= 48; dx += 6) for (let dz = -80; dz <= 70; dz += 6) {
      const g = h.world.groundHeight(x + dx, z - 40 + dz);
      lo = Math.min(lo, g); hi = Math.max(hi, g);
    }
    if (!best || hi - lo < best.range) best = { x, z, range: hi - lo };
  }
  return best;
});
console.log('site', JSON.stringify(SITE));
const X0 = SITE.x + 0.5, Z0 = SITE.z + 0.5;
await page.evaluate(([x, z]) => {
  const h = window.__rikkun;
  h.achievements.mute(true); h.lock.simulate(true); h.pause(); h.input.releaseAll();
  h.settings.set('yokaiAutoSpawn', false); h.settings.set('yokaiWander', false); h.yokai.clear(); h.time.set(0);
  const fy = h.world.groundHeight(Math.floor(x), Math.floor(z));
  h.player.set({ position: { x, y: fy + 2, z }, velocity: { x: 0, y: 0, z: 0 }, yaw: 0, pitch: 0 });
}, [X0, Z0]);
await page.evaluate(() => window.__rikkun.step(120));
// 撮影用に 地面を 平らに ならす（からだの まわり。ふだんの ゲームでは しない）
await page.evaluate(([x, z]) => {
  const h = window.__rikkun;
  const base = h.world.groundHeight(Math.floor(x), Math.floor(z - 40));
  h.world.fill(Math.floor(x) - 60, base - 12, Math.floor(z) - 125, Math.floor(x) + 60, base, Math.floor(z) + 110, 'grass');
  h.world.fill(Math.floor(x) - 60, base + 1, Math.floor(z) - 125, Math.floor(x) + 60, base + 30, Math.floor(z) + 110, 'air');
}, [X0, Z0]);
await step(60);
await page.evaluate(() => window.__gashaBig.place());
const info = await page.evaluate(() => window.__gashaBig.info());
console.log('info', JSON.stringify(info));
await page.addStyleTag({ content: '#hud{display:none !important}' });
const put = (x, y, z, yaw, pitch) => page.evaluate(([x, y, z, yaw, pitch]) => window.__rikkun.player.set({ position: { x, y, z }, velocity: { x: 0, y: 0, z: 0 }, yaw, pitch }), [x, y, z, yaw, pitch]);

// 1: 正面から ぜんたい（プレイヤーを うしろに さげる）
const mpos = info.pos;
const fy = await page.evaluate(([x, z]) => window.__rikkun.world.groundHeight(Math.floor(x), Math.floor(z)), [X0, Z0 + Number(process.env.BACK1 ?? 62)]);
// プレイヤーが からだに かぶらないよう、カメラを プレイヤーの 目の 位置に する
await page.evaluate((d) => window.__rikkun.settings.set('thirdPersonDistance', d), Number(process.env.CAM1 ?? 0)); // 0 = プレイヤーが うつらない
const SIDE1 = Number(process.env.SIDE1 ?? 0), BACK = Number(process.env.BACK1 ?? 62);
await put(X0 - SIDE1, fy + 1, Z0 + BACK, (Math.atan2(SIDE1, BACK + 40) * 180) / Math.PI, Number(process.env.PITCH1 ?? 20));
await step(180);
await page.screenshot({ path: join(OUT, 'gasha-big-front.png') });
console.log('shot1', mpos);

// 2: 肩の 雲の 上に プレイヤー
const hits = await page.evaluate(() => window.__gashaBig.colliders().filter((c) => c.name === 'shoulderL').map((c) => ({ c: c.center, h: c.half, a: c.axes })));
const sh = hits[0];
const topY = sh.c[1] + sh.h[1];
const px = sh.c[0] + sh.a[0][0] * sh.h[0] * 0.2, pz = sh.c[2] + sh.a[0][2] * sh.h[0] * 0.2;
await page.evaluate((d) => window.__rikkun.settings.set('thirdPersonDistance', d), Number(process.env.CAM2 ?? 20));
await put(px, topY + 0.05, pz, Number(process.env.YAW2 ?? 0), Number(process.env.PITCH2 ?? -10));
await step(120);
await page.screenshot({ path: join(OUT, 'gasha-big-shoulder.png') });
console.log('shot2 player at', px.toFixed(1), topY.toFixed(1), pz.toFixed(1), 'state', JSON.stringify(await page.evaluate(() => window.__rikkun.player.get().position)));
if (process.env.EXTRA_SHOTS) {
  // 見て 直す 用の 追加の 写真（出力は おなじ フォルダ）
  const mp = info.pos;
  const ground = (x, z) => page.evaluate(([x, z]) => window.__rikkun.world.groundHeight(Math.floor(x), Math.floor(z)) + 1, [x, z]);
  const shotAt = async (name, x, z, yaw, pitch, cam = 4, y) => {
    const gy = y ?? (await ground(x, z));
    await page.evaluate((d) => window.__rikkun.settings.set('thirdPersonDistance', d), cam);
    await put(x, gy, z, yaw, pitch);
    await step(90);
    await page.screenshot({ path: join(OUT, name) });
  };
  await shotAt('x-face.png', mp[0], mp[2] + 40, 0, 25, 4);
  await shotAt('x-back.png', mp[0], mp[2] - 60, 180, 22, 4);
  await shotAt('x-side.png', mp[0] + 90, mp[2] + 5, -90, 15, 4);
  await shotAt('x-hand.png', mp[0] + 33, mp[2] + 62, 0, 10, 8);
  const rb = await page.evaluate(() => window.__gashaBig.colliders().filter((c) => /^ribbonWingL|rampInL|rampOutL|skull/.test(c.name)).map((c) => ({ n: c.name, c: c.center, h: c.half, a: c.axes })));
  const top = (c) => c.c[1] + c.h[1] * Math.abs(c.a[1][1]) + c.h[0] * Math.abs(c.a[0][1]) + c.h[2] * Math.abs(c.a[2][1]) - 0.5;
  const sk = rb.find((c) => c.n === 'skull');
  await shotAt('x-skull.png', sk.c[0], sk.c[2], 200, -20, 14, sk.c[1] + sk.h[1] + 0.5);
  const rw = rb.find((c) => c.n === 'ribbonWingL');
  await shotAt('x-ribbon.png', rw.c[0], rw.c[2], 180, -15, 12, rw.c[1] + rw.h[1] + 0.3);
  void top;
}
await browser.close();
