import { expect, test } from '@playwright/test';
import { MSG } from '../src/house/build/tuning';
import { PAD, ownerOf, openDuoArchitect, p2AimAtArchitect, p2TalkUntilMenu, padFocus, tapPad, timeScaleOf } from './helpers/duoModal';
import { setFakePad } from './helpers/duoUi';

/**
 * COOP-1 5d（docs/design/COOP-1.md 1.15 §3.7 (e)・§11.2-15 ①・§12.0、AC141・AC140・AC161・AC162・AC165）の E2E（1 本）。実装の 前に 書いた 赤の テスト。
 * オーナー 2026-11-10: 建築士さんは 今の 仕様どおり（全面・世界を 止める・もう 1 人の 半分に「ちょっと まってね」）で 確定。
 * 2P が 建築士さんに 話しかける → メニュー → 1P の 半分に「ちょっと まってね」→ 2P の パッドで ボタンを えらんで 押し、B で とじる。
 * ユニットで 見る 物（開いた 人の 取り合い・入力の ふりわけ・材料・外へ 出す 2 人・錠）は ここでは 見ない
 * （src/game/wire/modalOwner.test.ts・modalLock.test.ts・seatBook.test.ts・src/house/system.2p.test.ts）。
 * 数・座標は 決め打ちせず、ゲーム（window.__rikkun）に 聞く。進めるのは step の 数で、時間（ms）では 合否を 決めない（#255）。
 * 約束（口・目印）は helpers/duoModal.ts の 先頭。
 */

test('AC141・AC140・AC161・AC162・AC165: 2P が 建築士さんに 話す → 全面の メニュー・世界が 止まる・1P の 半分に「ちょっと まってね」→ 2P の 十字と A で 押し、B で とじる', async ({ page }) => {
  const a = await openDuoArchitect(page);
  expect(await ownerOf(page), 'はじめは だれも 開いて いない').toBeNull();
  await p2AimAtArchitect(page, a.id);

  // ---- 2P の ZL で 話しかける → あいさつの あと メニューが 開く ----
  await p2TalkUntilMenu(page);
  const menu = await page.evaluate(() => (window as any).__rikkun.house.menu());
  expect(menu.open).toBe(true);
  expect(menu.page).toBe('top');
  expect(await ownerOf(page), '開いた 人は 2P').toBe(2);
  expect(await timeScaleOf(page), '世界は 止まる').toBe(0);
  await expect(page.getByTestId('duo-wait-p1'), '1P の 半分に「ちょっと まってね」').toBeVisible();
  await expect(page.getByTestId('duo-wait-p1')).toHaveText('ちょっと まってね');
  await expect(page.getByTestId('duo-wait'), '2P の 半分の は 出ない').toBeHidden();
  const buttons = page.locator('[data-testid^="house-btn-"]').filter({ visible: true });
  expect(await buttons.count(), 'メニューの ボタンが 見える').toBeGreaterThan(0);

  // ---- 1P の キー・パッドは きかない（メニューは 開いた まま・持ち主も かわらない）----
  await page.evaluate(() => {
    const h = (window as any).__rikkun;
    h.input.press('closeMenu');
    h.input.release('closeMenu');
    h.step(3);
  });
  await tapPad(page, 0, PAD.b);
  expect((await page.evaluate(() => (window as any).__rikkun.house.menu())).open, '1P の Esc・B では とじない').toBe(true);
  expect(await ownerOf(page)).toBe(2);

  // ---- 2P の 十字で「けんちくを はじめる」を えらび A で 押す（せっけいずが ないので ふきだしが かわる）----
  await padFocus(page, 'house-btn-build');
  await tapPad(page, 1, PAD.a);
  const after = await page.evaluate(() => (window as any).__rikkun.house.menu());
  expect(after.open).toBe(true);
  expect(after.bubble, '2P の A で ボタンが 押された').toBe(MSG.noPlan);
  expect(await ownerOf(page)).toBe(2);

  // ---- 2P の B で とじる → 持ち主 null・「ちょっと まってね」は 消える・世界が 動く ----
  await tapPad(page, 1, PAD.b);
  await page.evaluate(() => (window as any).__rikkun.step(2));
  expect((await page.evaluate(() => (window as any).__rikkun.house.menu())).open).toBe(false);
  expect(await ownerOf(page)).toBeNull();
  await expect(page.getByTestId('duo-wait-p1')).toBeHidden();
  expect(await timeScaleOf(page)).toBe(1);
  // 2P の 遊びへ もどった ことを 見る: 2P の パッドの スティックで 歩ける ように なる（1P の 錠は 待ちでも 2P は 遊べる）
  const before = await page.evaluate(() => (window as any).__rikkun.duo.pos(2));
  await setFakePad(page, 1, { axes: [0, -1, 0, 0] });
  await page.evaluate(() => (window as any).__rikkun.step(30));
  const moved = await page.evaluate(() => (window as any).__rikkun.duo.pos(2));
  expect(Math.hypot(moved.x - before.x, moved.z - before.z), '2P が 歩ける').toBeGreaterThan(0.1);
});
