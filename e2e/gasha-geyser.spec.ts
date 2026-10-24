import { test, expect } from '@playwright/test';
import { openGasha, reopenGasha, setupBoss } from './helpers/gasha';

/**
 * #293 間欠泉の 土（geyser_dirt）: がしゃどくろを 片づけたら もとの ブロックに もどる・プレイヤーが 置いた 土は のこる・保存に のこらない。
 * 時間では 待たず、コマで 進める。
 */
test.describe.configure({ timeout: 180_000 });

/** 領域の ブロックを 1 つの 文字列に まとめる */
const SNAP = `(x0, x1, y0, y1, z0, z1) => {
  const h = window.__rikkun; const out = [];
  for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) for (let y = y0; y <= y1; y++) out.push(h.world.getBlock(x, y, z));
  return out.join(',');
}`;

test('片づける（despawn）と、自分が 作った 間欠泉の 土は ぜんぶ なくなる', async ({ page }) => {
  const errs = await openGasha(page);
  await setupBoss(page);
  const r = await page.evaluate(() => {
    const gt = (window as any).__gt, h = gt.h, g = gt.big();
    const geyserCount = () => (h.world.countBlocks().geyser_dirt ?? 0) as number;
    const spots = [[84, 10], [90, 20], [40, 12], [50, 30], [100, 5]];
    gt.run(10);
    const during0 = geyserCount();
    for (const [x, z] of spots) g.spawnGeyser(x, z, 0);
    gt.run(240);
    const during = geyserCount();
    const geys = g.geysers().length;
    g.despawn();
    gt.run(60);
    return { during0, during, geys, after: geyserCount() };
  });
  expect(r.during, '間欠泉の 土が できる').toBeGreaterThan(r.during0);
  expect(r.geys).toBeGreaterThan(0);
  expect(r.after, '片づけた あとは 間欠泉の 土が ぜんぶ もどる').toBe(0);
  expect(errs).toEqual([]);
});

test('片づけたら 地面が 出す まえと まったく 同じ（もとの ブロックに もどる）', async ({ page }) => {
  const errs = await openGasha(page);
  const r = await page.evaluate(async (snapSrc) => {
    const gt = (window as any).__gt, h = gt.h;
    const snap = eval(snapSrc) as (...a: number[]) => string;
    const base = gt.groundTop(64, 4);
    const box = [10, 120, base - 8, base + 8, -35, 60] as const;
    const before = snap(...box);
    await gt.spawn({ distance: 60, angleDeg: -90 });
    const g = gt.big();
    g.walk(false);
    for (const [x, z] of [[84, 10], [90, 20], [40, 12], [50, 30]]) g.spawnGeyser(x, z, 0);
    gt.run(300);
    const during = snap(...box);
    h.gasha.despawn();
    gt.run(60);
    return { same: before === snap(...box), changedDuring: before !== during };
  }, SNAP);
  expect(r.changedDuring, '間欠泉の 土で 地面が かわる').toBe(true);
  expect(r.same, '片づけたら もとどおり').toBe(true);
  expect(errs).toEqual([]);
});

test('プレイヤーが 置いた 間欠泉の 土は 片づけても のこる', async ({ page }) => {
  const errs = await openGasha(page);
  await setupBoss(page);
  const r = await page.evaluate(() => {
    const gt = (window as any).__gt, h = gt.h, g = gt.big();
    const y = gt.groundTop(100, 100);
    h.world.setBlock(100, y, 100, 'geyser_dirt');
    g.spawnGeyser(84, 10, 0);
    gt.run(120);
    h.gasha.despawn();
    gt.run(60);
    return { mine: h.world.getBlock(100, y, 100) as string };
  });
  expect(r.mine).toBe('geyser_dirt');
  expect(errs).toEqual([]);
});

test('保存に のこらない: 間欠泉の 土が ある ときに 保存して 開きなおしても、間欠泉の 土は ない', async ({ page }) => {
  const errs = await openGasha(page);
  await setupBoss(page);
  const during = await page.evaluate(() => {
    const gt = (window as any).__gt, h = gt.h, g = gt.big();
    for (const [x, z] of [[84, 10], [90, 20], [40, 12], [50, 30]]) g.spawnGeyser(x, z, 0);
    gt.run(300);
    return (h.world.countBlocks().geyser_dirt ?? 0) as number;
  });
  expect(during).toBeGreaterThan(0);
  await page.evaluate(() => (window as any).__rikkun.save.now());
  await reopenGasha(page);
  const after = await page.evaluate(() => ((window as any).__rikkun.world.countBlocks().geyser_dirt ?? 0) as number);
  expect(after, '保存した ワールドに 間欠泉の 土が のこらない').toBe(0);
  expect(errs).toEqual([]);
});

test('保存に のこる: プレイヤーが 置いた 間欠泉の 土は、ボスが 作った 土と いっしょに あっても 保存・開きなおしで そのまま のこる', async ({ page }) => {
  const errs = await openGasha(page);
  await setupBoss(page);
  const placed = await page.evaluate(() => {
    const gt = (window as any).__gt, h = gt.h, g = gt.big();
    const y = gt.groundTop(100, 100);
    h.world.setBlock(100, y, 100, 'geyser_dirt');
    for (const [x, z] of [[84, 10], [90, 20], [40, 12], [50, 30]]) g.spawnGeyser(x, z, 0);
    gt.run(300);
    return { y, total: (h.world.countBlocks().geyser_dirt ?? 0) as number };
  });
  expect(placed.total, 'ボスが 作った 土も ある').toBeGreaterThan(1);
  await page.evaluate(() => (window as any).__rikkun.save.now());
  await reopenGasha(page);
  const after = await page.evaluate((y) => {
    const h = (window as any).__rikkun;
    return { count: (h.world.countBlocks().geyser_dirt ?? 0) as number, mine: h.world.getBlock(100, y, 100) as string };
  }, placed.y);
  expect(after.mine, '置いた 土は のこる').toBe('geyser_dirt');
  expect(after.count, 'のこるのは 置いた 1 つだけ（ボスが 作った 土は 元の ブロック）').toBe(1);
  expect(errs).toEqual([]);
});
