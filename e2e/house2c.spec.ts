import { expect, test, type Page } from '@playwright/test';
import { firstVersionWant, gatedWant, styledForms } from '../src/house/recipes/craftKit';
import { kindBlocks, kindItem, STYLES } from '../src/house/recipes/kinds';
import { standOnGround } from './helpers/aim';
import { aimBlock, digAimed, emptyHand, standAt, tapRight, type Pt } from './helpers/houseBuilt';
import { openHouse } from './helpers/house';
import { learn, waitBandGone } from './helpers/houseRecipe';

/**
 * HOUSE-2C（#364 ほる・つくる・手で 置いた 案。docs/tickets/HOUSE-2A.md「2C の 進め方」・仕様 3.4 版 docs/design/HOUSE-2.md §2.5〜§2.7・§6.2 AC18）の E2E。1 本だけ（#311）。
 * 約束（窓口・data-testid）は src/house/recipes/craftKit.ts の「2C の 約束」: `craft.ui().detail.looks`・`craft.pickLook(item)`・`house.lookOf`・`house.placedLook`・`cp-looks`・`cp-look-<item>`。
 *
 * 通し（AC18。本物の クリック）:
 *   ① いえの かべ: もちもの画面の「つくる」→ いえの かべの カードを クリック（えらぶ）→「つくる」→ 持ち物 +（表から 計算した できる 数）→ 手に もって 地面に 置く →
 *      getBlock が いえの かべ → ほる → 持ち物に いえの かべ（き に ならない）。
 *   ② レシピ（かわらの やね）を おぼえて（テストの 近道 learn）→ かわらの やねの カード → 案の ボタン 3 つ（cp-looks）→ おしろの ボタンを クリック
 *      （えらぶ だけ・作らない・材料 そのまま）→「つくる」→ おしろの かわらの やね +（できる 数）→ 置く → house.lookOf が 'kawara_shiro'・placedLook が おしろ・向き s →
 *      ほる → 持ち物に おしろの かわらの やね（むらに ならない）・記録は 消える。
 * 材料の 数・id は 表から（firstVersionWant・gatedWant・kindBlocks・kindItem）。数・持ち物・ダメージ だけを 見る 細かい 基準は ユニット（src/craft/houseCraft.test.ts・
 * src/ui/craftHouseCards.test.ts・src/house/placedLooks.test.ts・src/dig/placedLooksDig.test.ts・src/dig/houseDig2C.test.ts）。画面の 数・大きさ（AC20）は e2e/ui-gate.spec.ts。
 * 時間では 待たず step の 数で 進める（#255）。赤の 確かめ（テストの 準備）: 実装の 前は いえの かべの カード・案の ボタン・house.lookOf が 無くて 落ちる。
 */

const count = (page: Page, item: string): Promise<number> => page.evaluate((i) => (window as any).__rikkun.inventory.count(i) as number, item);
const getBlock = (page: Page, p: Pt): Promise<string> => page.evaluate(([x, y, z]) => (window as any).__rikkun.world.getBlock(x, y, z) as string, [p.x, p.y, p.z] as const);
/** 持ち物の 中身（アイテム → 数） */
const bagOf = (page: Page): Promise<Record<string, number>> =>
  page.evaluate(() => {
    const out: Record<string, number> = {};
    for (const s of (window as any).__rikkun.inventory.get().slots as Array<{ item: string; count: number } | null>) if (s) out[s.item] = (out[s.item] ?? 0) + s.count;
    return out;
  });
const addItems = (page: Page, xs: Array<{ item: string; count: number }>): Promise<void> =>
  page.evaluate((xs) => {
    const h = (window as any).__rikkun;
    for (const x of xs) h.inventory.add(x.item, x.count);
    h.step(2);
  }, xs);
const toggleInventory = (page: Page): Promise<void> =>
  page.evaluate(() => {
    const h = (window as any).__rikkun;
    h.input.press('toggleInventory');
    h.input.release('toggleInventory');
    h.step(3);
  });
