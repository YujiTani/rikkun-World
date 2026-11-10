/**
 * はっぱ・たけの 試しを ゲームの 中で 撮る。
 * 使い方: 先に `npm run dev`（ポート 5173）。`node scripts/leaf-bamboo-shots.mjs`
 */
import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const OUT = 'docs/art/LEAF-BAMBOO/shots';
const BASE = 'http://127.0.0.1:5173/';
const TREE = { x: 70.5, y: 157.2, z: 57.5 };
const BAMBOO = { x: 40.5, z: 79.5 };

const jobs = [
  { name: 'leaf-current', query: 'leaf=current&bamboo=current', at: 'tree' },
  { name: 'leaf-shell', query: 'leaf=shell&bamboo=current', at: 'tree' },
  { name: 'leaf-cross', query: 'leaf=cross&bamboo=current', at: 'tree' },
  { name: 'bamboo-current', query: 'leaf=current&bamboo=current', at: 'bamboo' },
  { name: 'bamboo-voxel', query: 'leaf=current&bamboo=voxel', at: 'bamboo' },
  { name: 'bamboo-sprite', query: 'leaf=current&bamboo=sprite', at: 'bamboo' },
];

function cams(at, ground) {
  if (at === 'tree') {
    return [
      { id: 'close', x: 75.2, y: 156.4, z: 62.4, tx: TREE.x, ty: TREE.y, tz: TREE.z },
      { id: 'mid', x: 84, y: 162, z: 70, tx: TREE.x, ty: 156.5, tz: TREE.z },
      { id: 'far', x: 108, y: 172, z: 90, tx: TREE.x, ty: 156, tz: TREE.z },
    ];
  }
  const y = ground + 2.2;
  return [
    { id: 'close', x: BAMBOO.x + 3.2, y: y + 1.2, z: BAMBOO.z + 3.2, tx: BAMBOO.x, ty: y + 1.5, tz: BAMBOO.z },
    { id: 'mid', x: BAMBOO.x + 8, y: y + 4, z: BAMBOO.z + 8, tx: BAMBOO.x, ty: y + 1, tz: BAMBOO.z },
  ];
}

const only = (process.env.SHOTS ?? '').split(',').filter(Boolean);
const run = only.length ? jobs.filter((j) => only.includes(j.name)) : jobs;

const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
await mkdir(OUT, { recursive: true });

for (const job of run) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const q = `?menu=0&nosave=1&seed=20261012&shadow=0&microR=28&ring=full&${job.query}`;
  console.log('open', q);
  await page.goto(BASE + q, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__rikkun?.ready === true, null, { timeout: 120_000 });
  const ground = await page.evaluate(async (at) => {
    const h = window.__rikkun;
    h.achievements?.mute?.(true);
    h.pause();
    h.settings?.set?.('yokaiAutoSpawn', false);
    h.yokai?.clear?.();
    h.time?.set?.(1000);
    const x = at === 'tree' ? 70 : 40;
    const z = at === 'tree' ? 57 : 79;
    h.world.teleport(x, z);
    await h.world.settle({ full: true, maxFrames: 4000 });
    h.camera.hideDoll(true);
    const hud = document.getElementById('hud');
    if (hud) hud.style.display = 'none';
    return h.world.groundHeight(x, z);
  }, job.at);
  for (const cam of cams(job.at, ground)) {
    await page.evaluate((c) => {
      window.__rikkun.camera.fixed(c);
      window.__rikkun.step(2);
    }, cam);
    await page.waitForTimeout(200);
    const file = `${OUT}/${job.name}-${cam.id}.png`;
    await page.screenshot({ path: file });
    console.log('shot', file, 'ground', ground);
  }
  await page.close();
}

await browser.close();
console.log('done');
