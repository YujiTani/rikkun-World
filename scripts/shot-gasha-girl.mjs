// #293 試作: 少女の 大きさくらべの スクショ・GIF を 撮る（開発サーバー http://localhost:5173 が 動いている こと）
//   node scripts/shot-gasha-girl.mjs [出力フォルダ]
import { chromium } from '@playwright/test';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const OUT = process.argv[2] ?? '/mnt/project-files/gashadokuro/design-v2/girl-size/';
const BASE = process.env.BASE ?? 'http://localhost:5173';
mkdirSync(OUT, { recursive: true });
const work = mkdtempSync(join(process.env.WORK ?? tmpdir(), 'gasha-'));

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on('console', (m) => { if (/proto|error/i.test(m.text())) console.log('[page]', m.text()); });
await page.goto(`${BASE}/?proto=gashaGirl&nosave=1&char=boy`);
await page.waitForFunction(() => window.__rikkun?.ready === true, null, { timeout: 120_000 });
await page.waitForFunction(() => !!window.__gashaGirl, null, { timeout: 60_000 });
// キャラの 絵の 読みこみ待ち（e2e/helpers/char.ts と 同じ）
await page.evaluate(() => window.__rikkun.suspendRender(true));
await page.waitForFunction(() => { window.__rikkun.step(1); return window.__rikkun.player.doll().sprite.loaded === true; }, null, { timeout: 120_000 });
await page.evaluate(() => window.__rikkun.suspendRender(false));

// 昼・一時停止・ひらけた所に 立つ（e2e/helpers/char.ts の openCharWorld と 同じ）
const floorY = await page.evaluate(() => {
  const h = window.__rikkun;
  h.achievements.mute(true);
  h.lock.simulate(true);
  h.pause();
  h.input.releaseAll();
  h.settings.set('yokaiAutoSpawn', false);
  h.settings.set('yokaiWander', false);
  h.yokai.clear();
  h.time.set(0);
  const x = 20.5, z = 40.5;
  const fy = h.world.groundHeight(Math.floor(x), Math.floor(z));
  // 立つ 場所の まわりの 石の ゆかを ならす（少女も のる はんい）
  for (let dx = -12; dx <= 12; dx++) for (let dz = -22; dz <= 12; dz++) {
    h.world.setBlock(Math.floor(x) + dx, fy, Math.floor(z) + dz, 'stone');
    for (let y = fy + 1; y <= fy + 12; y++) h.world.setBlock(Math.floor(x) + dx, y, Math.floor(z) + dz, 'air');
  }
  h.player.set({ position: { x, y: fy + 1, z }, velocity: { x: 0, y: 0, z: 0 }, yaw: 0, pitch: 0 });
  window.__gashaGirl.place({ groundY: fy });
  window.__fy = fy;
  return fy;
});
await page.evaluate(() => window.__rikkun.step(30));
await page.evaluate(() => window.__rikkun.step(30));

async function labels(withRiky = true) {
  await page.evaluate((withRiky) => {
    const h = window.__rikkun;
    const p = h.player.get().position;
    const pts = window.__gashaGirl.labels(p, innerWidth, innerHeight);
    const names = ['2.0', '2.4', '3.0', 'りっくん 1.8'];
    document.getElementById('gg-labels')?.remove();
    const d = document.createElement('div');
    d.id = 'gg-labels';
    d.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:99999;font-family:IPAGothic,sans-serif';
    pts.forEach((q, i) => {
      if (i === 3 && !withRiky) return;
      const e = document.createElement('div');
      e.textContent = names[i];
      e.style.cssText = `position:absolute;left:${q.x}px;top:${q.y}px;transform:translate(-50%,-100%);background:#fff;color:#222;border:3px solid ${i === 3 ? '#e44' : '#36c'};border-radius:10px;padding:2px 12px;font-size:28px;font-weight:bold`;
      d.appendChild(e);
    });
    document.body.appendChild(d);
  }, withRiky);
}
const settle = async () => { await page.evaluate(() => window.__rikkun.step(2)); await page.waitForTimeout(300); };

// 1. 肩ごし（いつもの 三人称）。りっくんが 中の 1 体を かくさないよう、列を 右へ ずらす
await page.evaluate(() => window.__gashaGirl.place({ groundY: window.__fy, shift: 4.4 }));
await settle();
await labels();
await page.screenshot({ path: join(OUT, 'size-3.png') });

// 2. よこから: 少女を 右向きに して よこがおを 見せる（カメラは そのまま）
await page.evaluate(() => window.__gashaGirl.place({ groundY: window.__fy, shift: 4.4, side: true }));
await settle();
await labels();
await page.screenshot({ path: join(OUT, 'size-3-side.png') });
await page.evaluate(() => window.__gashaGirl.place({ groundY: window.__fy, shift: 4.4 }));

// 3. 立ち姿の GIF（約 2 秒・30fps。ゆっくり ゆれるので 1/60 秒を 2 コマずつ）
await settle();
await page.evaluate(() => document.getElementById('gg-labels')?.remove());
for (let i = 0; i < 60; i++) {
  await page.evaluate(() => window.__rikkun.step(2));
  await page.screenshot({ path: join(work, `f${String(i).padStart(3, '0')}.png`) });
}
const pal = join(work, 'pal.png');
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '30', '-i', join(work, 'f%03d.png'), '-vf', 'scale=640:-1:flags=lanczos,palettegen', pal]);
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '30', '-i', join(work, 'f%03d.png'), '-i', pal, '-lavfi', 'scale=640:-1:flags=lanczos[x];[x][1:v]paletteuse', join(OUT, 'stand-ingame.gif')]);
await browser.close();
console.log('done', OUT, 'floorY', floorY, 'frames in', work);
