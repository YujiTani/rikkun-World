import { expect, test } from '@playwright/test';

/**
 * MAGMA-SPAWN（docs/design/MAGMA-SPAWN.md）: ①はじめの そばに 自然の マグマの 滝の いけ ②?demo=magma の 見本。
 * MS_SHOTS=dir で 画面を のこす。時間（ms）で 合否を 決めない。
 */
const findFall = () => {
  const h = (window as any).__rikkun;
  const sp = h.world.spawn();
  for (let x = Math.floor(sp.x) - 24; x <= sp.x + 24; x++)
    for (let z = Math.floor(sp.z) - 24; z <= sp.z + 24; z++)
      for (let y = Math.floor(sp.y) - 6; y <= sp.y + 16; y++) if (h.world.getBlock(x, y, z) === 'magma_wakimizu') return { x, y, z, sp };
  return null;
};

test('MAGMA-SPAWN ①: はじめの そばに マグマの 滝の いけ（スタート地点には かぶらない）', async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto('/?nosave=1');
  await page.waitForFunction(() => window.__rikkun?.ready === true);
  await page.evaluate(() => (window.__rikkun as any).achievements.mute(true));
  const dir = process.env.MS_SHOTS;
  const fall = await page.evaluate(findFall);
  expect(fall, 'マグマの わきみず').not.toBeNull();
  const d = Math.max(Math.abs(fall!.x - fall!.sp.x), Math.abs(fall!.z - fall!.sp.z));
  expect(d).toBeGreaterThan(6);
  const r = await page.evaluate((f) => {
    const h = (window as any).__rikkun;
    h.pause();
    h.water.pause(false);
    h.lock.simulate(true); // あそんで いる 状態（play）で ないと 液体が 動かない
    h.input.releaseAll();
    h.settings.set('yokaiAutoSpawn', false);
    h.yokai.clear();
    h.time.set(67400);
    h.player.set({ position: { x: f.x + 0.5, y: f.y - 3, z: f.z + 7.5 }, velocity: { x: 0, y: 0, z: 0 }, yaw: 0, pitch: -25 });
    h.step(45 * 20);
    let magma = 0;
    for (let x = f.x - 5; x <= f.x + 5; x++) for (let z = f.z - 8; z <= f.z; z++) for (let y = f.y - 10; y <= f.y; y++) if (String(h.world.getBlock(x, y, z)).startsWith('magma') && h.world.getBlock(x, y, z) !== 'magma_wakimizu') magma++;
    return { magma, link: h.water.springLink(f.x, f.y, f.z) };
  }, fall!);
  expect(r.magma).toBeGreaterThan(10);
  expect(r.link, 'たきつぼと つながる').not.toBeNull();
  if (dir) await page.screenshot({ path: `${dir}/1-natural-lavafall-night.png` });
  await page.evaluate((f) => {
    const h = (window as any).__rikkun;
    h.player.set({ position: { x: f.x + 8.5, y: f.y - 3, z: f.z - 1.5 }, velocity: { x: 0, y: 0, z: 0 }, yaw: 270, pitch: -15 });
    h.step(10);
  }, fall!);
  if (dir) await page.screenshot({ path: `${dir}/1b-natural-lavafall-side.png` });
  await page.evaluate(() => {
    const h = (window as any).__rikkun;
    h.time.set(12000);
    h.step(10);
  });
  if (dir) await page.screenshot({ path: `${dir}/2-natural-lavafall-day.png` });
  await page.evaluate((f) => {
    const h = (window as any).__rikkun;
    h.player.set({ position: { x: f.sp.x, y: f.sp.y, z: f.sp.z }, velocity: { x: 0, y: 0, z: 0 }, yaw: 90, pitch: -10 });
    h.step(10);
  }, fall!);
  if (dir) await page.screenshot({ path: `${dir}/3-from-spawn.png` });
});

test('MAGMA-SPAWN ②: ?demo=magma で はじめの 前に 見本（いけ・こくようせき・わきみず 2 つ・こげた）', async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto('/?nosave=1&demo=magma');
  await page.waitForFunction(() => window.__rikkun?.ready === true);
  await page.evaluate(() => (window.__rikkun as any).achievements.mute(true));
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
