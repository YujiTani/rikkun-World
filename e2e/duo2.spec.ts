import { expect, test, type Page } from '@playwright/test';
import { standOnGround } from './helpers/aim';
import { DUO_RENDER_BUDGET, DUO_RENDER_MIN, measureDuoRender, measureRender } from './helpers/duoBudget';
import { DUO_COLORS } from '../src/duo/tuning';
import type { DuoArrow, DuoState, DuoVec3, DuoViewport } from '../src/duo/types';

/**
 * COOP-1 作業 2（#399。docs/design/COOP-1.md §2.3〜2.5・§5・§7.2・§12.0・AC25・AC26・AC27・AC29・AC30・AC31）の E2E。
 * 作業 3e（#422。1.8）で 「2P が いる あいだ ずっと 左右」・矢印・「しゅっ」の 形に 直した（1 画面・ルーペ・色の 段の テストは 消した）。実装の 前に 書いた 赤の テスト。
 * 数・座標は 決め打ちせず、ゲーム（window.__rikkun.duo）に 聞く。進めるのは step の 数で、時間（ms）では 合否を 決めない（#255）。
 * 矢印の 細かい 数（18 ステップ・90%／80%・4 マス・置き場・色）は ユニット（src/duo/arrow.test.ts）。画面の 重なり・色は UI 検査（e2e/ui-gate.spec.ts の duo-split など）。
 *
 * ---- 開発への つなぎ目の 約束 ----
 *   duo.viewports()   いま 描いている 区画の 一覧（型は src/duo/types.ts の DuoViewport / DuoViewportsHook）。
 *                     2P が いなければ [1P 全面]、いれば いつも [1P 左半分, 2P 右半分]（近くても 遠くても）。camera = その 区画を 描く カメラの 世界の 位置、yawDeg = 向き。
 *   duo.state()       view（'one' | 'split'）・rings・columns・light は 仕様 §12.0 のとおり。`tier`・`loupe` は ない。rings は 距離 > 48 で 2・< 32 で 1（あいだは 今のまま）。
 *   duo.arrow(who)    仕様 §12.0（1.8）。{ x, y, angle, color } か null。画面の 目印は data-testid="duo-arrow-p1"（1P の 半分の 矢印）・"duo-arrow-p2"。
 *   audio.sfx()       2P が 参加して 分かれる 時に 名前 `duoSplit` が 1 つ（やめる 時・距離が かわる 時は 入らない。AC69）。
 *   向き              yaw 90 の とき 前が +x・右が +z（PlayerController と 同じ 決まり）。2P を 1P の「左」に 置く = z を 減らす。
 *   ゲームの 起動      ?duo=dev（作業 1 と 同じ）。E2E の サーバーは 小さい 輪（RING_SMALL）。
 */

async function open(page: Page, query = '?nosave=1&duo=dev'): Promise<void> {
  await page.goto('/' + query);
  await page.waitForFunction(() => (window as any).__rikkun?.ready === true);
  await page.evaluate(() => {
    (window as any).__rikkun.pause();
    (window as any).__rikkun.achievements.mute(true);
  });
}

const step = (page: Page, n: number) => page.evaluate((n) => (window as any).__rikkun.step(n), n);
const duoState = (page: Page) => page.evaluate(() => (window as any).__rikkun.duo.state() as DuoState);
const pos = (page: Page, who: 1 | 2) => page.evaluate((who) => (window as any).__rikkun.duo.pos(who) as DuoVec3 | null, who);
const viewports = (page: Page) => page.evaluate(() => (window as any).__rikkun.duo.viewports() as DuoViewport[]);
const arrow = (page: Page, who: 1 | 2) => page.evaluate((who) => (window as any).__rikkun.duo.arrow(who) as DuoArrow | null, who);
/** 前に 読んでから ふえた「しゅっ」（duoSplit）の 数。audio.sfx() は 読むと 空になる */
const newSplitSounds = (page: Page): Promise<number> =>
  page.evaluate(() => (window as any).__rikkun.audio.sfx().filter((r: any) => r.name === 'duoSplit' && !r.dropped).length as number);

