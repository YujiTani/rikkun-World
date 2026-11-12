import { expect, test, type Page } from '@playwright/test';
import { isPressed, openMenu, startState, tid } from './helpers/start';

/**
 * GFX-1（docs/tickets/GFX-1.md）: おもさ 4 だん・せっていの「がめん」。
 *   G3 おもさを 押すと すぐ microR・かげ・がめんが かわり、保存される
 *   G4 くわしくを 1 つずつ 変えられ、保存され、次の 起動で 使われる
 *   G5 かるいで 始めて かげを オンに すると その場で 影の しくみが 作られる
 *   G7 スタートメニューで 4 つ えらべる
 * （G1・G2・G6 は ユニット src/start/gfxPref.test.ts・weightPref.test.ts・gfxController.test.ts）
 * E2E のサーバーは VITE_SHADOW_DEFAULT=off・VITE_MICRO_DEFAULT=off・VITE_RING_DEFAULT=small なので、
 * 「はじめ」の かげ・microR・ring は 環境変数が 勝つ（おもさ・保存より 先）。おもさを 押した あとは 押した とおりに なる。
 * 画面の こまかさ（pixelRatio）は 画面の 倍率が 2 の ときに 見える（deviceScaleFactor: 2）。
 */
test.describe.configure({ timeout: 120_000 });
test.use({ deviceScaleFactor: 2 });

const KEY_WEIGHT = 'rikkun.weight.v1';
const KEY_GFX = 'rikkun.gfx.v1';
const KEY_SHADOW = 'rikkun.shadow.v1';

interface Gfx {
  weight: string;
  shadow: boolean;
  shadowAllowed: boolean;
  shadowBuilt: boolean;
  res: number;
  pixelRatio: number;
  microR: number;
  ring: string;
  ringNext: string;
  ringNote: boolean;
}
const gfx = (page: Page): Promise<Gfx> => page.evaluate(() => (window as any).__rikkun.gfx.state());
const ls = (page: Page, key: string) => page.evaluate((k) => localStorage.getItem(k), key);

/** 世界が できて、せっていの「がめん」タブを 開く */
async function openScreenTab(page: Page, search = ''): Promise<void> {
  await page.goto('/' + search);
  await page.waitForFunction(() => (window as any).__rikkun?.ready === true, null, { timeout: 60_000 });
  await page.getByTestId('settings-open').click();
  await page.getByTestId('tab-screen').click();
  await expect(page.getByTestId('panel-screen')).toBeVisible();
}

const pressed = async (page: Page, id: string) => (await page.getByTestId(id).getAttribute('aria-pressed')) === 'true';

