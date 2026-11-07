import { expect, test, type Page } from '@playwright/test';
import { holdNiji } from './helpers/niji';
import { aimGroundAhead, legendWorld, resetStage } from './helpers/legend';
import { spawnAhead } from './helpers/blade';
import { installFakePads } from './helpers/duoUi';
import { DUO_TUNING } from '../src/duo/tuning';

/**
 * COOP-1 4d-0（docs/design/COOP-1.md 1.13 §3.6 (b)「不具合 ① を 直す」・§12.0・AC98）の E2E（1 本）。実装の 前に 書いた 赤の テスト。
 * 2 人で あそんでいる とき、1P が 雷神剣で 雷を 落とす あいだ・虹の 刀で ふつうに 切る あいだ、画面は いつも 左右 2 つ（`duo.viewports()` が 2 つ・`duo.state().fullPass` が 0）。
 * 雷の 絵は ちゃんと 出る（`thunder.info().F` が 0 より 大きい コマが ある）。
 * ユニットで 見る 物（時間の 倍率・人ごとの 止め・ゆれ・光の 道の 条件）は ここでは 見ない
 * （src/duo/worldTime.test.ts・camFx.test.ts・impactRoute.test.ts・worldPass.test.ts）。
 * 数・座標は 決め打ちせず、ゲーム（window.__rikkun）に 聞く。進めるのは step の 数で、時間（ms）では 合否を 決めない（#255）。
 *
 * ---- 開発への つなぎ目の 約束（`window.__rikkun.duo` に 足す 口。仕様 §12.0 の とおり）----
 *   duo.state().fullPass   : number … 2P が 参加して から 全面の 光の 道で 描いた コマの 数（参加で 0 に もどる）。2P が いなければ 0。
 *   duo.impact(who)        : { trauma: number; stopLeft: number; log: Array<{ tick: number; level: string }> } | null … 2P が いなければ who=2 は null
 *   duo.camDistance(who)   : number | null … その人の カメラの 今の きょり（マス）。2P が いなければ who=2 は null
 *   2 人の あいだ（参加して 30 ステップ あと）の camDistance は 1P も 2P も DUO_TUNING.cameraSplit。
 */

test.describe.configure({ timeout: 240_000 });

interface Row {
  views: number;
  view: string;
  full: unknown;
  F: number;
}

/** 1 ステップずつ 進めて（毎ステップ 1 回 描いて）、毎ステップ 区画の 数・ようす・fullPass・雷の コマを きろくする。before(h, i) は 各ステップの 前 */
async function record(page: Page, n: number, before: string): Promise<Row[]> {
  return page.evaluate(
    ({ n, before }) => {
      const h = (window as any).__rikkun;
      const b = (0, eval)(before) as (h: any, i: number) => void;
      const out: Row[] = [];
      for (let i = 0; i < n; i++) {
        b(h, i);
        h.shadow.advance(1); // 1 ステップ すすめて 1 回 描く（step だけだと 描画が 起きず fullPass が いつも 0 に なる）
        out.push({ views: h.duo.viewports().length, view: h.duo.state().view, full: h.duo.state().fullPass, F: h.thunder.info().F });
      }
      return out;
    },
    { n, before },
  );
}

function expectAlwaysSplit(rows: Row[], what: string): void {
  rows.forEach((r, i) => {
    expect(r.views, `${what} ${i} コマ目: 区画は 2 つ`).toBe(2);
    expect(r.view, `${what} ${i} コマ目: 左右の ようす`).toBe('split');
    expect(r.full, `${what} ${i} コマ目: 全面の 光の 道で 描いた コマ`).toBe(0);
  });
}

