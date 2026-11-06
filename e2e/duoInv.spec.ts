import { expect, test, type Page } from '@playwright/test';
import { standOnGround } from './helpers/aim';
import { PAD, invOf, padSteer, stepN, tapE, tapPad } from './helpers/duoInv';
import { installFakePads, setFakePad } from './helpers/duoUi';
import { ALL_RECIPES } from '../src/craft/recipes';
import type { DuoVec3 } from '../src/duo/types';

/**
 * COOP-1 4a（docs/design/COOP-1.md §3.3・§12.0）AC75＋AC76 の E2E（1 本）。実装の 前に 書いた 赤の テスト。
 * 2P の パッドだけで 開く → つくる の タブ → レシピ → つくる。そのあいだ 1P も 開いて 歩ける。世界は 止まらない。
 * 数・座標は 決め打ちせず、ゲーム（window.__rikkun）に 聞く。進めるのは step の 数で、時間（ms）では 合否を 決めない（#255）。
 * 十字の 動かし方は helpers/duoInv.ts の padSteer（今の えらびと 行き先の 画面の 位置から 向きを きめ、duo.inv(2).focus で 着いた ことを 見る）。
 * ユニットで 見る 物（AC77・AC78・AC79・AC88・AC89・AC76 の 材料の 順）は ここでは 見ない（src/duo/inv*.test.ts・p2Craft.test.ts）。
 */

const pos = (page: Page, who: 1 | 2) => page.evaluate((who) => (window as any).__rikkun.duo.pos(who) as DuoVec3 | null, who);
const dist = (a: DuoVec3, b: DuoVec3) => Math.hypot(a.x - b.x, a.z - b.z);
const count = (page: Page, who: 1 | 2, item: string) => page.evaluate(({ who, item }) => (window as any).__rikkun.duo.count(who, item) as number, { who, item });

