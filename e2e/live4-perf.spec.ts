import { expect, test } from '@playwright/test';
import { openLive4 } from './helpers/live4';

/**
 * LIVE-4 E2E その 4（docs/design/LIVE-4.md 版 2 §4.6・§6 AC20）: 性能。時間(ms)では 決めない（#255）。
 *  - ふだん（ねらい なし）: 29 わ（マッチョ 大人 2 わ を ふくむ）で 60 ステップ の 仕事 の 数（`work` の getBlock）が LIVE-4 を 入れる 前 と 同じ
 *  - たたかう とき: マッチョ 1 わ・妖怪 5 体 と 10 体 で、60 ステップ の 仕事 の 数 が 同じ（ねらい 1 体 を 見る 分 だけ。妖怪 の 数 に よらない）
 *  - 描画: 「ねらい なし」と くらべて 描画回数 +2 以下・三角形 +200 以下。ねらい が おわる と ふえ 0
 */
// LIVE-4 前（試作 a866275 の HEAD。試作 は 窓口 から 呼ばない かぎり うごかない）で はかった 値。29 わ・60 ステップ。ゲームの 中の 仕事 の 数 なので 機械 の 速さ に よらない
// 測り直し方: この ファイル の AC20 の 手順 を LIVE-4 を 入れて いない コミット（a866275）で 回し、console の `LIVE4 AC20 work` の getBlock を 写す。
const WORK_BASE = 99972;

test.describe('LIVE-4 性能', () => {
  test.describe.configure({ timeout: 170_000 });

  test('AC20 ふだん: 29 わ（マッチョ 2 わ ふくむ）で 60 ステップ の 仕事 の 数 が LIVE-4 前 と 同じ', async ({ page }) => {
    await openLive4(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const A = (window as any).__A;
      A.base(50);
      const kids = (c: any) => {
        for (let i = 0; i < 6; i++) A.kid(c, { stage: 'adult', raised: true, ...(i === 0 ? { breed: 'macho' } : {}) }, (i % 3) - 1, Math.floor(i / 3) - 1 || 1);
      };
      for (const x of [14, 28, 42]) kids(A.cinfo(A.coop(x, 14)));
      const full = A.full();
      h.settings.set('animalFriendMax', 16);
      for (let i = 0; i < 8; i++) h.animals.spawn(5 + (i % 4) * 1.5, 9, 30 + Math.floor(i / 4) * 2 + 0.5, { friend: true, follow: full, fullLeft: 1800, ...(i < 2 ? { stage: 'adult', breed: 'macho' } : {}) });
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
    console.log('LIVE4 AC20 work', JSON.stringify(r));
    expect(r.n).toBe(29);
    expect(r.steps).toBe(60);
    expect(r.getBlock, 'LIVE-4 前 と 同じ').toBe(WORK_BASE);
  });

  test('AC20b たたかう とき: 妖怪 5 体 と 10 体 で 仕事 の 数 が 同じ（ねらい 1 体 を 見る 分 だけ）', async ({ page }) => {
    await openLive4(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const M = (window as any).__M;
      const measure = (n: number) => {
        M.base();
        const mid = M.macho(11.5, 6.5);
        const ids: number[] = [];
        for (let i = 0; i < n; i++) ids.push(M.yokai('karakasa', 14 + (i % 5) * 1.5, 2.5 + Math.floor(i / 5) * 3, { hp: 9999 }));
        const yid = M.yokai('karakasa', 6.5, 6.5, { hp: 9999 });
        M.faceTo(yid, 2);
        const trig = M.hit(yid, { m: mid });
        h.yokai.setHp(yid, 9999);
        h.step(60); // はしって とどく まで
        const target = M.one(mid).target ?? null;
        h.work.start();
        h.step(60);
        const w = h.work.read();
        h.work.stop();
        return { getBlock: w.getBlock, target, yid, k: trig.k };
      };
      return { five: measure(4), ten: measure(9) };
    });
    console.log('LIVE4 AC20b work', JSON.stringify(r));
    expect(r.five.target, '見張り: ねらって いる（5 体）').toBe(r.five.yid);
    expect(r.ten.target, '見張り: ねらって いる（10 体）').toBe(r.ten.yid);
    expect(r.ten.getBlock, '妖怪 を 2 倍 に して も ふえない').toBeLessThanOrEqual(r.five.getBlock);
  });

  test('AC20c 描画: ねらい の あいだ「ねらい なし」より 描画回数 +2 以下・三角形 +200 以下。おわる と ふえ 0', async ({ page }) => {
    await openLive4(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const A = (window as any).__A;
      const M = (window as any).__M;
      let forget: number | null = null;
      try {
        h.settings.set('machoForget', 60);
        forget = h.settings.get('machoForget');
      } catch {
        /* 設定 が まだ ない（赤） */
      }
      // 「ねらい なし」= 同じ 場所 の 同じ マッチョ（ついてくる あしあと など も 同じ）だが 設定 machoFighters を 0 に して だれ も たたかわない。プレイヤー の 一撃 の 見た目 も 同じ
      let offSetting: string | null = null;
      const run = (fighting: boolean) => {
        M.base();
        try {
          h.settings.set('machoFighters', fighting ? 1 : 0);
        } catch (e) {
          offSetting = String(e);
        }
        const mid = M.macho(7.5, 4.5);
        const yid = M.yokai('karakasa', 6.5, 6.5, { hp: 9999 });
        h.step(40);
        M.faceTo(yid, 2);
        const trig = M.hit(yid, { m: mid });
        h.yokai.setHp(yid, 9999);
        const series: { dc: number; tri: number }[] = [];
        for (let i = 0; i < 50; i++) {
          h.step(1);
          const d = A.draw();
          series.push({ dc: d.dc, tri: d.tri });
        }
        const target = M.one(mid).target ?? null;
        h.step(200); // forget（60）を こえる
        const gone = M.one(mid).target ?? null;
        h.step(40);
        const d = A.draw();
        return { series, target, gone, end: { dc: d.dc, tri: d.tri }, mid, yid, k: trig.k };
      };
      const on = run(true);
      const off = run(false);
      const diff = on.series.map((x, i) => ({ dc: x.dc - off.series[i]!.dc, tri: x.tri - off.series[i]!.tri }));
      return {
        forget,
        offSetting,
        target: on.target,
        gone: on.gone,
        yid: on.yid,
        maxDc: Math.max(...diff.map((d) => d.dc)),
        maxTri: Math.max(...diff.map((d) => d.tri)),
        after: { dc: on.end.dc - off.end.dc, tri: on.end.tri - off.end.tri },
      };
    });
    console.log('LIVE4 AC20c draw', JSON.stringify(r));
    expect(r.forget, '設定 machoForget').toBe(60);
    expect(r.offSetting, '設定 machoFighters（0 = だれ も たたかわない）').toBeNull();
    expect(r.target, '見張り: ねらって いる').toBe(r.yid);
    expect(r.maxDc, '描画回数').toBeLessThanOrEqual(2);
    expect(r.maxTri, '三角形').toBeLessThanOrEqual(200);
    expect(r.gone, 'ねらい が おわった').toBeNull();
    expect(r.after.dc, 'おわった あと 描画回数 ふえ 0').toBeLessThanOrEqual(0);
    expect(r.after.tri, 'おわった あと 三角形 ふえ 0').toBeLessThanOrEqual(0);
  });
});
