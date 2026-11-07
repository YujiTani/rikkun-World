import { expect, test, type Page } from '@playwright/test';
import { standOnGround } from './helpers/aim';
import { PAD, invOf, padSteer, placeStation, stepN, tapE, tapPad } from './helpers/duoInv';
import { installFakePads } from './helpers/duoUi';

/**
 * COOP-1 4c（docs/design/COOP-1.md §3.3「4c の しくみ」・§8・§12.0、AC94・AC80・AC95）の E2E（1 本）。実装の 前に 書いた 赤の テスト。
 * 「わたす」の 通し: 2P が パッドだけで たんすを 開き 物を 入れる → 1P が 同じ たんすを 開いて もちものへ 出す。
 * 2 人が 同時に 同じ たんすを 開いている あいだに 中身が 両方に 出る こと、2 人の あいだも 1P が たんすを 開ける こと（4a の 仮の 決まりは なくなった）も ここで 見る。
 * ユニットで 見る 物（同じ ステップは 1P が 先・遠くなったら とじる・かまどの 中身〔AC93〕）は ここでは 見ない
 * （src/storage/tansuView.test.ts・src/duo/panelOrder.test.ts・src/craft/furnaceWorld.test.ts・src/duo/p2Dig.test.ts・src/duo/invRules.test.ts）。
 * 数・座標は 決め打ちせず、ゲーム（window.__rikkun）に 聞く。進めるのは step の 数で、時間（ms）では 合否を 決めない（#255）。
 * 十字の 動かし方は helpers/duoInv.ts の padSteer（今の えらびと 行き先の 画面の 位置から 向きを きめ、duo.inv(2).focus で 着いた ことを 見る）。
 *
 * ---- 開発への つなぎ目の 約束（目印・口。helpers/duoInv.ts の 先頭にも 書いた）----
 *   2P の 画面に たんすを 開く: たんすを ねらって Y（パッドの ボタン 2）→ `duo.inv(2)` = { open: true, page: 'tansu', focus: 'tansu:0' }・`duo-inv-p2` の `data-page="tansu"`。
 *   1P が 2 人の あいだに たんすを 開く: たんすを ねらって E → `duo.inv(1).page` = 'tansu'・`#inventory-screen` の `data-layout="duo"`・`data-page="tansu"`。
 *   たんすの マス: 2 人用の 画面の 中の `[data-tansu="<番号>"]`。中身が ある マスには `data-rarity`（今の StorageScreen の まま）。2P の えらびの 名前は `tansu:<番号>`・もちものは `slot:<番号>`（ホットバー 0 番は slot:0）。
 *   1P の シフトクリック（1 回で もちものへ）は 今の まま（`storage.shiftClick('tansu', i)`）。
 *   タブ `duo-inv-tab-tansu` は 開いている あいだ だけ 3 つ目に あり、`duo-inv-tab-furnace` は ない。
 *   2P の 手に もっている 物は えらんでいる マスの 右上に 出る（4a の とおり）。
 */

const count = (page: Page, who: 1 | 2, item: string) => page.evaluate(({ who, item }) => (window as any).__rikkun.duo.count(who, item) as number, { who, item });

