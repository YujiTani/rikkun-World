import { expect, test } from '@playwright/test';
import { openLive3 } from './helpers/live3';

/**
 * LIVE-3 E2E その 5（docs/design/LIVE-3.md 版 1.1 §4.6・§6 AC17）: 性能。時間(ms)では 決めない（#255）。
 *  - ふだん（メニュー も 演出 も 無い）: 29 わ で 60 ステップ の 仕事 の 数（`work` の getBlock）が LIVE-3 を 入れる 前 と 同じ
 *    （LIVE-3 前 の HEAD で はかった 数 = WORK_BASE。えらべる 子 を 毎ステップ さがして いない こと）
 *  - メニュー: 小屋 1 つ でも 3 つ でも ページ 2 を 出す 仕事 は 同じ
 *  - 演出 1 わ: 「演出 なし」より 描画回数 +2 以下・三角形 +300 以下。3 わ 同時: +6 以下・+900 以下。演出 の あと: ふえ 0（0 以下）
 */
// LIVE-3 前（試作 の HEAD 28aaf4d）で はかった 値。29 わ・60 ステップ。ゲームの 中の 仕事 の 数 なので 機械 の 速さ に よらない
const WORK_BASE = 99972;

test.describe('LIVE-3 性能', () => {
  test.describe.configure({ timeout: 170_000 });

  test('AC17 ふだん: 29 わ（小屋 3 つ に 6 わずつ ＋ なかま 8 ＋ やせい 3）で 60 ステップ の 仕事 の 数 が LIVE-3 前 と 同じ', async ({ page }) => {
    await openLive3(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const A = (window as any).__A;
      const L = (window as any).__L;
      L.farm(6, { x: 14, z: 14, half: 50 });
      for (const x of [28, 42]) {
        const cid = A.coop(x, 14);
        const c = A.cinfo(cid);
        for (let i = 0; i < 6; i++) A.kid(c, { stage: 'adult', raised: true }, (i % 3) - 1, Math.floor(i / 3) - 1 || 1);
      }
      const full = A.full();
      h.settings.set('animalFriendMax', 16);
      for (let i = 0; i < 8; i++) h.animals.spawn(5 + (i % 4) * 1.5, 9, 30 + Math.floor(i / 4) * 2 + 0.5, { friend: true, follow: full, fullLeft: 1800 });
      for (let i = 0; i < 3; i++) h.animals.spawn(9 + i * 1.5, 9, 38.5, { hearts: 2, fullLeft: 1800 });
      (window as any).__aim.standForS(2.5, 36.5, 90, -20, 9);
      h.step(60);
      const n = h.animals.list().length;
      h.work.start();
      h.step(60);
      const w = h.work.read();
      h.work.stop();
      return { n, steps: w.steps, getBlock: w.getBlock };
    });
    console.log('LIVE3 AC17 work', JSON.stringify(r));
    expect(r.n).toBe(29);
    expect(r.steps).toBe(60);
    expect(r.getBlock, 'LIVE-3 前 と 同じ').toBe(WORK_BASE);
  });

  test('AC17b メニュー: 小屋 1 つ と 3 つ で ページ 2 を 出す 仕事（getBlock）が 同じ', async ({ page }) => {
    await openLive3(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const A = (window as any).__A;
      const L = (window as any).__L;
      const measure = (coops: number) => {
        const { c, f } = L.farm(6, { x: 14, z: 14, half: 50 });
        for (let k = 1; k < coops; k++) {
          const c2 = A.cinfo(A.coop(14 + 12 * k, 14));
          for (let i = 0; i < 6; i++) A.kid(c2, { stage: 'adult', raised: true }, (i % 3) - 1, Math.floor(i / 3) - 1 || 1);
        }
        L.rc(c, f);
        h.work.start();
        L.press('meat');
        const w = h.work.read();
        h.work.stop();
        const page = L.menu().page;
        L.press('close');
        return { getBlock: w.getBlock, page };
      };
      return { one: measure(1), three: measure(3) };
    });
    expect(r.one.page).toBe('pick');
    expect(r.three.page).toBe('pick');
    expect(r.three.getBlock, '小屋 3 つ に して も 1 回 の 仕事 は かわらない').toBe(r.one.getBlock);
  });

  test('AC17c 演出: 1 わ で 描画回数 +2 以下・三角形 +300 以下、3 わ 同時 で +6 以下・+900 以下、演出 の あと ふえ 0（0 以下）', async ({ page }) => {
    await openLive3(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const A = (window as any).__A;
      const L = (window as any).__L;
      const o: any = {};
      const { c, ids } = L.farm(1, { x: 14, z: 14, half: 50 });
      const c2 = A.cinfo(A.coop(28, 14));
      const c3 = A.cinfo(A.coop(42, 14));
      const k2 = A.kid(c2, { stage: 'adult', raised: true });
      const k3 = A.kid(c3, { stage: 'adult', raised: true });
      (window as any).__aim.standForS(26.5, 24.5, 90, -20, 9);
      h.step(60);
      const base = A.draw();
      o.base = base;
      // 1 わ
      h.animals.meat(c.id, ids[0]);
      L.go(100);
      const one = A.draw();
      o.one = { dc: one.dc - base.dc, tri: one.tri - base.tri };
      L.go(130);
      const after1 = A.draw();
      o.after1 = { dc: after1.dc - base.dc, tri: after1.tri - base.tri };
      o.mm1 = h.inventory.count('momo_nama');
      // 3 わ 同時（もう 1 わ ずつ 小屋 に 足して から）
      const k1b = A.kid(c, { stage: 'adult', raised: true }, 1, 1);
      h.step(60);
      const base3 = A.draw();
      h.animals.meat(c.id, k1b);
      h.animals.meat(c2.id, k2);
      h.animals.meat(c3.id, k3);
      L.go(100);
      const three = A.draw();
      o.three = { dc: three.dc - base3.dc, tri: three.tri - base3.tri };
      o.busy = h.animals.coops().filter((x: any) => x.meatBusy !== null).length;
      L.go(130);
      const after3 = A.draw();
      o.after3 = { dc: after3.dc - base3.dc, tri: after3.tri - base3.tri };
      o.mm3 = h.inventory.count('momo_nama');
      return o;
    });
    console.log('LIVE3 AC17c draw', JSON.stringify(r));
    expect(r.mm1).toBe(2);
    expect(r.busy, '3 つ の 小屋 で 同時').toBe(3);
    expect(r.one.dc, '1 わ 描画回数').toBeLessThanOrEqual(2);
    expect(r.one.tri, '1 わ 三角形').toBeLessThanOrEqual(300);
    expect(r.after1.dc, '演出 の あと 描画回数').toBeLessThanOrEqual(0);
    expect(r.after1.tri, '演出 の あと 三角形').toBeLessThanOrEqual(0);
    expect(r.three.dc, '3 わ 描画回数').toBeLessThanOrEqual(6);
    expect(r.three.tri, '3 わ 三角形').toBeLessThanOrEqual(900);
    expect(r.after3.dc).toBeLessThanOrEqual(0);
    expect(r.after3.tri).toBeLessThanOrEqual(0);
    expect(r.mm3).toBe(2 + 6);
  });
});