test('AC75・AC76: 2P は パッドだけで 開いて つくる。そのあいだ 1P も 開いて 歩ける（世界は 止まらない）', async ({ page }) => {
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
  // 2P の 材料: き（木のつるはしの 材料）。1P の もちものにも 別の 物を 入れて、かわらない ことを 見る
  const def = ALL_RECIPES.find((r) => r.id === 'wood_pickaxe')!; // 材料は 登録表から（数を 決め打ちしない）
  const recipe = { inputs: def.inputs, output: def.output };
  expect(recipe.inputs).toHaveLength(1); // き だけで つくれる 1 しゅるいの 材料（duo.give は 0 番の マスに 1 しゅるい）
  const mat = recipe.inputs[0]!;
  await page.evaluate(({ mat }) => {
    const h = (window as any).__rikkun;
    h.duo.give(2, mat.item, mat.count);
    h.inventory.add('dirt', 5);
    h.step(3);
  }, { mat });
  const p1Before = await page.evaluate(() => JSON.stringify((window as any).__rikkun.inventory.get().slots));

  // ---- 2P が パッドだけで 開く ----
  expect(await invOf(page, 2)).toEqual({ open: false, page: null, focus: null });
  await tapPad(page, 1, PAD.inventory);
  const o2 = await invOf(page, 2);
  expect(o2.open).toBe(true);
  expect(o2.page).toBe('items');
  const p2 = page.getByTestId('duo-inv-p2');
  await expect(p2).toBeVisible();
  await expect(p2).toHaveAttribute('data-layout', 'duo');
  await expect(p2).toHaveAttribute('data-page', 'items');
  expect(await page.evaluate(() => (window as any).__rikkun.duo.timeScale()), '世界は 止めない・ゆっくりにも しない').toBe(1);
  // マウスは 1P の 物: 1P の マウスで 2P の「つくる」タブを 押しても 2P の ページは items の まま（AC77）
  await page.getByTestId('duo-inv-p2').getByTestId('duo-inv-tab-craft').click({ force: true });
  await stepN(page, 2);
  expect((await invOf(page, 2)).page, '1P の マウスでは 2P の ページは かわらない').toBe('items');
  await expect(page.getByTestId('duo-wait')).toBeHidden();
  expect((await invOf(page, 1)).open, '1P は まだ 開いていない').toBe(false);
  await expect(page.locator('#inventory-screen')).toBeHidden();

  // ---- 2P が 開いている あいだ 1P は 歩ける。2P は その場に 止まる（スティックを 倒しても 歩かない）----
  await setFakePad(page, 1, { axes: [0, -1, 0, 0] });
  const w1 = (await pos(page, 1))!;
  const w2 = (await pos(page, 2))!;
  await page.evaluate(() => {
    const h = (window as any).__rikkun;
    h.input.press('moveForward');
    h.step(40);
    h.input.release('moveForward');
    h.step(2);
  });
  await setFakePad(page, 1, {});
  expect(dist((await pos(page, 1))!, w1), '1P は 歩ける').toBeGreaterThan(0.5);
  expect(dist((await pos(page, 2))!, w2), '開いた 2P は その場').toBeLessThan(0.05);

  // ---- 1P も 開く（E）。左半分の 2 人用。2 人とも 開いても 世界は 止まらない ----
  await tapE(page);
  const o1 = await invOf(page, 1);
  expect(o1.open).toBe(true);
  expect(o1.page).toBe('items');
  const p1 = page.locator('#inventory-screen');
  await expect(p1).toBeVisible();
  await expect(p1).toHaveAttribute('data-layout', 'duo');
  await expect(page.getByTestId('duo-inv-p1')).toBeVisible();
  expect(await page.evaluate(() => (window as any).__rikkun.duo.timeScale())).toBe(1);
  await expect(page.getByTestId('duo-wait')).toBeHidden();
  // 2 人用の 半分: 1P は 左半分、2P は 右半分
  const half = await page.evaluate(() => innerWidth / 2);
  const b1 = (await p1.boundingBox())!;
  const b2 = (await p2.boundingBox())!;
  expect(b1.x + b1.width).toBeLessThanOrEqual(half);
  expect(b2.x).toBeGreaterThanOrEqual(half);

  // ---- 2P が 十字と confirm だけで「つくる」→ レシピ → つくる ----
  const focus1 = (await invOf(page, 1)).focus;
  await padSteer(page, 'tab:craft');
  await tapPad(page, 1, PAD.confirm);
  expect((await invOf(page, 2)).page).toBe('craft');
  await expect(p2).toHaveAttribute('data-page', 'craft');
  await padSteer(page, 'tile:wood_pickaxe');
  await expect(p2.locator('.cp-detail')).toHaveAttribute('data-id', 'wood_pickaxe'); // 2P の せつめいが その レシピに なる
  expect(await p2.locator('[data-pad-focus="true"]').count(), '2P の えらびの わくは ちょうど 1 つ').toBe(1);
  await padSteer(page, 'craft');
  expect(await count(page, 2, recipe.output.item)).toBe(0);
  await tapPad(page, 1, PAD.confirm);
  expect(await count(page, 2, recipe.output.item), 'できた 物が 2P の もちものに 入る').toBe(recipe.output.count);
  expect(await count(page, 2, mat.item), '材料が 2P の もちものから へる').toBe(0);
  // 1P の もちものは かわらない・1P の えらびも 2P の 十字で 動かない
  expect(await count(page, 1, recipe.output.item)).toBe(0);
  expect(await page.evaluate(() => JSON.stringify((window as any).__rikkun.inventory.get().slots))).toBe(p1Before);
  expect((await invOf(page, 1)).focus, '2P の 十字で 1P の フォーカスは 動かない').toBe(focus1);

  // ---- そのあいだ 1P の 画面は 開いたまま 歩く ことは できない（開いた 人は その場）。とじると 歩ける ----
  const q1 = (await pos(page, 1))!;
  await page.evaluate(() => {
    const h = (window as any).__rikkun;
    h.input.press('moveForward');
    h.step(20);
    h.input.release('moveForward');
  });
  expect(dist((await pos(page, 1))!, q1), '開いている 1P は その場').toBeLessThan(0.05);

  // 2P は B（closeMenu）で とじる。1P は そのまま 開いている
  await tapPad(page, 1, PAD.close);
  expect((await invOf(page, 2)).open).toBe(false);
  await expect(p2).toBeHidden();
  expect((await invOf(page, 1)).open).toBe(true);
  // 1P は E で とじて 歩ける
  await tapE(page);
  expect((await invOf(page, 1)).open).toBe(false);
  await expect(p1).toBeHidden();
  await stepN(page, 2);
  const r1 = (await pos(page, 1))!;
  await page.evaluate(() => {
    const h = (window as any).__rikkun;
    h.input.press('moveForward');
    h.step(30);
    h.input.release('moveForward');
  });
  expect(dist((await pos(page, 1))!, r1), 'とじた あと 1P は 歩ける').toBeGreaterThan(0.3);
});
