import { expect, test, type Page } from '@playwright/test';
import { GEN_CONFIG } from '../src/world/gen/config';
import { terrainFor } from '../src/world/gen/terrain';
import type { LiquidPond } from '../src/world/gen/liquidPonds';

/**
 * MAGMA-SPAWN（docs/design/MAGMA-SPAWN.md）: ①はじめの そばの 溶岩の いけ・自然の 滝 ②?demo=magma の 見本。
 * MS_SHOTS=dir で 画面を のこす。時間（ms）で 合否を 決めない。
 */
/** いつもの 世界（nosave = 既定の シード）の はじめの そばの 溶岩の いけ と、いちばん 近い マグマの 滝・水の 滝（生成の 計算だけ） */
const T = terrainFor(GEN_CONFIG.defaultSeed);
const fallOf = (liquid: 'magma' | 'water'): LiquidPond => {
  for (let r = 0; r <= 6; r++) for (let i = -r; i <= r; i++) for (let j = -r; j <= r; j++) {
    const p = T.liquid.ofCell(i, j);
    if (p?.fall && p.liquid === liquid) return p;
  }
  throw new Error('no fall');
};

async function open(page: Page, url: string): Promise<void> {
  await page.goto(url);
  await page.waitForFunction(() => window.__rikkun?.ready === true);
  await page.evaluate(() => {
    const h = (window as any).__rikkun;
    h.achievements.mute(true);
    h.pause();
    h.water.pause(false);
    h.lock.simulate(true); // あそんで いる 状態（play）で ないと 液体が 動かない
    h.input.releaseAll();
    h.settings.set('yokaiAutoSpawn', false);
    h.yokai.clear();
  });
}
/** (x, z) に 立って 列が 読みこまれるまで すすめる */
async function goTo(page: Page, pos: { x: number; y: number; z: number; yaw: number; pitch: number }): Promise<void> {
  await page.evaluate((q) => {
    const h = (window as any).__rikkun;
    h.player.set({ position: { x: q.x, y: q.y, z: q.z }, velocity: { x: 0, y: 0, z: 0 }, yaw: q.yaw, pitch: q.pitch });
    for (let i = 0; i < 2000 && h.world.getBlock(Math.floor(q.x), 1, Math.floor(q.z)) === 'outside'; i++) h.step(1);
    h.player.set({ position: { x: q.x, y: q.y, z: q.z }, velocity: { x: 0, y: 0, z: 0 }, yaw: q.yaw, pitch: q.pitch });
    h.step(30);
  }, pos);
}

test('MAGMA-SPAWN ①: はじめの そばの 溶岩の いけ（広場の 外）・自然の マグマの 滝・水の 滝', async ({ page }) => {
  test.setTimeout(240_000);
  await open(page, '/?nosave=1');
  const dir = process.env.MS_SHOTS;
  const sp = T.liquid.nearSpawn()!;
  const spawn = await page.evaluate(() => (window as any).__rikkun.world.spawn());
  const near = await page.evaluate((p) => {
    const h = (window as any).__rikkun;
    let magma = 0;
    for (let x = p.x0; x <= p.x1; x++) for (let z = p.z0; z <= p.z1; z++) if (h.world.getBlock(x, p.level - 1, z) === 'magma') magma++;
    return magma;
  }, sp);
  expect(near, 'はじめの そばの いけの マグマ').toBeGreaterThan(10);
  expect(Math.max(Math.abs(spawn.x - (sp.x0 + sp.x1) / 2), Math.abs(spawn.z - (sp.z0 + sp.z1) / 2))).toBeGreaterThan(8);
  await page.evaluate(() => (window as any).__rikkun.time.set(67400));
  await goTo(page, { x: (sp.x0 + sp.x1) / 2 + 0.5, y: sp.level + 1, z: sp.z1 + 6.5, yaw: 0, pitch: -30 });
  if (dir) await page.screenshot({ path: `${dir}/1-spawn-lava-pond-night.png` });
  await page.evaluate(() => (window as any).__rikkun.time.set(12000));
  await goTo(page, { x: spawn.x, y: spawn.y, z: spawn.z, yaw: sp.x0 > spawn.x ? 90 : 270, pitch: -12 });
  if (dir) await page.screenshot({ path: `${dir}/2-spawn-lava-pond-from-spawn.png` });

  for (const liquid of ['magma', 'water'] as const) {
    const p = fallOf(liquid);
    const f = p.fall!;
    await page.evaluate((t) => (window as any).__rikkun.time.set(t), liquid === 'magma' ? 67400 : 12000);
    await goTo(page, { x: f.x + 8.5, y: p.level + 4, z: f.z - 1.5, yaw: 270, pitch: -12 });
    const r = await page.evaluate((q) => {
      const h = (window as any).__rikkun;
      h.step(45 * 10);
      return { spring: h.world.getBlock(q.f.x, q.f.top, q.f.z), link: h.water.springLink(q.f.x, q.f.top, q.f.z) };
    }, { f, liquid });
    expect(r.spring).toBe(liquid === 'magma' ? 'magma_wakimizu' : 'wakimizu');
    expect(r.link, 'たきつぼと つながる').toEqual({ x: f.x, y: p.level - p.depth - 2, z: f.z - 1 });
    if (dir) await page.screenshot({ path: `${dir}/3-natural-${liquid}-fall.png` });
  }
});

test('MAGMA-SPAWN ②: ?demo=magma で はじめの 前に 見本（いけ・こくようせき・わきみず 2 つ・こげた）', async ({ page }) => {
  test.setTimeout(180_000);
  await open(page, '/?nosave=1&demo=magma');
  const dir = process.env.MS_SHOTS;
  const r = await page.evaluate(() => {
    const h = (window as any).__rikkun;
    h.pause();
    h.water.pause(false);
    h.lock.simulate(true); // あそんで いる 状態（play）で ないと 液体が 動かない
    h.input.releaseAll();
    h.settings.set('yokaiAutoSpawn', false);
    h.yokai.clear();
    const sp = h.world.spawn();
    const sx = Math.floor(sp.x);
    const sz = Math.floor(sp.z);
    const g = Math.floor(sp.y) - 1;
    for (let i = 0; i < 600 && h.world.getBlock(sx + 6, g, sz - 10) !== 'kogeta'; i++) h.step(1);
    h.step(45 * 20);
    let obs = 0;
    for (let z = sz - 17; z <= sz - 13; z++) if (h.world.getBlock(sx - 1, g, z) === 'kokuyouseki') obs++;
    h.time.set(67400);
    h.player.set({ position: { x: sp.x, y: sp.y, z: sp.z - 4 }, velocity: { x: 0, y: 0, z: 0 }, yaw: 0, pitch: -30 });
    h.step(30);
    return { obs, kogeta: h.world.getBlock(sx + 6, g, sz - 10), springs: h.water.springCount(), magma: h.water.magma.amount(sx - 6, g, sz - 17) };
  });
  expect(r.kogeta).toBe('kogeta');
  expect(r.obs).toBeGreaterThan(0);
  expect(r.springs).toBeGreaterThanOrEqual(2);
  expect(r.magma).toBe(8);
  if (dir) await page.screenshot({ path: `${dir}/4-demo-night.png` });
  await page.evaluate(() => {
    const h = (window as any).__rikkun;
    h.time.set(12000);
    h.step(12);
  });
  if (dir) await page.screenshot({ path: `${dir}/5-demo-day.png` });
});