/** 2P を 1P から (前, 右) マスの 所に 置く。足もとは 平らに ならす(地形の ちがいを なくす)。1P の 向きは yaw 90（前 = +x・右 = +z） */
async function placeP2(page: Page, fwd: number, right: number, flat = true): Promise<void> {
  await page.evaluate(
    ({ fwd, right, flat }) => {
      const h = (window as any).__rikkun;
      const p1 = h.duo.pos(1);
      const x = p1.x + fwd;
      const z = p1.z + right;
      const fy: number = h.world.groundHeight(Math.floor(x), Math.floor(z));
      if (flat) {
        h.world.fill(Math.floor(x) - 4, fy, Math.floor(z) - 4, Math.floor(x) + 4, fy, Math.floor(z) + 4, 'stone');
        h.world.fill(Math.floor(x) - 4, fy + 1, Math.floor(z) - 4, Math.floor(x) + 4, fy + 12, Math.floor(z) + 4, 'air');
      }
      h.duo.place(2, { x, y: fy + 1, z });
    },
    { fwd, right, flat },
  );
}

async function startDuo(page: Page, query?: string): Promise<void> {
  await open(page, query);
  await standOnGround(page, 100.5, 100.5, { yaw: 90 });
  expect(await page.evaluate(() => (window as any).__rikkun.duo.join())).toBe(true);
  await step(page, 30);
}

const dist3 = (a: DuoVec3, b: DuoVec3) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const angleDiff = (a: number, b: number) => Math.abs((((a - b) % 360) + 540) % 360 - 180);

test('AC25・AC26: 2P が いる あいだは 近くても 遠くても 左半分が 1P、右半分が 2P のカメラ（2P が 左にいても 入れかわらない）。2P の 向きは 参加した 瞬間の 画面の 向きと 同じ', async ({ page }) => {
  await startDuo(page);
  const vw: number = await page.evaluate(() => innerWidth);
  const yawBefore: number = await page.evaluate(() => (window as any).__rikkun.player.get().yawDeg);
  const cases = [
    { name: '近い（参加した ところ。1P の 右 2 マス）', place: null },
    { name: '1P の 左 40 マス', place: [0, -40] },
    { name: '1P の 右 40 マス', place: [0, 40] },
    { name: '1P の うしろ 60 マス（輪 2 つ）', place: [-60, 0] },
  ] as const;
  for (const c of cases) {
    if (c.place) {
      await placeP2(page, c.place[0], c.place[1]);
      await step(page, 20);
    }
    expect((await duoState(page)).view, c.name).toBe('split');
    const vps = await viewports(page);
    expect(vps, c.name).toHaveLength(2);
    expect(vps[0]!.who).toBe(1);
    expect(vps[0]!.x).toBeCloseTo(0, 0);
    expect(vps[0]!.w).toBeCloseTo(vw / 2, 0);
    expect(vps[1]!.who).toBe(2);
    expect(vps[1]!.x).toBeCloseTo(vw / 2, 0);
    expect(vps[1]!.w).toBeCloseTo(vw / 2, 0);
    const p1 = (await pos(page, 1))!;
    const p2 = (await pos(page, 2))!;
    expect(dist3(vps[0]!.camera, p1), `${c.name}: 左の カメラは 1P の そば`).toBeLessThan(10);
    expect(dist3(vps[1]!.camera, p2), `${c.name}: 右の カメラは 2P の そば`).toBeLessThan(10);
    if (c.place) expect(dist3(vps[1]!.camera, p1), `${c.name}: 右の カメラは 1P から 遠い`).toBeGreaterThan(20);
    expect(angleDiff(vps[1]!.yawDeg, yawBefore), `${c.name}: 2P の カメラの 向き（回していない）`).toBeLessThanOrEqual(1);
    expect(angleDiff(vps[0]!.yawDeg, yawBefore)).toBeLessThanOrEqual(1);
  }
});

