import { test, expect, type Page } from '@playwright/test';
import { openShadow, flatGrass, FLOOR_Y, settleLight, frames, type Shade } from './helpers/shadow';

/**
 * #144 SHADOW-2（段 2: たいまつの影）の受け入れテスト。docs/design/SHADOW.md §8（共通の決まり・AC10・AC11・AC12 の続き）。
 * 実装の前に書いた。決まり（rule #130）: 一時停止・tick を指定・ゲームに聞く。壁の時計で待たない（`shadow.advance` で tick を進める）。
 * 画素は同じコマで「かげ オン」と「オフ」を並べて比べる（絶対値を決め打ちしない）。
 * 窓口: `shadow.stats().torch` = { count（使っている地図の数）, redraws（resetStats からの描き直し）, frameRedrawn, frameDraws, frameTriangles }。
 * たいまつの影はキャラ・妖怪だけ（オーナーの決定 2026-10-16）。世界のブロックは地図に入らない。
 */
test.describe.configure({ timeout: 180_000 });

const DAY = 14000;

type TorchStats = { count: number; redraws: number; frameRedrawn: number; frameDraws: number; frameTriangles: number };
const torchStats = (page: Page) => page.evaluate(() => (window as any).__rikkun.shadow.stats().torch as TorchStats);
const advance = (page: Page, ticks: number, every = 1) => page.evaluate(([t, e]) => (window as any).__rikkun.shadow.advance(t, e), [ticks, every] as const);
const shade = (page: Page, p: { x: number; y: number; z: number }, shadow: boolean) =>
  page.evaluate(([q, on]) => (window as any).__rikkun.shadow.shadeAt(q.x, q.y, q.z, { shadow: on }) as Shade, [p, shadow] as const);

/**
 * 洞くつ（石の部屋 x 40..60・z 40..70、空の光なし）。たいまつを torches に置く。
 * 光の式を動かさないよう、tick は固定（昼）。たいまつの地図ができる（count が 1 以上）まで、ゲームに聞きながら tick を進める。
 */
async function caveScene(page: Page, torches: Array<[number, number]>, player: { x: number; z: number }): Promise<void> {
  await flatGrass(page, -4, -4, 74, 74);
  await page.evaluate(([ts, pl, fy, tick]) => {
    const h = (window as any).__rikkun;
    h.world.fill(40, fy, 40, 60, fy + 8, 70, 'stone');
    h.world.fill(41, fy + 1, 41, 59, fy + 7, 69, 'air');
    for (const [x, z] of ts) h.world.setBlock(x, fy + 1, z, 'torch');
    h.player.set({ position: { x: pl.x, y: fy + 1, z: pl.z }, velocity: { x: 0, y: 0, z: 0 }, yaw: 90, pitch: 10 });
    h.time.set(tick);
    h.step(3);
  }, [torches, player, FLOOR_Y, DAY] as const);
  await settleLight(page);
  await frames(page, 2);
  await waitTorchMap(page);
}

/** たいまつの地図が 1 つ以上できるまで tick を進める（上限つき。ゲームに聞く） */
async function waitTorchMap(page: Page): Promise<void> {
  const n = await page.evaluate(() => {
    const h = (window as any).__rikkun;
    for (let i = 0; i < 120; i++) {
      if (h.shadow.stats().torch.count > 0) return i;
      h.shadow.advance(1, 1);
    }
    return -1;
  });
  expect(n, 'たいまつの地図ができた（stats().torch.count > 0）').toBeGreaterThanOrEqual(0);
}

/** 光の源（たいまつ）から player をむすぶ向きの先 d ブロックの床の点（水平）。y は床の面の高さ */
function beyond(torch: { x: number; z: number }, from: { x: number; z: number }, d: number) {
  const dx = from.x - (torch.x + 0.5);
  const dz = from.z - (torch.z + 0.5);
  const n = Math.hypot(dx, dz);
  return { x: from.x + (dx / n) * d, y: FLOOR_Y + 1, z: from.z + (dz / n) * d };
}

