import { expect, test } from '@playwright/test';
import { legendWorld, RAIJIN, spawnAt } from './helpers/legend';
import { installFakePads } from './helpers/duoUi';
import { DUO_TUNING } from '../src/duo/tuning';

/**
 * COOP-1 4d-2（docs/design/COOP-1.md 1.13 §3.6 (b)・§12.0・AC103・AC113）の E2E（1 本）。実装の 前に 書いた 赤の テスト。
 * 2 人で あそんでいる とき、2P が パッドの ZR で 雷神剣を ため、はなすと 雷が 妖怪に 当たる。そのあいだ 画面は いつも 左右 2 つ。
 * 2P の わざで 倒した 妖怪の けいけんちは 2P（1P は かわらない）。1P の わざ・カメラ・手ごたえは かわらない（1P の 口は ずっと からっぽ）。
 * ユニットで 見る 物（同じ ための 長さ・手甲の 倍率・波の 持ち主・シャイニングの 引き・もちもの画面の 止め・うすい 光の 数）は ここでは 見ない
 * （src/duo/p2Legend.test.ts・src/legend/baseDistance.test.ts・waveWho.test.ts・legendImpact.test.ts・src/duo/legendLock.test.ts・flash.test.ts）。
 * 数・座標は 決め打ちせず、ゲーム（window.__rikkun）に 聞く。進めるのは step の 数で、時間（ms）では 合否を 決めない（#255）。
 *
 * ---- 開発への つなぎ目の 約束（`window.__rikkun.duo` の 口。仕様 §12.0 の とおり）----
 *   duo.legend(who)   : legend.state() と 同じ 形（item・power・charge・move・moveF・cooldownLeft・aim・dome。`got` は ない）| null … 2P が いなければ who=2 は null。
 *                       1P は 今の `legend.state()` と 同じ 数。
 *   duo.thunder(who)  : `thunderFx.hook(…)` と 同じ ThunderHook（e2e/helpers/thunder.ts。info()・refresh()…）| null … 2P の 雷の 絵（2P の カメラで 作った ThunderFx）。2P が いなければ who=2 は null。1P の `thunder` は 今の まま。
 *   duo.impact(who)   : 4d-0 の 口。2P の わざの 当たりの 手ごたえは 2P の 口にだけ 出る。
 *   duo.camDistance(who) / duo.state().fullPass / duo.viewports()  : 4d-0 の 口。
 *   2P の 入力: 偽パッド 番号 1 の ZR（ボタン 7）= primary（ため・はなす）。
 *   データ属性・見えるもの `duo-flash-p1`／`-p2` は UI 検査（e2e/ui-gate.spec.ts の duo-flash-p1／-p2）で 見る。
 */

test.describe.configure({ timeout: 240_000 });

interface Row {
  views: number;
  view: string;
  full: unknown;
  p1: { charge: unknown; move: unknown };
  p2: { charge: { ticks: number; ready: boolean } | null; move: string | null };
  cam1: number | null;
  /** 2P の 雷（duo.thunder(2)）の 板。見えて いる 間だけ layers に 入る */
  bolt2: { visible: boolean; layers: { visible: boolean; normal: { x: number; y: number; z: number } }[] } | null;
  /** 1P の 雷（thunder）が 見えて いるか */
  bolt1: boolean;
}