const craftUi = (page: Page): Promise<{ selected: string | null; looks: { items: string[]; selected: string } | null; recipe: string | null }> =>
  page.evaluate(() => {
    const h = (window as any).__rikkun;
    h.step(2);
    const u = h.craft.ui();
    return { selected: u.selected as string | null, looks: (u.detail?.looks ?? null) as { items: string[]; selected: string } | null, recipe: (h.craft.page()?.recipe ?? null) as string | null };
  });

/** 手に もつ（ホットバーの 外なら マス 8 に うつして えらぶ）。持って いなければ 落ちる */
async function hold(page: Page, item: string): Promise<void> {
  const ok = await page.evaluate((item) => {
    const h = (window as any).__rikkun;
    const slots = h.inventory.get().slots as ({ item: string } | null)[];
    const i = slots.findIndex((s) => s?.item === item);
    if (i < 0) return false;
    let at = i;
    if (i >= 9) {
      const keep = slots[8];
      h.inventory.setSlot(8, slots[i]);
      h.inventory.setSlot(i, keep);
      at = 8;
    }
    h.inventory.select(at);
    h.step(1);
    return true;
  }, item);
  expect(ok, `${item} を 持って いる`).toBe(true);
}

/** 「つくる」: カードを クリック（えらぶ）→（案の ボタン）→ つくる ボタン。できた 数を 返す */
async function craftByClick(page: Page, card: string, want: string, pickLook?: string): Promise<number> {
  const before = await count(page, want);
  await toggleInventory(page);
  const tile = page.locator(`#inventory-screen .cp-tile[data-id="${card}"]`);
  await tile.click(); // 1 回 目 ＝ えらぶ だけ
  expect((await craftUi(page)).selected, `カード ${card} を えらんだ`).toBe(card);
  expect(await count(page, want), '1 回 目の クリックでは 作らない').toBe(before);
  if (pickLook) {
    const ui = await craftUi(page);
    expect(ui.looks?.items.length, '案の ボタンの 数は 案の 数').toBe(STYLES.length);
    expect(ui.looks?.selected, 'はじめは むら').toBe(ui.looks?.items[0]);
    await expect(page.getByTestId('cp-looks'), '案の ボタンの 行').toBeVisible();
    const pre = await bagOf(page);
    await page.getByTestId(`cp-look-${pickLook}`).click();
    const after = await craftUi(page);
    expect(after.looks?.selected, '案の ボタンを 押すと その 案').toBe(pickLook);
    expect(after.recipe, 'page().recipe は えらんだ 案の 作り方').toBe(pickLook);
    expect(await count(page, pickLook), '案の ボタンでは 作らない').toBe(0);
    expect(await bagOf(page), '持ち物は そのまま（材料も へらない）').toEqual(pre);
    // 今 出て いない カードの 案は えらべない（ほかの 形の おしろ）
    const other = styledForms().find((f) => !f.items.includes(pickLook as never))!.items[1]!;
    expect(await page.evaluate((i) => (window as any).__rikkun.craft.pickLook(i) as boolean, other), '今 出て いない カードの 案').toBe(false);
  }
  await page.locator('#inventory-screen .cp-detail .cp-press').click();
  await page.evaluate(() => (window as any).__rikkun.step(10));
  const made = (await count(page, want)) - before;
  await toggleInventory(page);
  return made;
}

/** 置く マスの 北の 2 マスに ゆかを しき、プレイヤーは その 南に 立って ゆかの 上の 面を ねらう。置く マスと 立つ 場所を 返す */
async function prepareSpot(page: Page): Promise<{ stand: Pt; floor: Pt; cell: Pt }> {
  const sp = await page.evaluate(() => {
    const s = (window as any).__rikkun.world.spawn();
    return { x: s.x as number, z: s.z as number };
  });
  const { floorY } = await standOnGround(page, sp.x, sp.z, { yaw: 0 });
  const stand: Pt = { x: Math.floor(sp.x) + 0.5, y: floorY + 1, z: Math.floor(sp.z) + 0.5 };
  const floor: Pt = { x: Math.floor(sp.x), y: floorY, z: Math.floor(sp.z) - 2 };
  return { stand, floor, cell: { x: floor.x, y: floor.y + 1, z: floor.z } };
}

