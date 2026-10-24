import { expect, test, type Page } from '@playwright/test';
import { findUnrubiedKanji } from '../src/ui/text';
import { fine } from './helpers/fine';
import { openBladeWorld, runTech, settle, stage, takeKatana, toStance } from './helpers/blade';
import { FUJIN, chargeRun, legendWorld, types } from './helpers/legend';

// 細かいメッシュ（?microR=28）の 起動は ひとりなら 8〜12 秒。CI で 重い spec と 同じ シャードに なると CPU の 取りあいで 60 秒を こえる（#284）。
// 待つのは ゲームの ready（時間では 待たない）。上限だけ 120 秒に する（ブラウザの 用意も ふくむので ファイルごと）
test.describe.configure({ timeout: 120_000 });

async function open(page: Page) {
  await page.goto('/');
  await page.waitForFunction(() => window.__rikkun?.ready === true);
}

/**
 * E2E のサーバーは ?microR なしだと 小ブロックの細かいメッシュを作らない（#180）。
 * 「本物のゲーム（ふつうに遊ぶときと同じメッシュ）が エラーなく起動して 描ける」ことは、ここで ?microR=28 を付けて確かめる。
 */
test('ゲーム画面が出て、エラーが出ない', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto('/' + fine()); // (b) 細かいメッシュまで作って起動できる。エラーの記録は 読みこみの前から
  await page.waitForFunction(() => window.__rikkun?.ready === true);
  // 起動直後は案内画面で時間が止まる（M1-02 §2.4）。ロックされた状態にしてから進むのを待つ
  await page.evaluate(() => window.__rikkun!.lock.simulate(true));

  await expect(page.locator('#game canvas')).toBeVisible();
  // ゲームが進んでいる
  const t0 = await page.evaluate(() => window.__rikkun!.tick());
  await page.waitForFunction((t) => window.__rikkun!.tick() > t + 10, t0);
  expect(errors).toEqual([]);
});

test('仮の景色が描画されている', async ({ page }, testInfo) => {
  await page.goto('/' + fine()); // (d) 景色のスクショを添付する
  await page.waitForFunction(() => window.__rikkun?.ready === true);
  await page.evaluate(() => {
    window.__rikkun!.pause();
    window.__rikkun!.step(1);
  });
  const stats = await page.evaluate(() => window.__rikkun!.renderStats());
  expect(stats.drawCalls).toBeGreaterThan(0);
  expect(stats.triangles).toBeGreaterThan(0);
  await testInfo.attach('screenshot', { body: await page.screenshot(), contentType: 'image/png' });
});

test('step() で決まった回数だけ進む（テスト用の時間操作）', async ({ page }) => {
  await open(page);
  const [before, after] = await page.evaluate(() => {
    const h = window.__rikkun!;
    h.pause();
    const b = h.tick();
    h.step(30);
    return [b, h.tick()];
  });
  expect(after - before).toBe(30);
});

test('F3 で性能表示が出たり消えたりする', async ({ page }) => {
  await open(page);
  await expect(page.locator('#perf-overlay')).toBeHidden();
  await page.keyboard.press('F3');
  await expect(page.locator('#perf-overlay')).toBeVisible();
  await expect(page.locator('#perf-overlay')).toContainText('FPS');
  await page.keyboard.press('F3');
  await expect(page.locator('#perf-overlay')).toBeHidden();
});

test('画面の文字にふりがなのない漢字がない', async ({ page }) => {
  await open(page);
  const html = await page.locator('#hud').innerHTML();
  // 性能表示は開発者向けなので対象外
  const withoutDebug = html.replace(/<div id="perf-overlay"[\s\S]*?<\/div>/, '');
  expect(findUnrubiedKanji(withoutDebug)).toEqual([]);
});

/** WEAPON-4 AC24: 刀を 持って 3 つのわざを 1 回ずつ 出しても エラーが 出ない（突き・大けさぎり・切り上げ） */
test('刀の 3 つのわざを 1 回ずつ 出して、エラーが出ない', async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await openBladeWorld(page);
  await takeKatana(page, 'chudan');
  const { floorY } = await stage(page);
  const techs: string[] = [];
  for (const st of ['chudan', 'jodan', 'gedan'] as const) {
    await toStance(page, st);
    const rec = await runTech(page, 110);
    techs.push(...rec.flatMap((r) => r.events.filter((e) => e.type === 'techStart').map((e) => e.tech!)));
    await settle(page, 10);
    await stage(page, { floorY });
  }
  expect(techs).toEqual(['thrust', 'kesa', 'kiriage']);
  expect(errors).toEqual([]);
});

/** WEAPON-8 AC15: 風神剣で ためわざ「らせんの かぜ」を 1 回 出しても エラーが 出ない（仕様書 docs/design/WEAPON-8.md） */
test('風神剣で らせんの かぜを 1 回 出して、エラーが出ない', async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await legendWorld(page, FUJIN);
  const rec = await chargeRun(page, 60, 110);
  expect(types(rec), 'らせんが 出た').toContain('spiralStart');
  expect(types(rec)).toContain('spiralEnd');
  expect(errors).toEqual([]);
});

/**
 * START-1 AC15: E2E の サーバー（VITE_START_MENU=off）では、`/`・`/?nosave=1`・`/?seed=3`・`/?char=boy` を 開いても
 * スタートメニューが 出ず、今と 同じに 遊べる（窓口 start は あるが shown = false、info().from = 'url'）。
 */
test('E2E のサーバーでは スタートメニューが 出ない（/・?nosave=1・?seed=3・?char=boy）', async ({ page }) => {
  test.setTimeout(240_000);
  for (const q of ['', '?nosave=1', '?seed=3', '?char=boy']) {
    await page.goto('/' + q);
    await page.waitForFunction(() => window.__rikkun?.ready === true);
    const st = await page.evaluate(() => (window.__rikkun as any).start.state());
    expect(st.shown, `/${q}: メニューが 出ていない`).toBe(false);
    expect(await page.evaluate(() => (window.__rikkun as any).start.info().from), `/${q}`).toBe('url');
    await expect(page.getByTestId('start-menu')).toHaveCount(0);
    await expect(page.locator('#game canvas')).toBeVisible();
    // 今の 案内画面（クリックして あそぼう）が 出る
    await expect(page.locator('.play-overlay')).toBeVisible();
  }
});
