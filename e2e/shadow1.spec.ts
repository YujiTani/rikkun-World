import { test, expect, type Page } from '@playwright/test';
import { openShadow, flatGrass, settleLight, frames, shadowDir, type Shade } from './helpers/shadow';

/**
 * #144 SHADOW-1（段 1: 太陽と月の影）の受け入れテスト。docs/design/SHADOW.md §8（AC1〜AC9・AC12・AC15・AC16）。
 * 実装の前に書いた。窓口 `window.__rikkun.shadow` の決まりは e2e/helpers/shadow.ts の上の説明と SHADOW.md §8.1。
 * 決まり（rule #130）: 一時停止・tick を指定・ゲームに聞く。画素は同じコマで「オン」と「オフ」を並べて比べる。
 * 数: 影の中の明るさ 0.55（オーナーの決定）・夜の外の明るさ 0.25・はじまり tick 9000。
 */
const DAY = 14000; // 太陽 41°
const MOON = 67400; // 月 43°
const SHOT = 'docs/test-reports/assets/';

/** 石の柱（1×1×5）を (10, 9..13, 10) に立てる。根もとの中心は (10.5, 9, 10.5) */
async function pillarScene(page: Page, tick: number): Promise<void> {
  await flatGrass(page);
  await page.evaluate((t) => {
    const h = (window as any).__rikkun;
    h.world.fill(10, 9, 10, 10, 13, 10, 'stone');
    h.player.set({ position: { x: 4.5, y: 9, z: 4.5 }, velocity: { x: 0, y: 0, z: 0 }, yaw: 45, pitch: 25 });
    h.time.set(t);
    h.step(2);
  }, tick);
  await settleLight(page);
  await frames(page, 2);
}

/** 柱の根もとから 影の向きに d ブロック進んだ地面の点（d が負なら 光の側） */
async function groundPoint(page: Page, d: number): Promise<{ x: number; y: number; z: number }> {
  const s = await shadowDir(page);
  return { x: 10.5 + s.x * d, y: 9, z: 10.5 + s.z * d };
}
const vis = (page: Page, p: { x: number; y: number; z: number }) => page.evaluate((q) => (window as any).__rikkun.shadow.visAt(q.x, q.y, q.z) as number, p);
const shade = (page: Page, p: { x: number; y: number; z: number }, shadow: boolean) =>
  page.evaluate(([q, on]) => (window as any).__rikkun.shadow.shadeAt(q.x, q.y, q.z, { shadow: on }) as Shade, [p, shadow] as const);

