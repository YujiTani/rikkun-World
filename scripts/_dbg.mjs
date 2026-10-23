// #293 試作: 少女の「ワープ → 詠唱 → 魔法 4 種」の GIF・スクショを 撮る（開発サーバー http://localhost:5173 が 動いている こと）
//   node scripts/shot-gasha-warp.mjs [出力フォルダ]
import { chromium } from '@playwright/test';
import { copyFileSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const OUT = process.argv[2] ?? '/mnt/project-files/gashadokuro/design-v2/girl-warp/';
const BASE = process.env.BASE ?? 'http://localhost:5173';
const ONLY = (process.env.ONLY ?? '1,2,3,4').split(',').map(Number);
mkdirSync(OUT, { recursive: true });
const work = mkdtempSync(join(process.env.WORK ?? tmpdir(), 'dbg-'));

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 800, height: 500 } });
page.on('console', (m) => { if (/proto|error/i.test(m.text())) console.log('[page]', m.text()); });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(`${BASE}/?proto=gashaGirl&nosave=1&char=boy`);
await page.waitForFunction(() => window.__rikkun?.ready === true, null, { timeout: 120_000 });
await page.waitForFunction(() => !!window.__gashaGirl, null, { timeout: 60_000 });
await page.evaluate(() => window.__rikkun.suspendRender(true));
await page.waitForFunction(() => { window.__rikkun.step(1); return window.__rikkun.player.doll().sprite.loaded === true; }, null, { timeout: 120_000 });
await page.evaluate(() => window.__rikkun.suspendRender(false));

const X0 = 20.5, Z0 = 40.5;
const floorY = await page.evaluate(([x, z]) => {
  const h = window.__rikkun;
  h.achievements.mute(true); h.lock.simulate(true); h.pause(); h.input.releaseAll();
  h.settings.set('yokaiAutoSpawn', false); h.settings.set('yokaiWander', false); h.yokai.clear(); h.time.set(0);
  const fy = h.world.groundHeight(Math.floor(x), Math.floor(z));
  for (let dx = -16; dx <= 16; dx++) for (let dz = -26; dz <= 14; dz++) {
    h.world.setBlock(Math.floor(x) + dx, fy, Math.floor(z) + dz, 'stone');
    for (let y = fy + 1; y <= fy + 14; y++) h.world.setBlock(Math.floor(x) + dx, y, Math.floor(z) + dz, 'air');
  }
  h.player.set({ position: { x, y: fy + 1, z }, velocity: { x: 0, y: 0, z: 0 }, yaw: 0, pitch: 0 });
  window.__gashaGirl.camera('overview');
  return fy;
}, [X0, Z0]);
await page.evaluate(() => window.__rikkun.step(60));

await page.addStyleTag({ content: '#hud{display:none !important}' });

const info = () => page.evaluate(() => window.__gashaGirl.info());
const step = (n) => page.evaluate((n) => window.__rikkun.step(n), n);
await page.evaluate(() => { window.__gashaGirl.setSeed(103); window.__gashaGirl.nextSpell(3); window.__gashaGirl.warpNow(); });
for (let g = 0; g < 600; g++) { const k = await info(); if (k.fireballs > 2) break; await step(2); }
console.log(JSON.stringify(await info()));
await step(2);
await page.screenshot({ path: join(work, 'd.png') });
console.log(work);
await browser.close();
