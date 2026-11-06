import { expect, test, type Page } from '@playwright/test';
import { standOnGround } from './helpers/aim';
import { DUO_RENDER_BUDGET, measureDuoRender, measureRender } from './helpers/duoBudget';
import type { DuoState, DuoVec3, DuoViewport } from '../src/duo/types';

/**
 * COOP-1 作業 2（#399。docs/design/COOP-1.md §2.3〜2.5・§5・§7.2・§12.0・AC25・AC26・AC27・AC29・AC30・AC31）の E2E。実装の 前に 書いた 赤の テスト。
 * 数・座標は 決め打ちせず、ゲーム（window.__rikkun.duo）に 聞く。進めるのは step の 数で、時間（ms）では 合否を 決めない（#255）。
 * ルーペ・色の 段・ようすの 切りかえ の 細かい 数は ユニット（src/duo/view.test.ts ほか）。画面の 重なり・色は UI 検査（e2e/ui-gate.spec.ts の duo-loupe など）。
 *
 * ---- 開発への つなぎ目の 約束 ----
 *   duo.viewports()   いま 描いている 区画の 一覧（型は src/duo/types.ts の DuoViewport / DuoViewportsHook）。
 *                     'one' = [1P 全面]、'loupe' = [1P 全面, 2P の ルーペ]、'split' = [1P 左半分, 2P 右半分]。camera = その 区画を 描く カメラの 世界の 位置、yawDeg = 向き。
 *   duo.state()       view・tier・rings・columns・light・loupe は 仕様 §12.0 のとおり。rings は 距離 > 48 で 2・< 32 で 1（あいだは 今のまま）。
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

test('AC25・AC26: 分割のとき 左半分が 1P、右半分が 2P のカメラ（2P が 左にいても 入れかわらない）。2P の 向きは その前の 画面の 向きと 同じ', async ({ page }) => {
  await startDuo(page);
  const vw: number = await page.evaluate(() => innerWidth);
  const yawBefore: number = await page.evaluate(() => (window as any).__rikkun.player.get().yawDeg);
  expect((await viewports(page)).map((v) => v.who), '近いときは 1P の 全面だけ').toEqual([1]);

  await placeP2(page, 0, -40); // 1P の 左 40 マス
  await step(page, 100);
  expect((await duoState(page)).view).toBe('split');
  for (const side of ['左', '右'] as const) {
    if (side === '右') {
      await placeP2(page, 0, 40); // 1P の 右 40 マスに うつしても 入れかわらない
      await step(page, 20);
      expect((await duoState(page)).view).toBe('split');
    }
    const vps = await viewports(page);
    expect(vps, `2P が 1P の ${side}`).toHaveLength(2);
    expect(vps[0]!.who).toBe(1);
    expect(vps[0]!.x).toBeCloseTo(0, 0);
    expect(vps[0]!.w).toBeCloseTo(vw / 2, 0);
    expect(vps[1]!.who).toBe(2);
    expect(vps[1]!.x).toBeCloseTo(vw / 2, 0);
    expect(vps[1]!.w).toBeCloseTo(vw / 2, 0);
    const p1 = (await pos(page, 1))!;
    const p2 = (await pos(page, 2))!;
    expect(dist3(vps[0]!.camera, p1), '左の カメラは 1P の そば').toBeLessThan(10);
    expect(dist3(vps[1]!.camera, p2), '右の カメラは 2P の そば').toBeLessThan(10);
    expect(dist3(vps[1]!.camera, p1), '右の カメラは 1P から 遠い').toBeGreaterThan(20);
    expect(angleDiff(vps[1]!.yawDeg, yawBefore), '分割した 瞬間の 2P の 向き').toBeLessThanOrEqual(1);
    expect(angleDiff(vps[0]!.yawDeg, yawBefore)).toBeLessThanOrEqual(1);
  }
});

test('AC29: 2P だけが 1P から 200 マス 行っても 落ちない(読みこみ中は 止まって 待つ)。見えない 壁は ない。1P は 遊べる', async ({ page }) => {
  await startDuo(page);
  const p1 = (await pos(page, 1))!;
  await placeP2(page, 200, 0, false); // 地形は ならさない(まだ 読みこまれて いない 所)
  const y0 = (await pos(page, 2))!.y;
  expect((await pos(page, 2))!.x, '見えない 壁で もどされない').toBeGreaterThan(p1.x + 150);
  let minY = y0;
  let last = -1e9;
  let settled = false;
  for (let i = 0; i < 80 && !settled; i++) {
    await step(page, 15);
    const p = (await pos(page, 2))!;
    minY = Math.min(minY, p.y);
    const gh: number = await page.evaluate((p) => (window as any).__rikkun.world.groundHeight(Math.floor(p.x), Math.floor(p.z)), p);
    if (Math.abs(p.y - last) < 0.01 && Math.abs(p.y - (gh + 1)) < 1.5) settled = true;
    last = p.y;
  }
  expect(minY, '世界の 底へ 落ちない').toBeGreaterThan(0);
  expect(settled, '読みこまれたら 地面に 立つ').toBe(true);
  const s = await duoState(page);
  expect(s.rings).toBe(2);
  expect(s.columns).toBeLessThanOrEqual(595);
  expect(s.view).toBe('split');

  // 2P が 待っている あいだも 1P は 遊べる(歩ける)
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

test('AC21〜AC24・AC30（通し）: 1 画面 → ルーペ → 分割 → 1 画面。ルーペは 2P の 方向の はし・分割の あいだだけ 軽くする 工夫が 入り、戻って 2 秒後に 元', async ({ page }) => {
  await startDuo(page);
  const vw: number = await page.evaluate(() => innerWidth);
  const vh: number = await page.evaluate(() => innerHeight);
  let s = await duoState(page);
  expect(s.view).toBe('one');
  expect(s.light).toBe(false);
  expect(s.loupe).toBeNull();

  // 2P が 1P の うしろ 21 マス(画面の 外・24 より 近い): ルーペ。2 段目 = 20 以上
  await placeP2(page, -21, 0);
  await step(page, 40);
  s = await duoState(page);
  expect(s.view).toBe('loupe');
  expect(s.tier).toBe(2);
  expect(s.light, 'ルーペでは 軽くしない').toBe(false);
  expect(s.loupe).not.toBeNull();
  const lp = s.loupe!;
  expect(lp.d).toBeCloseTo(vh * 0.2, 0);
  expect(lp.y - lp.d / 2).toBeGreaterThanOrEqual(vh * 0.12 - 1);
  expect(lp.y + lp.d / 2).toBeLessThanOrEqual(vh * 0.78 + 1);
  expect(lp.x - lp.d / 2).toBeGreaterThanOrEqual(15);
  expect(lp.x + lp.d / 2).toBeLessThanOrEqual(vw - 15);
  expect((await viewports(page)).map((v) => v.who)).toEqual([1, 2]);

  // 遠く(24 以上): 分割。分割の あいだだけ 軽く する
  await placeP2(page, 0, -40);
  await step(page, 80);
  s = await duoState(page);
  expect(s.view).toBe('split');
  expect(s.light).toBe(true);
  expect(s.loupe).toBeNull();
  expect(s.tier).toBe(2);

  // 近く: 17 以下が 60 ステップで 1 画面に 戻る。軽くする 工夫は まだ 入ったまま
  await placeP2(page, 0, 2);
  await step(page, 59);
  expect((await duoState(page)).view, '59 ステップでは 分割の まま').toBe('split');
  await step(page, 6);
  s = await duoState(page);
  expect(s.view).toBe('one');
  expect(s.tier, '分割から 戻る とき 1 段目 以下').toBeLessThan(2);
  expect(s.light, '戻って すぐは まだ 軽い').toBe(true);
  await step(page, 130);
  s = await duoState(page);
  expect(s.light, '2 秒後に 元').toBe(false);
  expect(s.view).toBe('one');
});

test('AC31: 1 画面・ルーペ・分割の 描画回数と 三角形が DUO_RENDER_BUDGET の 倍率以下(同じ テストの 中で 1 人のときと くらべる)', async ({ page }) => {
  await open(page, '?nosave=1&ring=small&duo=dev');
  const solo = await measureRender(page);
  expect(await page.evaluate(() => (window as any).__rikkun.duo.join())).toBe(true);
  await step(page, 30);
  test.info().annotations.push({ type: 'solo', description: JSON.stringify(solo) });
  const cases = [
    { name: 'one', rel: { dx: 0, dz: 2 } },
    { name: 'loupe', rel: { dx: -21, dz: 0 } },
    { name: 'split', rel: { dx: 0, dz: -40 } },
  ] as const;
  for (const c of cases) {
    const m = await measureDuoRender(page, c.rel);
    test.info().annotations.push({ type: c.name, description: JSON.stringify(m) });
    expect(m.view, `${c.name} の ようすで 測れて いる`).toBe(c.name);
    const b = DUO_RENDER_BUDGET[c.name];
    expect(m.drawCalls, `${c.name} 描画回数（1 人 ${solo.drawCalls} の ${b.drawCalls} 倍まで）`).toBeLessThanOrEqual(Math.ceil(solo.drawCalls * b.drawCalls));
    expect(m.triangles, `${c.name} 三角形（1 人 ${solo.triangles} の ${b.triangles} 倍まで）`).toBeLessThanOrEqual(Math.ceil(solo.triangles * b.triangles));
  }
  const s = await duoState(page);
  expect(s.columns).toBeLessThanOrEqual(595);
});