test('AC94・AC80・AC95: 2P が パッドだけで たんすに 入れた 物を、1P が 同じ たんすを 開いて もちものへ 出す（わたす）。2 人 同時に 開いても 中身は 同じ', async ({ page }) => {
  await page.goto('/?nosave=1&duo=dev');
  await page.waitForFunction(() => (window as any).__rikkun?.ready === true);
  await page.evaluate(() => {
    const h = (window as any).__rikkun;
    h.pause();
    h.achievements.mute(true);
    h.lock.simulate(true);
    h.step(2);
  });
  await standOnGround(page, 100.5, 100.5, { yaw: 90 });
  await installFakePads(page, 2);
  expect(await page.evaluate(() => (window as any).__rikkun.duo.join())).toBe(true);
  await stepN(page, 30);

  // 2 人の 前に たんすを 1 つ（空）。2 人とも ねらっている。2P の ホットバー 0 番に わたしたい 物
  const cell = await placeStation(page, 'tansu');
  const item = 'log';
  const n = 5;
  await page.evaluate(({ item, n }) => (window as any).__rikkun.duo.give(2, item, n), { item, n });
  await stepN(page, 3);
  const tansuSlot0 = () => page.evaluate((c) => (window as any).__rikkun.storage.get(c.x, c.y, c.z).slots[0] as { item: string; count: number } | null, cell);
  expect(await tansuSlot0(), 'はじめは 空').toBeNull();
  expect(await count(page, 2, item)).toBe(n);
  expect(await count(page, 1, item)).toBe(0);

  // ---- 2P が たんすを ねらって Y（パッド）→「たんす」の ページ・えらびは tansu:0 ----
  expect(await invOf(page, 2)).toEqual({ open: false, page: null, focus: null });
  await tapPad(page, 1, PAD.inventory);
  const o2 = await invOf(page, 2);
  expect(o2.open).toBe(true);
  expect(o2.page).toBe('tansu');
  expect(o2.focus).toBe('tansu:0');
  const p2 = page.getByTestId('duo-inv-p2');
  await expect(p2).toBeVisible();
  await expect(p2).toHaveAttribute('data-page', 'tansu');
  await expect(p2.getByTestId('duo-inv-tab-tansu'), '3 つ目の タブ').toBeVisible();
  await expect(p2.getByTestId('duo-inv-tab-furnace')).toHaveCount(0);
  await expect(p2.getByTestId('duo-quit'), '2P の「やめる」は「もちもの」の ページだけ').toBeHidden();
  expect(await page.evaluate((c) => (window as any).__rikkun.world.getBlock(c.x, c.y, c.z), cell), 'ブロックは 置かない').toBe('tansu');
  expect(await page.evaluate(() => (window as any).__rikkun.duo.timeScale()), '世界は 止めない').toBe(1);

  // ---- 1P も 2 人の あいだに たんすを 開ける（E）。同じ たんす・同時に 開く ----
  await tapE(page);
  const o1 = await invOf(page, 1);
  expect(o1.open).toBe(true);
  expect(o1.page).toBe('tansu');
  const p1 = page.locator('#inventory-screen');
  await expect(p1).toBeVisible();
  await expect(p1).toHaveAttribute('data-layout', 'duo');
  await expect(p1).toHaveAttribute('data-page', 'tansu');
  const cell0 = (root: ReturnType<Page['locator']>) => root.locator('[data-tansu="0"]');
  await expect(cell0(p1), '1P の たんすの 0 番は まだ 空').not.toHaveAttribute('data-rarity');
  await expect(cell0(p2)).not.toHaveAttribute('data-rarity');

  // ---- 2P が 十字と confirm だけで ホットバー 0 番の 物を つかんで、たんすの 0 番に おく ----
  await padSteer(page, 'slot:0');
  await tapPad(page, 1, PAD.confirm); // つかむ
  await padSteer(page, 'tansu:0');
  await tapPad(page, 1, PAD.confirm); // おく
  expect(await tansuSlot0(), '2P が 入れた 物が たんすに ある').toMatchObject({ item, count: n });
  expect(await count(page, 2, item), '2P の もちものから なくなる').toBe(0);
  expect((await invOf(page, 2)).focus).toBe('tansu:0');
  // 同時に 開いている 1P の 画面にも 出る（同じ 中身）
  await expect(cell0(p1), '1P の 画面の 0 番に 2P が 入れた 物').toHaveAttribute('data-rarity', /.+/);
  await expect(cell0(p2)).toHaveAttribute('data-rarity', /.+/);

  // ---- 1P が シフトクリックで もちものへ 出す。2P の 画面の 0 番は 空に なる ----
  await cell0(p1).click({ modifiers: ['Shift'] });
  await stepN(page, 2);
  expect(await count(page, 1, item), '1P の もちものに 出た').toBe(n);
  expect(await tansuSlot0(), 'たんすは 空').toBeNull();
  await expect(cell0(p2), '2P の 画面の 0 番も 空').not.toHaveAttribute('data-rarity');
  await expect(cell0(p1)).not.toHaveAttribute('data-rarity');
  expect(await count(page, 2, item)).toBe(0);

  // ---- とじる。2P は B、1P は E。とじると 3 つ目の タブも 消える ----
  await tapPad(page, 1, PAD.close);
  expect((await invOf(page, 2)).open).toBe(false);
  await expect(p2).toBeHidden();
  expect((await invOf(page, 1)).open, '1P は そのまま').toBe(true);
  await tapE(page);
  expect((await invOf(page, 1)).open).toBe(false);
  await expect(p1).toBeHidden();

  // ---- とじて また 開くと ふだんの 決まり（もちもの）に もどる ----
  await page.evaluate(() => {
    const h = (window as any).__rikkun;
    const q = h.duo.pos(2);
    h.duo.aimAt(2, { x: Math.floor(q.x) - 3, y: Math.floor(q.y) + 1, z: Math.floor(q.z) }); // たんすから 目を はなす（うしろを 向く）
    h.step(2);
  });
  await tapPad(page, 1, PAD.inventory);
  const again = await invOf(page, 2);
  expect(again.open).toBe(true);
  expect(again.page, 'たんすを ねらって いなければ ふだんの 決まり').toBe('items');
  await expect(page.getByTestId('duo-inv-p2').getByTestId('duo-inv-tab-tansu'), 'たんすの タブは のこらない').toHaveCount(0);
});