test('AC29: 2P だけが 1P から 200 マス 行っても 落ちない(読みこみ中は 止まって 待ち、読みこまれたら 着地)。見えない 壁は ない。1P は 遊べる', async ({ page }) => {
  await startDuo(page);
  const p1 = (await pos(page, 1))!;
  // 読みこみを 止めて から、地面より ずっと 高い 所(1P の 足もとの 30 マス上)に 置く: 読みこまれて いない 列
  await page.evaluate(() => (window as any).__rikkun.world.setStreamWork(0));
  const gh1: number = await page.evaluate((p) => (window as any).__rikkun.world.groundHeight(Math.floor(p.x), Math.floor(p.z)), p1);
  await page.evaluate(
    ({ p1, gh1 }) => (window as any).__rikkun.duo.place(2, { x: p1.x + 200, y: gh1 + 30, z: p1.z }),
    { p1, gh1 },
  );
  const start = (await pos(page, 2))!;
  const farGh: number = await page.evaluate((p) => (window as any).__rikkun.world.groundHeight(Math.floor(p.x), Math.floor(p.z)), start);
  expect(Number.isFinite(farGh), '読みこまれて いない 列の groundHeight は 数を 返す(例外や NaN にならない)').toBe(true);
  await step(page, 120);
  const waiting = (await pos(page, 2))!;
  expect(waiting.y, '読みこみ中は 止まって 待つ(落ちない)').toBeGreaterThanOrEqual(start.y - 0.01);
  expect(waiting.x, '見えない 壁で もどされない').toBeGreaterThan(p1.x + 150);
  expect(start.y, '地面より 高い').toBeGreaterThan(gh1 + 20);

  // 読みこみを 再開: 読みこまれたら 着地
  await page.evaluate(() => (window as any).__rikkun.world.setStreamWork(null));
  let minY = waiting.y;
  let last = -1e9;
  let settled = false;
  for (let i = 0; i < 200 && !settled; i++) {
    await step(page, 15);
    const p = (await pos(page, 2))!;
    minY = Math.min(minY, p.y);
    const gh: number = await page.evaluate((p) => (window as any).__rikkun.world.groundHeight(Math.floor(p.x), Math.floor(p.z)), p);
    if (Math.abs(p.y - last) < 0.01 && Math.abs(p.y - (gh + 1)) < 1.5) settled = true;
    last = p.y;
  }
  expect(minY, '世界の 底へ 落ちない').toBeGreaterThan(0);
  expect(settled, '読みこまれたら 地面に 着地して 止まる').toBe(true);
  const landed = (await pos(page, 2))!;
  expect(landed.x, 'step のあとでも 遠くに いる(見えない 壁なし)').toBeGreaterThan(p1.x + 150);
  const s = await duoState(page);
  expect(s.rings).toBe(2);
  expect(s.columns).toBeLessThanOrEqual(595);
  expect(s.view).toBe('split');

  // 2P が 待っていた あいだも 1P は 遊べる(歩ける)。「クリックして あそぼう」を 閉じた 状態(ロック中)に する
  await page.evaluate(() => (window as any).__rikkun.lock.simulate(true));
  const a = (await pos(page, 1))!;
  await page.evaluate(() => (window as any).__rikkun.input.press('moveForward'));
  await step(page, 30);
  await page.evaluate(() => (window as any).__rikkun.input.release('moveForward'));
  const b = (await pos(page, 1))!;
  expect(Math.hypot(b.x - a.x, b.z - a.z), '1P は 歩ける').toBeGreaterThan(0.5);
});

test('AC27: 輪の 数は 48 より 遠いと 2・32 より 近いと 1(あいだは 今のまま)。持つ 列は いつも 595 以下', async ({ page }) => {
  await startDuo(page);
  const at = async (fwd: number): Promise<DuoState> => {
    await placeP2(page, fwd, 0);
    await step(page, 5);
    return duoState(page);
  };
  expect((await duoState(page)).rings).toBe(1);
  expect((await at(40)).rings, '1 のとき 40 は 1 のまま').toBe(1);
  expect((await at(60)).rings, '48 より 遠い').toBe(2);
  expect((await at(40)).rings, '2 のとき 40 は 2 のまま').toBe(2);
  expect((await at(20)).rings, '32 より 近い').toBe(1);
  expect((await at(40)).rings, '1 に 戻ったら 40 は 1').toBe(1);
  await step(page, 300);
  for (const fwd of [60, 20, 70, 10]) {
    const s = await at(fwd);
    expect(s.columns, `距離 ${fwd}`).toBeLessThanOrEqual(595);
    await step(page, 120);
    expect((await duoState(page)).columns, `距離 ${fwd} (落ちついたあと)`).toBeLessThanOrEqual(595);
  }
});