test.describe('GFX-1 せっていの「がめん」', () => {
  test('G3: はじめは かるい（✦ 2）。おもさを 押すと すぐ microR・かげ・がめんが かわり、保存される', async ({ page }) => {
    await openScreenTab(page);
    // 保存が ないとき は かるい
    expect(await pressed(page, 'gfx-weight-light')).toBe(true);
    expect((await gfx(page)).weight).toBe('light');
    for (const w of ['xlight', 'normal', 'fine']) expect(await pressed(page, `gfx-weight-${w}`)).toBe(false);
    expect((await gfx(page)).pixelRatio).toBe(1.5);

    // 表: きれい = 28・かげ オン・がめん 2
    await page.getByTestId('gfx-weight-fine').click();
    let s = await gfx(page);
    expect(s).toMatchObject({ weight: 'fine', microR: 28, shadow: true, res: 2, pixelRatio: 2 });
    expect(await pressed(page, 'gfx-weight-fine')).toBe(true);
    expect(await pressed(page, 'gfx-weight-light')).toBe(false);
    expect(await ls(page, KEY_WEIGHT)).toBe('fine');

    // とても かるい = 0・かげ オフ・がめん 1
    await page.getByTestId('gfx-weight-xlight').click();
    s = await gfx(page);
    expect(s).toMatchObject({ weight: 'xlight', microR: 0, shadow: false, res: 1, pixelRatio: 1 });
    expect(await ls(page, KEY_WEIGHT)).toBe('xlight');

    // ふつう = 24・かげ オン・がめん 2
    await page.getByTestId('gfx-weight-normal').click();
    expect(await gfx(page)).toMatchObject({ weight: 'normal', microR: 24, shadow: true, res: 2, pixelRatio: 2 });

    // かるい = 12・かげ オフ・がめん 1.5
    await page.getByTestId('gfx-weight-light').click();
    expect(await gfx(page)).toMatchObject({ weight: 'light', microR: 12, shadow: false, res: 1.5, pixelRatio: 1.5 });
    expect(await ls(page, KEY_WEIGHT)).toBe('light');
  });

  test('G3: おもさを 押すと くわしくの 保存は 消える。輪は 今と ちがう ときだけ お知らせ', async ({ page }) => {
    await openScreenTab(page);
    await page.getByTestId('gfx-more').click();
    await page.getByTestId('gfx-res-1').click();
    await page.getByTestId('gfx-micro-8').click();
    expect(await ls(page, KEY_GFX)).not.toBeNull();
    await expect(page.getByTestId('gfx-ring-note')).toBeHidden();
    // E2E の ring は small。かるい 2 つは small なので お知らせなし
    await page.getByTestId('gfx-weight-xlight').click();
    expect(await ls(page, KEY_GFX)).toBeNull();
    expect(await ls(page, KEY_SHADOW)).toBeNull();
    await expect(page.getByTestId('gfx-ring-note')).toBeHidden();
    // full の おもさを 押すと 出る
    await page.getByTestId('gfx-weight-fine').click();
    await expect(page.getByTestId('gfx-ring-note')).toBeVisible();
    await expect(page.getByTestId('gfx-ring-note')).toContainText('つぎに あそぶ');
    expect(await gfx(page)).toMatchObject({ ring: 'small', ringNext: 'full', ringNote: true });
    // かるいに もどすと きえる
    await page.getByTestId('gfx-weight-light').click();
    await expect(page.getByTestId('gfx-ring-note')).toBeHidden();
  });

  test('G4: くわしく ― はじめは かくれて いて、「くわしく」で 出る・かくれる', async ({ page }) => {
    await openScreenTab(page);
    await expect(page.getByTestId('gfx-detail')).toBeHidden();
    await page.getByTestId('gfx-more').click();
    await expect(page.getByTestId('gfx-detail')).toBeVisible();
    await expect(page.getByTestId('gfx-detail')).toContainText('おうちの ひと むけ');
    for (const id of ['gfx-shadow-on', 'gfx-shadow-off', 'gfx-res-1', 'gfx-res-1_5', 'gfx-res-2', 'gfx-micro-0', 'gfx-micro-8', 'gfx-micro-12', 'gfx-micro-16', 'gfx-micro-24', 'gfx-micro-28']) {
      await expect(page.getByTestId(id), id).toBeVisible();
    }
    await page.getByTestId('gfx-more').click();
    await expect(page.getByTestId('gfx-detail')).toBeHidden();
  });

  test('G4: がめんの こまかさ・ちかくの こまかさ・かげを 1 つずつ 変えられ、保存される（おもさの 印は そのまま）', async ({ page }) => {
    await openScreenTab(page);
    await page.getByTestId('gfx-more').click();

    const before = await gfx(page); // microR は E2E の 環境変数（VITE_MICRO_DEFAULT=off → 0）が はじめの 値
    await page.getByTestId('gfx-res-1').click();
    expect(await gfx(page)).toMatchObject({ res: 1, pixelRatio: 1, weight: 'light', microR: before.microR });
    expect(await pressed(page, 'gfx-res-1')).toBe(true);
    expect(JSON.parse((await ls(page, KEY_GFX))!)).toEqual({ res: 1 });

    for (const r of [0, 8, 16, 24, 28]) {
      await page.getByTestId(`gfx-micro-${r}`).click();
      expect((await gfx(page)).microR, `micro ${r}`).toBe(r);
      expect(await pressed(page, `gfx-micro-${r}`)).toBe(true);
    }
    expect(JSON.parse((await ls(page, KEY_GFX))!)).toEqual({ res: 1, micro: 28 });

    await page.getByTestId('gfx-res-2').click();
    expect((await gfx(page)).pixelRatio).toBe(2);
    await page.getByTestId('gfx-res-1_5').click();
    expect((await gfx(page)).pixelRatio).toBe(1.5);

    await page.getByTestId('gfx-shadow-on').click();
    expect((await gfx(page)).shadow).toBe(true);
    expect(await ls(page, KEY_SHADOW)).toBe('on');
    await page.getByTestId('gfx-shadow-off').click();
    expect(await ls(page, KEY_SHADOW)).toBe('off');

    // おもさの 印は そのまま（かるい）。おもさの 保存は 書かない
    expect((await gfx(page)).weight).toBe('light');
    expect(await pressed(page, 'gfx-weight-light')).toBe(true);
    expect(await ls(page, KEY_WEIGHT)).toBeNull();
  });

  test('G4: 保存した がめんの こまかさ・おもさは 次の 起動で 使われる', async ({ page }) => {
    await openScreenTab(page);
    await page.getByTestId('gfx-more').click();
    await page.getByTestId('gfx-res-1').click();
    await page.reload();
    await page.waitForFunction(() => (window as any).__rikkun?.ready === true, null, { timeout: 60_000 });
    expect(await gfx(page)).toMatchObject({ weight: 'light', res: 1, pixelRatio: 1 });
    // おもさを 押して 保存 → 次の 起動で その おもさ
    await page.getByTestId('settings-open').click();
    await page.getByTestId('tab-screen').click();
    await page.getByTestId('gfx-weight-normal').click();
    await page.reload();
    await page.waitForFunction(() => (window as any).__rikkun?.ready === true, null, { timeout: 60_000 });
    expect(await gfx(page)).toMatchObject({ weight: 'normal', res: 2, pixelRatio: 2 });
  });

  test('G5: かるいで 始めて かげを オンに すると、その場で 影の しくみが 作られて 効く', async ({ page }) => {
    await openScreenTab(page);
    let s = await gfx(page);
    expect(s).toMatchObject({ weight: 'light', shadow: false, shadowAllowed: true, shadowBuilt: false });
    expect(await page.evaluate(() => (window as any).__rikkun.shadow.enabled())).toBe(false);
    await page.getByTestId('gfx-more').click();
    await page.getByTestId('gfx-shadow-on').click();
    s = await gfx(page);
    expect(s).toMatchObject({ shadow: true, shadowBuilt: true });
    expect(await page.evaluate(() => (window as any).__rikkun.shadow.enabled())).toBe(true);
    // 案内画面の「かげ」の 行も 同じ 状態
    await expect(page.getByTestId('shadow-on')).toHaveAttribute('aria-pressed', 'true');
    // オフに もどせる（作った しくみは のこり、オフに なる）
    await page.getByTestId('gfx-shadow-off').click();
    expect(await gfx(page)).toMatchObject({ shadow: false, shadowBuilt: true });
    expect(await page.evaluate(() => (window as any).__rikkun.shadow.enabled())).toBe(false);
  });

  test('G5: ?shadow=0 の ときは かげの 行を 出さない・作らない', async ({ page }) => {
    await openScreenTab(page, '?shadow=0');
    await page.getByTestId('gfx-more').click();
    await expect(page.getByTestId('gfx-shadow-on')).toBeHidden();
    await expect(page.getByTestId('shadow-setting')).toBeHidden();
    await page.getByTestId('gfx-weight-fine').click();
    expect(await gfx(page)).toMatchObject({ weight: 'fine', microR: 28, shadowBuilt: false, shadow: false });
  });

  test('せっていの ボタンは キーボードの Tab でも 選べる（data-menu-item・ボタン）', async ({ page }) => {
    await openScreenTab(page);
    await page.getByTestId('gfx-weight-xlight').focus();
    await page.keyboard.press('Enter');
    expect((await gfx(page)).weight).toBe('xlight');
    await expect(page.getByTestId('settings-help')).toContainText('かるい');
  });
});

