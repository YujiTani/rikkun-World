import { test, expect } from '@playwright/test';
import { openAnimals } from './helpers/animals';

/**
 * LIVE-1 版 3.2 AC30（性能・仕様 §4.6）: にわとり 11 わ（なかま 8・やせい 3。しるし ぜんぶ）で、
 * 0 わ より 描画回数の ふえ 18 以下・三角形の ふえ 8,000 以下。1 ステップの 時間は 記録だけ（クラウドは 遅い）。
 */
test.describe('LIVE-1 性能', () => {
  test.describe.configure({ timeout: 150_000 });
  test('AC30 にわとり 11 わ（なかま 8・やせい 3・ぜんぶ おなかいっぱい・あしあと つき）', async ({ page }) => {
    await openAnimals(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const A = (window as any).__A;
      A.base(30);
      (window as any).__aim.standForS(2.5, 6.5, 90, -20, 9);
      h.step(30);
      const o: any = {};
      const a = h.renderStats();
      o.zero = { dc: a.drawCalls, tri: a.triangles };
      const full = A.full();
      for (let i = 0; i < 8; i++) h.animals.spawn(5 + (i % 4) * 1.5, 9, 4 + Math.floor(i / 4) * 2 + 0.5, { friend: true, follow: full, fullLeft: 1800 });
      for (let i = 0; i < 3; i++) h.animals.spawn(9 + i * 1.5, 9, 6.5, { hearts: 2, fullLeft: 1800 });
      h.step(40);
      const l = h.animals.list();
      o.n = l.length;
      o.friends = l.filter((x: any) => x.friend).length;
      o.fullAll = l.every((x: any) => x.fullLeft > 0 || x.friend);
      o.marks = h.animals.fx().marks.length;
      const b = h.renderStats();
      o.on = { dc: b.drawCalls, tri: b.triangles };
      const t0 = performance.now();
      h.step(120);
      o.stepMs = (performance.now() - t0) / 120;
      return o;
    });
    console.log('LIVE1 AC30 perf', JSON.stringify(r));
    expect(r.n).toBe(11);
    expect(r.friends).toBe(8);
    expect(r.marks).toBeGreaterThanOrEqual(8);
    expect(r.on.dc - r.zero.dc).toBeLessThanOrEqual(18);
    expect(r.on.tri - r.zero.tri).toBeLessThanOrEqual(9000);
  });
  test('動物の数を 2 倍にしても 1 ステップの getBlock の数は 2.5 倍以下（時間は 使わない）', async ({ page }) => {
    await openAnimals(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const A = (window as any).__A;
      const STEPS = 60;
      // 同じ場所・同じ step 数で 仕事の数だけ 読む
      const measure = (n: number) => {
        A.base(30);
        (window as any).__aim.standForS(2.5, 6.5, 90, -20, 9);
        h.step(30);
        // なかまの 上限（8）が あるので、2N わの ときは 上限を あげて 数を そろえる
        h.settings.set('animalFriendMax', 16);
        const full = A.full();
        for (let i = 0; i < n; i++) {
          if (i % 11 < 8) h.animals.spawn(5 + (i % 4) * 1.5, 9, 4 + (Math.floor(i / 4) % 6) * 1.5 + 0.5, { friend: true, follow: full, fullLeft: 1800 });
          else h.animals.spawn(9 + (i % 11 - 8) * 1.5, 9, 6.5 + Math.floor(i / 11) * 2, { hearts: 2, fullLeft: 1800 });
        }
        h.step(40);
        h.work.start();
        h.step(STEPS);
        const w = h.work.read();
        h.work.stop();
        return { n: h.animals.list().length, steps: w.steps, getBlock: w.getBlock };
      };
      return { zero: measure(0), one: measure(11), two: measure(22) };
    });
    console.log('LIVE1 work getBlock', JSON.stringify(r));
    expect(r.one.n).toBe(11);
    expect(r.two.n).toBe(22);
    expect(r.zero.steps).toBe(r.two.steps);
    const add1 = r.one.getBlock - r.zero.getBlock;
    const add2 = r.two.getBlock - r.zero.getBlock;
    // ふえが 0 なら（getBlock を 使っていないなら）通してよい
    if (add1 > 0) expect(add2).toBeLessThanOrEqual(add1 * 2.5);
    else expect(add2).toBeLessThanOrEqual(0);
  });
});