test('AC21・AC30・AC69・AC85（通し）: 参加 → いつも 左右 → 遠いと 矢印 → 近いと 消える → やめる → 1 人の 全面。「しゅっ」は 参加の 時だけ', async ({ page }) => {
  await open(page);
  await standOnGround(page, 100.5, 100.5, { yaw: 90 });
  await page.mouse.click(0, 0); // 音を つかえる ように する（audio.sfx() の 記録に 必要）
  await newSplitSounds(page); // 記録を 空に する
  const vw: number = await page.evaluate(() => innerWidth);
  const vh: number = await page.evaluate(() => innerHeight);
  let s = await duoState(page);
  expect(s.view).toBe('one');
  expect(s.light).toBe(false);
  expect((await viewports(page)).map((v) => v.who)).toEqual([1]);
  expect(await arrow(page, 1)).toBeNull();
  expect(await arrow(page, 2)).toBeNull();
  expect(s).not.toHaveProperty('tier');
  expect(s).not.toHaveProperty('loupe');

  // 参加: その ステップから 左右。「しゅっ」が 1 つ。軽くする 工夫が 入る
  expect(await page.evaluate(() => (window as any).__rikkun.duo.join())).toBe(true);
  await step(page, 1);
  s = await duoState(page);
  expect(s.view).toBe('split');
  expect(s.light).toBe(true);
  expect((await viewports(page)).map((v) => v.who)).toEqual([1, 2]);
  expect(await newSplitSounds(page), '参加して 分かれる 時に「しゅっ」').toBe(1);
  await step(page, 60);
  expect(await arrow(page, 1), '2 マスの すぐ 横: 矢印は いらない').toBeNull();
  expect(await arrow(page, 2)).toBeNull();

  // 距離を かえても いつも 分割（23.9／24.1 のような ゆれ止めは ない）。「しゅっ」は 鳴らない
  for (const fwd of [8, 17, 23.9, 24.1, 60, 3]) {
    await placeP2(page, 0, -fwd);
    await step(page, 5);
    s = await duoState(page);
    expect(s.view, `距離 ${fwd}`).toBe('split');
    expect(s.light, `距離 ${fwd}`).toBe(true);
  }
  expect(await newSplitSounds(page), '距離が かわっても「しゅっ」は 鳴らさない').toBe(0);

  // 遠く（1P の 左 40 マス）: 18 ステップあとに 両方の 半分に 矢印。1P の 矢印は 2P（左）を さす・2P の 矢印は 1P（右）を さす。色は 相手の 色
  await placeP2(page, 0, -40);
  await step(page, 40);
  const a1 = await arrow(page, 1);
  const a2 = await arrow(page, 2);
  expect(a1, '1P の 半分: 2P を さす').not.toBeNull();
  expect(a2, '2P の 半分: 1P を さす').not.toBeNull();
  expect(angleDiff(a1!.angle, 270), '2P は 1P の 左').toBeLessThanOrEqual(45);
  expect(angleDiff(a2!.angle, 90), '1P は 2P の 右').toBeLessThanOrEqual(45);
  expect(a1!.x).toBeGreaterThanOrEqual(0);
  expect(a1!.x).toBeLessThanOrEqual(vw / 2);
  expect(a2!.x).toBeGreaterThanOrEqual(vw / 2);
  expect(a2!.x).toBeLessThanOrEqual(vw);
  await expect(page.getByTestId('duo-arrow-p1')).toBeVisible();
  await expect(page.getByTestId('duo-arrow-p2')).toBeVisible();
  expect(a1!.color.toLowerCase(), '1P の 半分の 矢印は 2P の 色').toBe(DUO_COLORS.p2.toLowerCase());
  expect(a2!.color.toLowerCase(), '2P の 半分の 矢印は 1P の 色').toBe(DUO_COLORS.p1.toLowerCase());

  // 1P の うしろ 21 マス: 1P の 矢印は 下向き（まうしろ ≒ 180°）で 下の 22% には かからない
  await placeP2(page, -21, 0);
  await step(page, 40);
  const back = await arrow(page, 1);
  expect(back).not.toBeNull();
  expect(angleDiff(back!.angle, 180), 'まうしろ').toBeLessThanOrEqual(20);
  expect(back!.y).toBeLessThanOrEqual(vh * 0.78 + 1);

  // 近づく（2 マス）: その ステップで 両方 消える（4 マス以下）
  await placeP2(page, 0, 2);
  await step(page, 1);
  expect(await arrow(page, 1)).toBeNull();
  expect(await arrow(page, 2)).toBeNull();
  expect((await duoState(page)).view).toBe('split');

  // やめる: 1 人の 全面。矢印は ない。「しゅっ」は 鳴らさない。2 秒あとに 軽くする 工夫が 元に もどる
  await page.evaluate(() => (window as any).__rikkun.duo.leave());
  await step(page, 1);
  s = await duoState(page);
  expect(s.joined).toBe(false);
  expect(s.view).toBe('one');
  expect((await viewports(page)).map((v) => v.who)).toEqual([1]);
  expect(await arrow(page, 1)).toBeNull();
  expect(await arrow(page, 2)).toBeNull();
  await step(page, 130);
  expect((await duoState(page)).light, '2 秒後に 元').toBe(false);
  expect(await newSplitSounds(page), 'やめる 時は 鳴らさない').toBe(0);

  // また 参加: また 1 つ
  expect(await page.evaluate(() => (window as any).__rikkun.duo.join())).toBe(true);
  await step(page, 1);
  expect((await duoState(page)).view).toBe('split');
  expect(await newSplitSounds(page), '参加の たびに 1 つ').toBe(1);
});

