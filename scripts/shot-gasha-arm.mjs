// #293 試作 段 1: がしゃどくろ大の 腕の 形の スクショ（休みの 姿勢 3 方向）と 前進 1 歩の GIF。開発サーバー http://localhost:5173 が 動いて いること
//   node scripts/shot-gasha-arm.mjs <出力フォルダ> <before|after>   → <before|after>-front/side/top.png と（GIF=1 で）<名前>-step.gif
//   開発サーバーは shot-gasha-big.mjs の 冒頭の 環境変数で 立てる
import { chromium } from '@playwright/test';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';

const OUT = process.argv[2] ?? '/mnt/project-files/gashadokuro/arm4/';
const NAME = process.argv[3] ?? 'after';
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
const S = Number(process.env.DIST ?? 55);
// 正面（からだの 前から）
await put(mp[0], (await gh(mp[0], mp[2] + S)) + 1, mp[2] + S, 0, Number(process.env.PF ?? 5)); await step(30);
await page.screenshot({ path: join(OUT, `${NAME}-front.png`) });
// 横（からだの 左がわ。+x）
await put(mp[0] + S, (await gh(mp[0] + S, mp[2])) + 1, mp[2], -90, Number(process.env.PS ?? 5)); await step(30);
await page.screenshot({ path: join(OUT, `${NAME}-side.png`) });
// ななめ上（前・左・高い 所から 見おろす）
{
  const tx = mp[0] + S * 0.7, tz = mp[2] + S * 1.0, H = Number(process.env.TOPH ?? 30);
  const g = await tower(tx, tz, H);
  const yaw = (Math.atan2(-(tx - mp[0]), tz - mp[2]) * 180) / Math.PI;
  await put(tx, g + 1, tz, yaw, Number(process.env.PT ?? -20)); await step(30);
  await page.screenshot({ path: join(OUT, `${NAME}-top.png`) });
}
if (process.env.GIF) {
  const work = mkdtempSync(join(tmpdir(), 'armgif-'));
  const cx = mp[0] + S * 0.55, cz = mp[2] + S * 0.9;
  await put(cx, (await gh(cx, cz)) + 1, cz, (Math.atan2(-(cx - mp[0]), cz - mp[2]) * 180) / Math.PI, 8);
  await page.evaluate(() => window.__gashaBig.walk(true));
  const N = Number(process.env.GIF_FRAMES ?? 150), K = Number(process.env.GIF_EVERY ?? 4);
  for (let i = 0; i < N; i++) {
    await step(K);
    await page.screenshot({ path: join(work, `f${String(i).padStart(3, '0')}.png`) });
  }
  const pal = join(work, 'pal.png');
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(60 / K), '-i', join(work, 'f%03d.png'), '-vf', 'scale=640:-1:flags=lanczos,palettegen', pal]);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(60 / K), '-i', join(work, 'f%03d.png'), '-i', pal, '-lavfi', 'scale=640:-1:flags=lanczos[x];[x][1:v]paletteuse', join(OUT, `${NAME}-step.gif`)]);
}
await browser.close();