test.describe('GFX-1 スタートメニュー', () => {
  test('G7: おもさが 4 つ。はじめは かるい。どれでも えらべて、保存される', async ({ page }) => {
    await openMenu(page, '?menu=1');
    const ids = ['xlight', 'light', 'normal', 'fine'];
    for (const w of ids) await expect(tid(page, `start-weight-${w}`)).toHaveCount(1);
    expect(await Promise.all(ids.map((w) => isPressed(page, `start-weight-${w}`)))).toEqual([false, true, false, false]);
    expect((await startState(page)).weight).toBe('light');
    for (const w of ids) {
      await tid(page, `start-weight-${w}`).click();
      expect((await startState(page)).weight).toBe(w);
      expect(await Promise.all(ids.map((x) => isPressed(page, `start-weight-${x}`)))).toEqual(ids.map((x) => x === w));
      expect(await ls(page, KEY_WEIGHT)).toBe(w);
    }
    // ✦ の 数 1〜4
    for (const [i, w] of ids.entries()) expect(await tid(page, `start-weight-${w}`).textContent()).toContain('✦'.repeat(i + 1));
    // 4 つ とも パネル（はば 648）の 中に 入る
    const panel = (await tid(page, 'start-menu').boundingBox())!;
    for (const w of ids) {
      const b = (await tid(page, `start-weight-${w}`).boundingBox())!;
      expect(b.x, w).toBeGreaterThanOrEqual(panel.x);
      expect(b.x + b.width, w).toBeLessThanOrEqual(panel.x + panel.width);
      expect(b.height, w).toBeGreaterThanOrEqual(64);
    }
  });

  test('G7: ?nosave=1 の メニューは きれい から（保存しない）', async ({ page }) => {
    await openMenu(page, '?menu=1&nosave=1');
    expect((await startState(page)).weight).toBe('fine');
    expect(await isPressed(page, 'start-weight-fine')).toBe(true);
    await tid(page, 'start-weight-xlight').click();
    expect(await ls(page, KEY_WEIGHT)).toBeNull();
  });
});