test('AC98: 2 人の とき、1P が 雷を 落とす あいだも 虹で 切る あいだも、区画は 2 つの まま（全面の 光の 道を 通らない）', async ({ page }) => {
  const floorY = await legendWorld(page, undefined, '?nosave=1&duo=dev'); // 雷神剣を 持って 平らな 地面に 立つ

  // ---- 2P が いない: 口は あるが 中身は ない ----
  const solo = await page.evaluate(() => {
    const h = (window as any).__rikkun;
    return { full: h.duo.state().fullPass, imp2: h.duo.impact(2), cam2: h.duo.camDistance(2), imp1: h.duo.impact(1), views: h.duo.viewports().length };
  });
  expect(solo.full, '2P が いなければ fullPass は 0').toBe(0);
  expect(solo.imp2, '2P が いなければ duo.impact(2) は null').toBeNull();
  expect(solo.cam2, '2P が いなければ duo.camDistance(2) は null').toBeNull();
  expect(solo.imp1, '1 人の ときの duo.impact(1) は 世界の 止め・ゆれ').toMatchObject({ trauma: expect.any(Number), stopLeft: expect.any(Number), log: expect.any(Array) });
  expect(solo.views).toBe(1);

  // ---- 2P が 参加 ----
  await installFakePads(page, 2);
  expect(await page.evaluate(() => (window as any).__rikkun.duo.join())).toBe(true);
  await page.evaluate(() => (window as any).__rikkun.step(40));
  const duo = await page.evaluate(() => {
    const h = (window as any).__rikkun;
    return { views: h.duo.viewports().length, imp1: h.duo.impact(1), imp2: h.duo.impact(2), cam1: h.duo.camDistance(1), cam2: h.duo.camDistance(2), full: h.duo.state().fullPass };
  });
  expect(duo.views).toBe(2);
  expect(duo.full).toBe(0);
  expect(duo.imp1).toMatchObject({ trauma: expect.any(Number), stopLeft: expect.any(Number), log: expect.any(Array) });
  expect(duo.imp2, '2P の 手ごたえの 口').toMatchObject({ trauma: expect.any(Number), stopLeft: expect.any(Number), log: expect.any(Array) });
  expect(duo.cam1, '2 人の ときの 1P の 今の きょり').toBeCloseTo(DUO_TUNING.cameraSplit, 3);
  expect(duo.cam2, '2P の 今の きょり').toBeCloseTo(DUO_TUNING.cameraSplit, 3);

  // ---- 雷: 1P が ためて はなす（雷の あいだ ずっと 左右 2 つ） ----
  await aimGroundAhead(page, floorY, 8);
  // ための 長さは ゲームに 聞く: legend.state().charge.ready に なった ステップに はなす（長さの 数は 直書きしない）
  const thunder = await record(
    page,
    300,
    `(h, i) => {
      const w = window;
      if (i === 0) { h.input.press('primary'); w.__released = false; return; }
      const c = h.legend.state().charge;
      if (!w.__released && c && c.ready) { h.input.release('primary'); w.__released = true; }
    }`,
  );
  expect(await page.evaluate(() => (window as any).__released), 'ための 準備が できて はなした').toBe(true);
  expectAlwaysSplit(thunder, '雷');
  expect(
    thunder.filter((r) => r.F > 0).length,
    '雷の 絵は ちゃんと 出る（thunder.info().F が 0 より 大きい コマが ある）',
  ).toBeGreaterThan(0);
  const strikes = await page.evaluate(() => (window as any).__rikkun.legend.events().filter((e: any) => e.type === 'lightningStrike').length as number);
  expect(strikes, '雷が 本当に 落ちた').toBeGreaterThan(0);

  // ---- 虹の 刀で ふつうに 切る（妖怪に 当てる） ----
  await resetStage(page, floorY);
  await holdNiji(page, 10);
  await spawnAhead(page, 'karakasa', 1.5, { hp: 400 });
  const hits0 = await page.evaluate(() => (window as any).__rikkun.blade.events().filter((e: any) => e.type === 'techHit').length as number);
  const slash = await record(page, 60, `(h, i) => { if (i === 0) h.input.press('primary'); if (i === 1) h.input.release('primary'); }`);
  expectAlwaysSplit(slash, '虹で 切る');
  const hits1 = await page.evaluate(() => (window as any).__rikkun.blade.events().filter((e: any) => e.type === 'techHit').length as number);
  expect(hits1, '虹の 刀が 当たった').toBeGreaterThan(hits0);
  expect(await page.evaluate(() => (window as any).__rikkun.duo.state().fullPass), '最後まで 0').toBe(0);
});