test('AC103: 2P の パッドで 雷神剣を ため → 雷が 妖怪に 当たる・けいけんちは 2P・区画は 2 つの まま・1P の わざは かわらない', async ({ page }) => {
  const floorY = await legendWorld(page, undefined, '?nosave=1&duo=dev'); // 1P は 雷神剣を 持って 平らな 地面に 立つ

  // ---- 2P が いない: 口は あるが 2P の 分は null。1P の 口は 今の legend.state() と 同じ ----
  const solo = await page.evaluate(() => {
    const h = (window as any).__rikkun;
    const { got: _got, ...state } = h.legend.state();
    return { d1: h.duo.legend(1), d2: h.duo.legend(2), state };
  });
  expect(solo.d2, '2P が いなければ duo.legend(2) は null').toBeNull();
  expect(solo.d1, '1 人の ときの duo.legend(1) は 今の legend.state() と 同じ').toEqual(solo.state);

  // ---- 2P が 参加 ----
  await installFakePads(page, 2);
  expect(await page.evaluate(() => (window as any).__rikkun.duo.join())).toBe(true);
  await page.evaluate(() => (window as any).__rikkun.step(40));
  const p2pos = (await page.evaluate(() => (window as any).__rikkun.duo.pos(2)))!;

  // 2P に 雷神剣。北に 8 マス先の 地面を ねらい、そこに 妖怪を 2 体（体力の 多い 1 体と、1 発で 倒れる 1 体）
  const cell = { x: Math.floor(p2pos.x), y: floorY, z: Math.floor(p2pos.z) - 8 };
  await page.evaluate(({ item }) => (window as any).__rikkun.duo.give(2, item, 1), { item: RAIJIN });
  const tough = await spawnAt(page, 'karakasa', cell.x + 0.5, floorY + 1, cell.z + 0.5, 400);
  const weak = await spawnAt(page, 'karakasa', cell.x + 1.5, floorY + 1, cell.z + 0.5, 1);
  // 1P は 雷の 落ちる 所の **東** へ（2P の カメラは 南から 見る。2 つの カメラで 板の 向きが ちがう ように する）
  await page.evaluate((c) => (window as any).__rikkun.duo.place(1, { x: c.x + 0.5 + 5, y: c.y + 1, z: c.z + 0.5 }), cell);
  await page.evaluate((c) => (window as any).__rikkun.duo.aimAt(2, c), cell);
  await page.evaluate(() => (window as any).__rikkun.step(2));

  const before = await page.evaluate(() => {
    const h = (window as any).__rikkun;
    return {
      lv1: h.duo.level(1),
      lv2: h.duo.level(2),
      imp1: h.duo.impact(1).log.length as number,
      imp2: h.duo.impact(2).log.length as number,
      full: h.duo.state().fullPass as number,
      hp: Object.fromEntries(h.yokai.list().map((y: any) => [y.id, y.hp])) as Record<number, number>,
    };
  });
  // ための 長さは 設定の 表から 読む（id を 直書きしない: RAIJIN は e2e/helpers/legend.ts）
  const chargeTicks = await page.evaluate(
    (item) => ((window as any).__rikkun.settings.get('legendary') as { item: string; charge: { chargeTicks: number } | null }[]).find((d) => d.item === item)!.charge!.chargeTicks as number,
    RAIJIN,
  );
  expect(before.full).toBe(0);
  expect(before.hp[tough]).toBe(400);

  // ---- 2P が ZR を 押して ため、ready に なったら はなす。毎ステップ 1 回 描いて、区画・1P の 口を きろくする ----
  const rows: Row[] = await page.evaluate(() => {
    const h = (window as any).__rikkun;
    const pad = (window as any).__pads[1];
    const zr = (on: boolean) => {
      const b = pad.buttons[7];
      b.pressed = on;
      b.touched = on;
      b.value = on ? 1 : 0;
    };
    const out: any[] = [];
    let released = false;
    zr(true);
    for (let i = 0; i < 400; i++) {
      const l2 = h.duo.legend(2);
      if (!released && l2 && l2.charge && l2.charge.ready) {
        zr(false);
        released = true;
      }
      h.shadow.advance(1); // 1 ステップ すすめて 1 回 描く
      const a = h.duo.legend(1);
      const b = h.duo.legend(2);
      out.push({ views: h.duo.viewports().length, view: h.duo.state().view, full: h.duo.state().fullPass, p1: { charge: a.charge, move: a.move }, p2: { charge: b.charge, move: b.move }, cam1: h.duo.camDistance(1), bolt2: h.duo.thunder(2)?.info().bolt ?? null, bolt1: h.thunder.info().bolt.visible });
      // 雷が 落ちて おわった（はなした あと、わざが なくなった）
      if (released && b.move === null && b.charge === null) break;
    }
    zr(false);
    return out;
  });
  const ready = rows.findIndex((r) => r.p2.charge?.ready);
  expect(ready, '2P の ためが ready に なった（duo.legend(2).charge.ready）').toBeGreaterThanOrEqual(0);
  expect(rows[ready]!.p2.charge!.ticks, '1P と 同じ ための 長さ（設定の chargeTicks）').toBe(chargeTicks);
  expect(rows.some((r) => r.p2.move === 'lightning'), '雷の わざに なった').toBe(true);

  // 区画は いつも 2 つ・全面の 光の 道は 0・1P の わざ（口）は ずっと からっぽ・1P の 引きは ふだん
  rows.forEach((r, i) => {
    expect(r.views, `${i} コマ目: 区画は 2 つ`).toBe(2);
    expect(r.view, `${i} コマ目: 左右`).toBe('split');
    expect(r.full, `${i} コマ目: 全面の 光の 道で 描いた コマ`).toBe(0);
    expect(r.p1.charge, `${i} コマ目: 1P は ためて いない`).toBeNull();
    expect(r.p1.move, `${i} コマ目: 1P の わざは 出て いない`).toBeNull();
    expect(r.cam1, `${i} コマ目: 1P の カメラの きょりは ふだん`).toBeCloseTo(DUO_TUNING.cameraSplit, 3);
  });

  // ---- 絵（AC106 前半）: 2P の 雷の 板は 2P の カメラを 向く（1P の カメラでは ない）----
  const seen = rows.filter((r) => r.bolt2?.visible);
  expect(seen.length, '2P の 雷の 板が 見えた コマが ある（duo.thunder(2)。2 人の ときも 雷の 絵が 描かれる）').toBeGreaterThan(0);
  for (const r of seen) {
    const layers = r.bolt2!.layers.filter((l) => l.visible);
    expect(layers.length).toBeGreaterThan(0);
    for (const l of layers) {
      // 2P は 雷の 南に いて 北を 向く → 板の おもては 南（+z）。1P の カメラは 東 → +x だった ら 1P を 向いて いる
      expect(l.normal.z, '板の おもては 2P の カメラ（南）を 向く').toBeGreaterThan(0.9);
      expect(Math.abs(l.normal.x), '1P の カメラ（東）を 向いて いない').toBeLessThan(0.4);
    }
  }
  expect(
    rows.every((r) => !r.bolt1),
    '1P の 雷の 絵には 2P の 雷が 出ない',
  ).toBe(true);

  // ---- 結果 ----
  const after = await page.evaluate(() => {
    const h = (window as any).__rikkun;
    return {
      lv1: h.duo.level(1),
      lv2: h.duo.level(2),
      imp1: h.duo.impact(1).log as { tick: number; level: string }[],
      imp2: h.duo.impact(2).log as { tick: number; level: string }[],
      hp: Object.fromEntries(h.yokai.list().map((y: any) => [y.id, y.hp])) as Record<number, number>,
      events1: h.legend.events().filter((e: any) => e.type === 'lightningStrike').length as number,
      full: h.duo.state().fullPass as number,
    };
  });
  expect(after.hp[tough], '雷が 妖怪に 当たって 体力が へった').toBeLessThan(400);
  expect(after.hp[weak] === undefined || after.hp[weak]! <= 0, '1 発で 倒れる 妖怪は 倒れた').toBe(true);
  expect(after.lv2, '2P の わざで 倒したので けいけんちは 2P に 入る').not.toEqual(before.lv2);
  expect(after.lv1, '1P の けいけんちは かわらない').toEqual(before.lv1);
  expect(after.imp2.length, '2P の 口に 手ごたえが 出た').toBeGreaterThan(before.imp2);
  expect(after.imp1.length, '1P の 口には 出ない').toBe(before.imp1);
  expect(after.events1, '1P の わざの 出来事には 2P の 雷が まざらない').toBe(0);
  expect(after.full).toBe(0);
  expect(await page.evaluate(() => (window as any).__rikkun.duo.viewports().length)).toBe(2);
});