test.describe('SHADOW-1 太陽と月の影', () => {
  test('AC1・AC4: 柱の影は太陽と反対へのび、CPU の光線と 14/16 点以上一致。1/9 の目の中は同じ', async ({ page }) => {
    await openShadow(page);
    await pillarScene(page, DAY);
    expect(await page.evaluate(() => (window as any).__rikkun.shadow.enabled())).toBe(true);

    // 根もとから 2 ブロック: 影の側 < 0.2、光の側 > 0.8
    expect(await vis(page, await groundPoint(page, 2))).toBeLessThan(0.2);
    expect(await vis(page, await groundPoint(page, -2))).toBeGreaterThan(0.8);

    // 1〜4 ブロックの 16 点（0.2 おき）で 地図の答え と CPU の光線を くらべる
    let agree = 0;
    const edges: number[] = [];
    for (let i = 0; i < 16; i++) {
      const p = await groundPoint(page, 1 + i * 0.2);
      const v = await vis(page, p);
      const blocked = await page.evaluate((q) => (window as any).__rikkun.shadow.rayBlocked(q.x, q.y, q.z) as boolean, p);
      if (v < 0.5 === blocked) agree++;
      edges.push(v);
    }
    expect(agree, `一致 ${agree}/16 ${edges.map((v) => v.toFixed(2))}`).toBeGreaterThanOrEqual(14);

    // 画面の見本（アートが色をかえても こわれない比べ方は AC6。ここは目で見る用）
    await page.screenshot({ path: SHOT + 'SHADOW-1-pillar-day.png' });

    // AC4: 影のへりのあたりの 小ブロックの目（1/9）の中の 2 点は同じ答え
    const s = await shadowDir(page);
    let edge = 1 + 0;
    for (let i = 0; i < 16; i++) if (edges[i] < 0.5) edge = 1 + i * 0.2;
    const e = { x: 10.5 + s.x * (edge + 0.1), z: 10.5 + s.z * (edge + 0.1) };
    const cell = (v: number) => Math.floor(v * 9) / 9;
    const cx = cell(e.x);
    const cz = cell(e.z);
    const a = await vis(page, { x: cx + 0.01 / 9, y: 9, z: cz + 0.01 / 9 });
    const b = await vis(page, { x: cx + 0.99 / 9, y: 9, z: cz + 0.99 / 9 });
    expect(Math.abs(a - b), `同じ目の中 ${a} ${b}`).toBeLessThan(0.02);
  });

  test('AC3・AC8: キャラの影（tick 9000）、昼（14000）のスタートのたいまつのそばでも消えない', async ({ page }) => {
    await openShadow(page);
    await flatGrass(page);
    for (const [tick, torch] of [[9000, false], [DAY, true]] as const) {
      await page.evaluate(([t, tc]) => {
        const h = (window as any).__rikkun;
        h.world.fill(15, 9, 15, 17, 9, 17, 'air');
        if (tc) h.world.setBlock(16, 9, 15, 'start_torch');
        h.player.set({ position: { x: 16.5, y: 9, z: 16.5 }, velocity: { x: 0, y: 0, z: 0 }, yaw: 90, pitch: 10 });
        h.time.set(t);
        h.step(3);
      }, [tick, torch] as const);
      await settleLight(page);
      await frames(page, 2);
      const s = await shadowDir(page);
      const v = await vis(page, { x: 16.5 + s.x, y: 9, z: 16.5 + s.z });
      expect(v, `tick ${tick} torch ${torch}`).toBeLessThan(0.3);
    }
  });

  test('AC6: 夜の影は昼よりうすい。昼の影の中も 0.35 以上（まっ黒にしない）、影のこさは 0.55 ほど', async ({ page }) => {
    await openShadow(page);
    const ratio = async (tick: number) => {
      await pillarScene(page, tick);
      const p = await groundPoint(page, 2);
      const on = await shade(page, p, true);
      const off = await shade(page, p, false);
      return { r: on.luma / off.luma, on, off };
    };
    const day = await ratio(DAY);
    const night = await ratio(MOON);
    expect(await page.evaluate(() => (window as any).__rikkun.time.get().brightness)).toBeCloseTo(0.25, 2); // 夜の外の明るさ
    expect(day.r, '昼の影の中').toBeGreaterThanOrEqual(0.35);
    expect(day.r, '昼の影のこさ（決定 0.55）').toBeGreaterThan(0.45);
    expect(day.r).toBeLessThan(0.65);
    expect(night.r, `夜の比 ${night.r} > 昼の比 ${day.r}`).toBeGreaterThan(day.r);
    await page.screenshot({ path: SHOT + 'SHADOW-1-pillar-night.png' });
  });

  test('AC7: 洞くつ（空の光 8 以下）の床とキャラの明るさは 影なしと ±2%', async ({ page }) => {
    await openShadow(page);
    await flatGrass(page, -4, -4, 60, 60);
    await page.evaluate(() => {
      const h = (window as any).__rikkun;
      h.world.fill(40, 8, 40, 52, 16, 52, 'stone');
      h.world.fill(41, 9, 41, 51, 15, 51, 'air');
      h.world.setBlock(46, 9, 41, 'torch');
      h.player.set({ position: { x: 46.5, y: 9, z: 46.5 }, velocity: { x: 0, y: 0, z: 0 }, yaw: 90, pitch: 10 });
      h.time.set(14000);
      h.step(3);
    });
    await settleLight(page);
    await frames(page, 2);
    const info = await page.evaluate(() => (window as any).__rikkun.world.lightAt(44, 9, 44));
    expect(info.sky, '洞くつの空の光').toBeLessThanOrEqual(8);
    const floor = { x: 44.5, y: 9, z: 44.5 };
    const on = await shade(page, floor, true);
    const off = await shade(page, floor, false);
    expect(Math.abs(on.luma - off.luma), `床 ${on.luma} ${off.luma}`).toBeLessThanOrEqual(0.02 * Math.max(off.luma, 0.05));
    const c = await page.evaluate(() => {
      const s = (window as any).__rikkun.shadow;
      return { on: s.shadeChar({ shadow: true }) as Shade, off: s.shadeChar({ shadow: false }) as Shade };
    });
    expect(Math.abs(c.on.luma - c.off.luma), `キャラ ${c.on.luma} ${c.off.luma}`).toBeLessThanOrEqual(0.02 * Math.max(c.off.luma, 0.05));
  });

  test('AC9: 立ち止まって 600 tick（昼）で、止まっている地図の描き直しは 近く 8・遠く 4 回以下、1 コマ 1 枚まで', async ({ page }) => {
    await openShadow(page);
    await pillarScene(page, DAY);
    const r = await page.evaluate(() => {
      const s = (window as any).__rikkun.shadow;
      s.resetStats();
      s.advance(600, 10);
      return s.stats();
    });
    expect(r.redraws.near).toBeLessThanOrEqual(8);
    expect(r.redraws.far).toBeLessThanOrEqual(4);
    expect(r.frame.maxStaticPerFrame).toBeLessThanOrEqual(1);
    expect(r.redraws.dynamic, '動く物の地図は毎コマ').toBeGreaterThan(0);
  });

  test('AC12: かげ オフは 影のしくみを作らない画面と画素が同じで、描く回数も同じ', async ({ browser }) => {
    const shot = async (query: string, off: boolean) => {
      const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
      await openShadow(page, query);
      await pillarScene(page, DAY);
      if (off) {
        await page.evaluate(() => (window as any).__rikkun.shadow.set(false));
        await page.evaluate(() => (window as any).__rikkun.step(1));
        await frames(page, 3);
      }
      const stats = await page.evaluate(() => (window as any).__rikkun.renderStats());
      const png = await page.screenshot();
      await page.context().close();
      return { stats, png };
    };
    const base = await shot('?nosave=1&shadow=0', false); // 影のしくみを作らない
    const off = await shot('?nosave=1&shadow=1', true); // 作ったあとに オフ
    expect(off.stats.drawCalls).toBe(base.stats.drawCalls);
    expect(off.stats.triangles).toBe(base.stats.triangles);
    expect(off.png.equals(base.png), '画素が同じ').toBe(true);
  });

  test('AC15: 丸い影と太陽の影が重なる所も、「かげ オフ」の 0.35 倍以上', async ({ page }) => {
    await openShadow(page);
    await pillarScene(page, DAY);
    const s = await shadowDir(page);
    // キャラを 柱の影の中に立たせる（足もとの丸い影と 柱の影が重なる）
    const p = { x: 10.5 + s.x * 1.5, y: 9, z: 10.5 + s.z * 1.5 };
    await page.evaluate((q) => {
      const h = (window as any).__rikkun;
      h.player.set({ position: { x: q.x, y: 9, z: q.z }, velocity: { x: 0, y: 0, z: 0 } });
      h.step(3);
    }, p);
    await frames(page, 2);
    const on = await shade(page, p, true);
    const off = await shade(page, p, false);
    expect(on.luma / off.luma).toBeGreaterThanOrEqual(0.35);
  });

  test('AC16: 設定の「かげ」オン／オフで切りかわる（はじめはオン）。F3 に影の数が出る', async ({ page }) => {
    await openShadow(page, '?nosave=1');
    await pillarScene(page, DAY);
    expect(await page.evaluate(() => (window as any).__rikkun.shadow.enabled()), 'はじめはオン').toBe(true);
    await page.evaluate(() => {
      const h = (window as any).__rikkun;
      document.exitPointerLock();
      h.lock.simulate(false);
      h.step(3);
    });
    const row = page.locator('[data-testid="shadow-setting"]');
    await expect(row).toBeVisible();
    await expect(row).toContainText('かげ');
    const onBtn = page.locator('[data-testid="shadow-on"]');
    const offBtn = page.locator('[data-testid="shadow-off"]');
    await expect(onBtn).toHaveText('オン');
    await expect(offBtn).toHaveText('オフ');
    for (const b of [onBtn, offBtn]) {
      const box = (await b.boundingBox())!;
      expect(box.width).toBeGreaterThanOrEqual(64);
      expect(box.height).toBeGreaterThanOrEqual(64);
    }
    await offBtn.click();
    await page.evaluate(() => (window as any).__rikkun.step(1)); // 次のコマ
    expect(await page.evaluate(() => (window as any).__rikkun.shadow.enabled())).toBe(false);
    await onBtn.click();
    await page.evaluate(() => (window as any).__rikkun.step(1));
    expect(await page.evaluate(() => (window as any).__rikkun.shadow.enabled())).toBe(true);
    await page.screenshot({ path: SHOT + 'SHADOW-1-settings.png' });

    // F3 に影の行（描き直し回数・三角形）
    await page.keyboard.press('F3');
    await frames(page, 4);
    const text = await page.locator('#perf-overlay').innerText();
    expect(text).toMatch(/shadow/i);
    expect(text).toMatch(/shadow[^\n]*tri/i);
  });
});