test.describe('SHADOW-2 たいまつの影', () => {
  test('AC10: 洞くつ（たいまつ 1 本）で、たいまつの反対へキャラから 1 ブロックの床は、キャラがいないときの 0.6 倍以下', async ({ page }) => {
    await openShadow(page);
    const torch = { x: 46, z: 41 };
    const me = { x: 46.5, z: 45.5 };
    await caveScene(page, [[torch.x, torch.z]], me);
    const info = await page.evaluate((fy) => (window as any).__rikkun.world.lightAt(46, fy + 1, 47), FLOOR_Y);
    expect(info.sky, '洞くつの空の光（空なし）').toBeLessThanOrEqual(8);
    expect((await torchStats(page)).count, 'たいまつ 1 本').toBe(1);
    const p = beyond(torch, me, 1);
    // 同じコマで: 影オン（キャラの影あり）と 影オフ（キャラの影なし = キャラがいないときの床）
    const on = await shade(page, p, true);
    const off = await shade(page, p, false);
    expect(off.luma, '比べる床がまっ黒でない（たいまつの光がとどく）').toBeGreaterThan(0.05);
    expect(on.luma / off.luma, `床の明るさ ${on.luma} / ${off.luma}`).toBeLessThanOrEqual(0.6);
    // たいまつの側（影の反対）の床は変わらない（影がキャラの反対側にだけ出る）
    const q = beyond(torch, me, -1);
    const qOn = await shade(page, q, true);
    const qOff = await shade(page, q, false);
    expect(Math.abs(qOn.luma - qOff.luma), `たいまつ側 ${qOn.luma} ${qOff.luma}`).toBeLessThanOrEqual(0.05 * Math.max(qOff.luma, 0.05));
    await page.screenshot({ path: 'test-shots/assets/SHADOW-2-cave-char.png' });
  });

  test('AC10: 妖怪 1 体でも たいまつの反対に影が出る', async ({ page }) => {
    await openShadow(page);
    const torch = { x: 46, z: 41 };
    const me = { x: 52.5, z: 41.5 }; // キャラの影は 別の向き（+x）。妖怪の影と まざらない
    await caveScene(page, [[torch.x, torch.z]], me);
    const yk = { x: 46.5, z: 45.5 };
    await page.evaluate(([y, fy]) => {
      const h = (window as any).__rikkun;
      h.yokai.spawn('karakasa', y.x, fy + 1, y.z, { ai: false });
      h.step(2);
    }, [yk, FLOOR_Y] as const);
    await advance(page, 5);
    const p = beyond(torch, yk, 1);
    const on = await shade(page, p, true);
    const off = await shade(page, p, false);
    expect(off.luma).toBeGreaterThan(0.05);
    expect(on.luma / off.luma, `妖怪の影 ${on.luma} / ${off.luma}`).toBeLessThanOrEqual(0.6);
    await page.screenshot({ path: 'test-shots/assets/SHADOW-2-cave-yokai.png' });
  });

  test('AC11: たいまつを 3 本おいても 使う地図は 2 本まで。動く物が半径 11 にいない 600 tick は 描き直し 0', async ({ page }) => {
    await openShadow(page);
    const near = { x: 46.5, z: 46.5 };
    await caveScene(page, [[44, 41], [46, 41], [48, 41]], near);
    await advance(page, 40, 1); // たいまつをさがし直す（30 コマごと）
    expect((await torchStats(page)).count, '3 本おいても 2 本まで').toBe(2);

    // 遠くへ（たいまつは 16 以内で見つかるが、動く物は 半径 11 の外）。1 回は「動く物がいた」ぶんの描き直しが入るので 少し進めてから数える
    const far = { x: 46.5, z: 54.5 };
    await page.evaluate(([f, fy]) => {
      const h = (window as any).__rikkun;
      h.player.set({ position: { x: f.x, y: fy + 1, z: f.z }, velocity: { x: 0, y: 0, z: 0 } });
    }, [far, FLOOR_Y] as const);
    await advance(page, 70, 1);
    await page.evaluate(() => (window as any).__rikkun.shadow.resetStats());
    await advance(page, 600, 5);
    const still = await torchStats(page);
    expect(still.count, '地図は使っている（空でない）').toBe(2);
    expect(still.redraws, '動く物がいない 600 tick の描き直し').toBe(0);

    // 数え方が生きていること: 近づくと描き直しが始まる
    await page.evaluate(([n, fy]) => {
      const h = (window as any).__rikkun;
      h.player.set({ position: { x: n.x, y: fy + 1, z: n.z }, velocity: { x: 0, y: 0, z: 0 } });
    }, [near, FLOOR_Y] as const);
    await advance(page, 10, 1);
    const moving = await torchStats(page);
    expect(moving.redraws, '近づくと描き直す').toBeGreaterThan(0);
    expect(moving.count).toBe(2);
  });

  test('AC11・§9: 妖怪が 10 体いても たいまつの 1 コマの描く回数は 50 以下、描き直しは 1 本まで', async ({ page }) => {
    await openShadow(page);
    await caveScene(page, [[46, 41], [50, 41]], { x: 48.5, z: 46.5 });
    await page.evaluate((fy) => {
      const h = (window as any).__rikkun;
      for (let i = 0; i < 10; i++) h.yokai.spawn('karakasa', 44 + (i % 5) * 2, fy + 1, 44 + Math.floor(i / 5) * 2.5, { ai: false });
    }, FLOOR_Y);
    await advance(page, 40, 1);
    const worst = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      let draws = 0;
      let redrawn = 0;
      let count = 0;
      for (let i = 0; i < 60; i++) {
        h.shadow.advance(1, 1);
        const t = h.shadow.stats().torch;
        draws = Math.max(draws, t.frameDraws);
        redrawn = Math.max(redrawn, t.frameRedrawn);
        count = t.count;
      }
      return { draws, redrawn, count };
    });
    expect(worst.count, 'たいまつの地図は 2 本').toBe(2);
    expect(worst.redrawn, '1 コマに 描き直す地図').toBeLessThanOrEqual(1);
    expect(worst.draws, '1 コマの たいまつの 描く回数').toBeLessThanOrEqual(50);
    expect(worst.draws, '描いている（0 でない）').toBeGreaterThan(0);
  });

  test('AC12: かげ オフでは たいまつの地図を作らず（count 0）、描き直しも 0', async ({ page }) => {
    await openShadow(page);
    await caveScene(page, [[44, 41], [48, 41]], { x: 46.5, z: 46.5 });
    expect((await torchStats(page)).count, 'オンなら地図がある').toBeGreaterThan(0);
    await page.evaluate(() => (window as any).__rikkun.shadow.set(false));
    await advance(page, 5, 1);
    await page.evaluate(() => (window as any).__rikkun.shadow.resetStats());
    await advance(page, 120, 2);
    const t = await torchStats(page);
    expect(t.count).toBe(0);
    expect(t.redraws).toBe(0);
    expect(t.frameRedrawn).toBe(0);
    expect(t.frameDraws).toBe(0);
  });

  test('AC12: ?shadow=0（影のしくみを作らない）でも たいまつの数・描き直しは 0', async ({ page }) => {
    await openShadow(page, '?nosave=1&shadow=0');
    await flatGrass(page, -4, -4, 74, 74);
    await page.evaluate((fy) => {
      const h = (window as any).__rikkun;
      h.world.setBlock(46, fy + 1, 41, 'torch');
      h.player.set({ position: { x: 46.5, y: fy + 1, z: 45.5 }, velocity: { x: 0, y: 0, z: 0 } });
      h.step(3);
    }, FLOOR_Y);
    await advance(page, 60, 1);
    const t = await torchStats(page);
    expect(t.count).toBe(0);
    expect(t.redraws).toBe(0);
  });
});
