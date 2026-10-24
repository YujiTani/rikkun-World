import { test, expect } from '@playwright/test';
import { openGasha } from './helpers/gasha';

/**
 * #293 がしゃどくろが 出ても、プレイヤーの 置いた ブロック（家・畑・たいまつ）は 消えない。地ならしは しない。
 * 体の 高さは 置いた ブロックを ふくめた 地面の 上。時間では 待たず、コマで 進める。
 */
test.describe.configure({ timeout: 180_000 });

/** 領域の ブロックを 1 つの 文字列に まとめる（ならべて くらべる） */
const SNAP = `(x0, x1, y0, y1, z0, z1) => {
  const h = window.__rikkun; const out = [];
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) out.push(h.world.getBlock(x, y, z));
  return out.join(',');
}`;

test('出現しても、体の 足もとに ある 置いた ブロックは ぜんぶ のこる（地ならし なし）', async ({ page }) => {
  const errs = await openGasha(page);
  const r = await page.evaluate(async (snapSrc) => {
    const gt = (window as any).__gt, h = gt.h;
    const snap = eval(snapSrc) as (...a: number[]) => string;
    // 体が 立つ 場所（64.5, 4.5）の 地面に、プレイヤーの 家と 畑を 置く
    const base = gt.groundTop(64, 4);
    h.world.fill(60, base, 0, 68, base + 7, 8, 'brick'); // 高さ 8 の れんがの かたまり
    h.world.fill(70, base, 0, 74, base, 8, 'farmland'); // 畑
    h.world.setBlock(72, base + 1, 4, 'torch');
    h.world.fill(55, base - 3, -3, 56, base - 1, 10, 'air'); // 掘った 穴
    const box = [50, 80, base - 4, base + 10, -5, 14] as const;
    const before = snap(...box);
    const topBefore = gt.groundTop(64, 4);
    const ok = await gt.spawn({ distance: 60, angleDeg: -90 });
    gt.big().walk(false);
    gt.run(240);
    const after = snap(...box);
    const b = gt.boss();
    return { ok, same: before === after, base, topBefore, topAfter: gt.groundTop(64, 4), bossY: b.y, torch: h.world.getBlock(72, base + 1, 4), hole: h.world.getBlock(55, base - 2, 4) };
  }, SNAP);
  expect(r.ok).toBe(true);
  expect(r.same, '置いた ブロックと 掘った 穴が そのまま').toBe(true);
  expect(r.topAfter).toBe(r.topBefore);
  expect(r.torch).toBe('torch');
  expect(r.hole).toBe('air');
  expect(errs).toEqual([]);
});

test('体の 高さは 置いた ブロックを ふくめた 地面の 上（足もとが いちめん もり上げた 台なら、台の 上に 立つ）', async ({ page }) => {
  const errs = await openGasha(page);
  const r = await page.evaluate(async () => {
    const gt = (window as any).__gt, h = gt.h;
    const base = gt.groundTop(64, 4);
    // 体の 足もと（うでの 長さ ぶん）ぜんぶに、プレイヤーが もった 高さ 6 の 台
    h.world.fill(24, base - 1, -36, 104, base + 5, 44, 'stone');
    const top = gt.groundTop(64, 4); // 台の 上の 面
    await gt.spawn({ distance: 60, angleDeg: -90 });
    gt.big().walk(false);
    gt.run(60);
    return { top, bossY: gt.boss().y, topAfter: gt.groundTop(64, 4) };
  });
  expect(r.top).toBe(r.topAfter); // 台は のこる
  expect(r.bossY).toBeGreaterThanOrEqual(r.top); // 台に めり込まない
  expect(errs).toEqual([]);
});

test('置きなおして も（2 回目の spawn）ブロックは かわらない', async ({ page }) => {
  const errs = await openGasha(page);
  const r = await page.evaluate(async (snapSrc) => {
    const gt = (window as any).__gt, h = gt.h;
    const snap = eval(snapSrc) as (...a: number[]) => string;
    const base = gt.groundTop(64, 20);
    h.world.fill(60, base, 16, 70, base + 3, 24, 'stone');
    const box = [40, 90, base - 4, base + 10, -20, 40] as const;
    const before = snap(...box);
    await gt.spawn({ distance: 44, angleDeg: -90 });
    gt.run(60);
    await gt.spawn({ distance: 44, angleDeg: -90 });
    gt.run(60);
    gt.big().despawn();
    gt.run(30);
    return { same: before === snap(...box) };
  }, SNAP);
  expect(r.same).toBe(true);
  expect(errs).toEqual([]);
});