async function placeHeld(page: Page, stand: Pt, floor: Pt): Promise<void> {
  await standAt(page, stand, 0);
  const t = await aimBlock(page, floor, 1);
  expect(t?.block, 'ゆかを ねらえる').toEqual(floor);
  await tapRight(page);
}

async function digIt(page: Page, stand: Pt, cell: Pt): Promise<void> {
  await emptyHand(page);
  await standAt(page, stand, 0);
  const t = await aimBlock(page, cell, 0.5);
  expect(t?.block, '置いた ブロックを ねらえる').toEqual(cell);
  const d = await digAimed(page);
  expect(d.ready, 'ほれた').toBe(true);
}

test.describe('HOUSE-2C つくる → 置く → ほる 通し', () => {
  test('AC18: いえの かべ（つくる→置く→ほる）・おしろの かわらの やね（案の ボタン→つくる→置く→ほる）', async ({ page }) => {
    test.setTimeout(180_000);
    await openHouse(page);
    const { stand, floor, cell } = await prepareSpot(page);

    // ① いえの かべ（はじめから 作れる 1 版の 物）
    const wallWant = firstVersionWant('house_wall' as never);
    await addItems(page, wallWant.inputs.map((x) => ({ item: x.item as string, count: x.count })));
    const made = await craftByClick(page, 'house_wall', 'house_wall');
    expect(made, 'できた 数（表から）').toBe(wallWant.out);
    const logAfterCraft = await count(page, 'log');
    await hold(page, 'house_wall');
    await placeHeld(page, stand, floor);
    expect(await getBlock(page, cell), '置いた ブロック').toBe('house_wall');
    expect(await count(page, 'house_wall'), '1 つ へる').toBe(wallWant.out - 1);
    await digIt(page, stand, cell);
    expect(await getBlock(page, cell), 'ほった').toBe('air');
    expect(await count(page, 'house_wall'), 'ほると いえの かべ').toBe(wallWant.out);
    expect(await count(page, 'log'), 'き には ならない').toBe(logAfterCraft);

    // ② おしろの かわらの やね（レシピで ふえる 物。案の ボタン）
    const kawara = styledForms().find((f) => f.part === 'roof' && f.form === 'kawara')!;
    const [mura, shiro] = kawara.items;
    expect(await learn(page, 'roof_kawara'), 'かわらの やねの レシピを おぼえる（テスト用の 近道）').toBe(true);
    await waitBandGone(page);
    const roofWant = gatedWant('roof', 'kawara');
    await addItems(page, roofWant.inputs.map((x) => ({ item: x.item as string, count: x.count })));
    const made2 = await craftByClick(page, mura!, shiro!, shiro!);
    expect(made2, 'おしろの かわらの やねが できる（できる 数は 表から）').toBe(roofWant.out);
    expect(await count(page, mura!), 'むらは できない').toBe(0);
    await hold(page, shiro!);
    await placeHeld(page, stand, floor);
    expect(await getBlock(page, cell), '置いた ブロック（形の ブロック）').toBe(kindBlocks('roof', 'kawara_shiro')[0]);
    const look = await page.evaluate(([x, y, z]) => (window as any).__rikkun.house.lookOf(x, y, z) as string | null, [cell.x, cell.y, cell.z] as const);
    expect(look, 'house.lookOf').toBe('kawara_shiro');
    const placed = await page.evaluate(([x, y, z]) => (window as any).__rikkun.house.placedLook(x, y, z) as { style: string; facing: string } | null, [cell.x, cell.y, cell.z] as const);
    expect(placed, '置いた ときの 記録（プレイヤーは 南に 立って いる）').toEqual({ style: 'shiro', facing: 's' });
    await digIt(page, stand, cell);
    expect(await getBlock(page, cell), 'ほった').toBe('air');
    expect(await count(page, shiro!), 'ほると おしろの かわらの やね').toBe(roofWant.out);
    expect(await count(page, mura!), 'むらに ならない').toBe(0);
    expect(await count(page, kindItem('roof', 'kawara_kozan')!), 'こうざんでも ない').toBe(0);
    const gone = await page.evaluate(([x, y, z]) => (window as any).__rikkun.house.placedLook(x, y, z), [cell.x, cell.y, cell.z] as const);
    expect(gone, 'ほった あと 記録は 消える').toBeNull();
  });
});