test('AC31: 2P が 近い（2 マス・輪 1 つ）時と 遠い（60 マス・輪 2 つ）時の 描画回数と 三角形が DUO_RENDER_BUDGET の 倍率以下（同じ テストの 中で 1 人のときと くらべる）', async ({ page }) => {
  await open(page, '?nosave=1&ring=small&duo=dev');
  const solo = await measureRender(page);
  expect(await page.evaluate(() => (window as any).__rikkun.duo.join())).toBe(true);
  await step(page, 30);
  test.info().annotations.push({ type: 'solo', description: JSON.stringify(solo) });
  const cases = [
    { name: 'near', rel: { dx: 0, dz: 2 }, rings: 1 },
    { name: 'far', rel: { dx: 0, dz: -60 }, rings: 2 },
  ] as const;
  for (const c of cases) {
    const m = await measureDuoRender(page, c.rel);
    test.info().annotations.push({ type: c.name, description: JSON.stringify(m) });
    expect(m.view, `${c.name}: 近くても 遠くても 分割で 測れて いる`).toBe('split');
    expect(m.viewports, `${c.name}: 2 つの 区画を 描く`).toBe(2);
    expect((await duoState(page)).rings, `${c.name} の 輪の 数`).toBe(c.rings);
    const lo = DUO_RENDER_MIN.split;
    expect(m.drawCalls, `${c.name} 描画回数の 下限（1 人 ${solo.drawCalls} の ${lo.drawCalls} 倍以上 = 2 回 描いて いる）`).toBeGreaterThanOrEqual(Math.ceil(solo.drawCalls * lo.drawCalls));
    const b = DUO_RENDER_BUDGET.split;
    expect(m.drawCalls, `${c.name} 描画回数（1 人 ${solo.drawCalls} の ${b.drawCalls} 倍まで）`).toBeLessThanOrEqual(Math.ceil(solo.drawCalls * b.drawCalls));
    expect(m.triangles, `${c.name} 三角形（1 人 ${solo.triangles} の ${b.triangles} 倍まで）`).toBeLessThanOrEqual(Math.ceil(solo.triangles * b.triangles));
    expect((await duoState(page)).columns, `${c.name} 列`).toBeLessThanOrEqual(595);
  }
});
