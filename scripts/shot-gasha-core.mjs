// #293 試作: がしゃどくろ大の 心臓の コア・背中の 穴の スクショ（背中の 穴を 外から／道の 中から コアを 見る／体を 半分に 切った 断面）。開発サーバー http://localhost:5173 が 動いて いること
//   node scripts/shot-gasha-core.mjs <出力フォルダ>   → core-back-hole.png / core-tunnel.png / core-section.png
//   開発サーバーは shot-gasha-big.mjs の 冒頭の 環境変数で 立てる
import { chromium } from '@playwright/test';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';

const OUT = process.argv[2] ?? '/mnt/project-files/gashadokuro/arm4/';
const NAME = 'core';
const BASE = process.env.BASE ?? 'http://localhost:5173';
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1000, height: 700 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(`${BASE}/?proto=gashaBig&nosave=1&char=boy&ring=full`);
await page.waitForFunction(() => window.__rikkun?.ready === true && !!window.__gashaBig, null, { timeout: 120_000 });
await page.evaluate(() => window.__rikkun.suspendRender(true));
await page.waitForFunction(() => { window.__rikkun.step(1); return window.__rikkun.player.doll().sprite.loaded === true; }, null, { timeout: 120_000 });
await page.evaluate(() => window.__rikkun.suspendRender(false));
const step = (n) => page.evaluate((n) => window.__rikkun.step(n), n);
const X0 = 0.5, Z0 = 200.5;
await page.evaluate(([x, z]) => {
  const h = window.__rikkun;
  h.achievements.mute(true); h.lock.simulate(true); h.pause(); h.input.releaseAll();
  h.settings.set('yokaiAutoSpawn', false); h.settings.set('yokaiWander', false); h.yokai.clear(); h.time.set(0);
  h.player.set({ position: { x, y: h.world.groundHeight(Math.floor(x), Math.floor(z)) + 2, z }, velocity: { x: 0, y: 0, z: 0 }, yaw: 0, pitch: 0 });
}, [X0, Z0]);
await step(30);
await page.evaluate(([x, z]) => {
  const h = window.__rikkun;
  const base = h.world.groundHeight(Math.floor(x), Math.floor(z - 40));
  h.world.fill(Math.floor(x) - 90, base - 12, Math.floor(z) - 130, Math.floor(x) + 90, base, Math.floor(z) + 130, 'grass');
  h.world.fill(Math.floor(x) - 90, base + 1, Math.floor(z) - 130, Math.floor(x) + 90, base + 60, Math.floor(z) + 130, 'air');
}, [X0, Z0]);
await step(60);
await page.evaluate(() => window.__gashaBig.place());
const info = await page.evaluate(() => window.__gashaBig.info());
console.log('info', JSON.stringify(info));
await page.evaluate(() => window.__gashaBig.walk(false));
await page.addStyleTag({ content: '#hud,#gashaBigHp{display:none !important}' });
await page.evaluate(() => window.__rikkun.settings.set('thirdPersonDistance', 0));
const mp = info.pos;
const put = (x, y, z, yaw, pitch) => page.evaluate(([x, y, z, yaw, pitch]) => window.__rikkun.player.set({ position: { x, y, z }, velocity: { x: 0, y: 0, z: 0 }, yaw, pitch }), [x, y, z, yaw, pitch]);
const gh = (x, z) => page.evaluate(([x, z]) => window.__rikkun.world.groundHeight(Math.floor(x), Math.floor(z)), [x, z]);
const tower = async (x, z, h) => { // 見る 場所に 石の 柱（ななめ上 用）
  await page.evaluate(([x, z, h]) => { const w = window.__rikkun.world; const g = w.groundHeight(Math.floor(x), Math.floor(z)); w.fill(Math.floor(x) - 1, g, Math.floor(z) - 1, Math.floor(x) + 1, g + h, Math.floor(z) + 1, 'stone'); }, [x, z, h]);
  return (await gh(x, z));
};
const col = await page.evaluate(() => window.__gashaBig.colliders().filter((c) => c.name === 'core' || c.name === 'chestCoreFloor').map((c) => ({ n: c.name, c: c.center, h: c.half, a: c.axes })));
const core = col.find((c) => c.n === 'core'), flo = col.find((c) => c.n === 'chestCoreFloor');
const yawOf = (lx, lz) => (Math.atan2(lx, -lz) * 180) / Math.PI;
// 1: 背中の 穴を 外から（体の うしろの 高い 所から。穴の 入り口の 床の だんの うしろ）
{
  const ax = flo.a[2], out = flo.h[2] + Number(process.env.OUT1 ?? 9); // 床の うしろの はし から この ブロック うしろ
  const tx = flo.c[0] - ax[0] * out, tz = flo.c[2] - ax[2] * out, H = Math.ceil(flo.c[1] + 3 - (await gh(tx, tz)) - 1);
  const g = await tower(tx, tz, Math.max(2, H));
  const tgt = [core.c[0], flo.c[1] + 1, core.c[2]];
  const yaw = yawOf(tgt[0] - tx, tgt[2] - tz);
  await put(tx, g + 1, tz, yaw, Number(process.env.P1 ?? 0)); await step(30);
  await page.screenshot({ path: join(OUT, `${NAME}-back-hole.png`) });
}
// 2: 道の 中から コアを 見る（道の 床に 立って コアを むく）
{
  const az = core.a[2], ay = core.a[1];
  const sx = core.c[0] - az[0] * 3.4 - ay[0] * 1.8, sy = core.c[1] - az[1] * 3.4 - ay[1] * 1.8, sz = core.c[2] - az[2] * 3.4 - ay[2] * 1.8;
  await put(sx, sy + 0.5, sz, yawOf(az[0], az[2]), Number(process.env.P2 ?? -28)); await step(40);
  await page.screenshot({ path: join(OUT, `${NAME}-tunnel.png`) });
  // 入り口ちかく（うしろを むいて 穴の 外の あかりを 見る）
  const ex = core.c[0] - az[0] * 7.5 - ay[0] * 1.8, ey = core.c[1] - az[1] * 7.5 - ay[1] * 1.8, ez = core.c[2] - az[2] * 7.5 - ay[2] * 1.8;
  await put(ex, ey + 0.5, ez, yawOf(az[0], az[2]), Number(process.env.P2 ?? -28)); await step(40);
  await page.screenshot({ path: join(OUT, `${NAME}-tunnel-mouth.png`) });
}
// 3: 体を 半分に 切った 断面（左がわを けして、前の ななめ 左から 見る）
{
  await page.evaluate(() => window.__gashaBig.section(true));
  const tx = core.c[0] + core.a[2][0] * Number(process.env.F3 ?? 20) + core.a[0][0] * Number(process.env.S3 ?? 14), tz = core.c[2] + core.a[2][2] * Number(process.env.F3 ?? 20) + core.a[0][2] * Number(process.env.S3 ?? 14);
  await put(tx, (await gh(tx, tz)) + 1, tz, yawOf(core.c[0] - tx, core.c[2] - tz), Number(process.env.P3 ?? 22)); await step(40);
  await page.screenshot({ path: join(OUT, `${NAME}-section.png`) });
}
await browser.close();
