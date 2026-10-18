import { expect, test, type Page } from '@playwright/test';
import { findUnrubiedKanji } from '../src/ui/text';
import { fine } from './helpers/fine';

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
  await expect(page.locator('#title')).toContainText('りっくんワールド');
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
