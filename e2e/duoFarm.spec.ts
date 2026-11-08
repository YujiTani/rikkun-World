import { expect, test, type Page } from '@playwright/test';
import { SEED_ITEM, VEG_ITEM } from '../src/contracts';
import { FARM_HINT_STEPS } from '../src/ui/farmHintModel';
import { PAD_ZL, PAD_ZR, countOf, farmAimOf, farmHintOf, placeCrop, startDuoFarm, stepN, tapPad } from './helpers/duoFarm';

/**
 * COOP-1 5a（docs/design/COOP-1.md 1.14 §3.7 (a)・§8 の 5a の 行・§12.0、AC115・AC126）の E2E（1 本）。実装の 前に 書いた 赤の テスト。
 * 「2P が みのった 作物を とる」の 通し: `?duo=dev` で 2P の 前に みのった 作物 → 2P の パッドの ZR → 作物が 消え、やさいと たねが 2P の もちものへ（1P は かわらない）。
 * 数は 出来事 `harvest` の 数（`veg`・`seeds`）に 聞く。種類・座標・個数は 決め打ちしない。進めるのは step の 数で、時間（ms）では 合否を 決めない（#255）。
 * ユニットで 見る 物（まだ・やせい・こわす・たがやす・たねまき・じょうろ・バケツ・なでる・食べる・実績・音）は ここでは 見ない
 * （src/duo/p2Farm.test.ts・src/fx/farmFx.by.test.ts・src/farm/farmTwo.test.ts）。
 * 1 人の ときは かわらない（AC130）は 今の E2E（m7・m2・smoke）が そのまま 通る ことで 見る（新しく 書かない）。
 *
 * ---- 開発への つなぎ目の 約束（helpers/duoFarm.ts の 先頭にも 書いた）----
 *   duo.farmAim(who)・duo.farmHint(who)・farm.events() の `by`・data-testid の duo-farm-aim-p2（2P の しるし）。
 */

const farmEvents = (page: Page) => page.evaluate(() => (window as any).__rikkun.farm.events() as Array<{ type: string; by?: number; kind?: string; veg?: number; seeds?: number }>);

test('AC115・AC126: 2P が みのった 作物を ZR で とる（やさい・たねは 2P の もちもの・1P は かわらない・出来事 harvest は by: 2）', async ({ page }) => {
  await startDuoFarm(page);
  const cell = await placeCrop(page, 2, { stage: 3 });

  // ---- とる 前: 2P の しるしが 出ていて、中身は 1P が 同じ マスを ねらった ときの farm.hud() と 同じ ----
  const aim = await farmAimOf(page, 2);
  expect(aim, '2P の しるし').not.toBeNull();
  expect(aim!.ripe, 'みのった 作物').toBe(true);
  await expect(page.getByTestId('duo-farm-aim-p2'), '2P の しるしが 見える').toBeVisible();
  expect(await farmHintOf(page, 2), '合図は ない').toBeNull();
  const mine = await page.evaluate((c) => {
    const h = (window as any).__rikkun;
    h.duo.aimAt(1, c); // 1P にも 同じ マスを ねらわせる
    h.step(2);
    return { target1: h.duo.target(1)?.block ?? null, hud: h.farm.hud(), aim1: h.duo.farmAim(1) };
  }, cell);
  expect(mine.target1, '1P も 同じ 作物を ねらえた').toEqual(cell);
  expect(aim, '2P の しるしの 中身は 1P が 同じ マスを ねらった farm.hud() と 同じ').toEqual(mine.hud);
  expect(mine.aim1, '1P の duo.farmAim(1) も farm.hud() と 同じ').toEqual(mine.hud);

  const crop = await page.evaluate((c) => (window as any).__rikkun.farm.crop(c.x, c.y, c.z) as { kind: string; ripe: boolean } | null, cell);
  expect(crop?.ripe).toBe(true);
  const kind = crop!.kind as keyof typeof VEG_ITEM;
  const items = [VEG_ITEM[kind], SEED_ITEM[kind]];
  const before2 = await Promise.all(items.map((i) => countOf(page, 2, i)));
  const before1 = await Promise.all(items.map((i) => countOf(page, 1, i)));
  const harvestsBefore = (await farmEvents(page)).filter((e) => e.type === 'harvest').length;

  // ---- 2P の パッドの ZR で とる ----
  await tapPad(page, PAD_ZR);
  await stepN(page, 3);

  // 作物は 消え、はたけは のこる（ほった ブロックとしては こわれない）
  const after = await page.evaluate((c) => {
    const h = (window as any).__rikkun;
    return { crop: h.farm.crop(c.x, c.y, c.z), above: h.world.getBlock(c.x, c.y, c.z), soil: h.farm.soil(c.x, c.y - 1, c.z) };
  }, cell);
  expect(after.crop, '作物が 消える').toBeNull();
  expect(after.above).toBe('air');
  expect(after.soil, 'はたけは のこる').not.toBeNull();

  // 出来事 harvest が 新しく 1 つ・2P の 物
  const harvests = (await farmEvents(page)).filter((e) => e.type === 'harvest');
  expect(harvests.length - harvestsBefore, '収穫の 出来事は 1 つ').toBe(1);
  const h = harvests[harvests.length - 1]!;
  expect(h.by, '2P が 起こした').toBe(2);
  expect(h.kind).toBe(kind);

  // やさいと たねは 2P の もちものへ（数は 出来事の 数）。1P は かわらない
  expect(await countOf(page, 2, items[0]!)).toBe(before2[0]! + h.veg!);
  expect(await countOf(page, 2, items[1]!)).toBe(before2[1]! + h.seeds!);
  expect(h.veg!, 'やさいが ふえた').toBeGreaterThan(0);
  expect(await countOf(page, 1, items[0]!)).toBe(before1[0]);
  expect(await countOf(page, 1, items[1]!)).toBe(before1[1]);

  // ---- ねらいを 外すと しるしが 消える ----
  await page.evaluate((c) => {
    const h = (window as any).__rikkun;
    h.duo.aimAt(2, { x: c.x - 4, y: c.y + 6, z: c.z });
    h.step(3);
  }, cell);
  expect(await farmAimOf(page, 2), 'ねらいを 外す').toBeNull();
  await expect(page.getByTestId('duo-farm-aim-p2')).toBeHidden();

  // ---- 2P の 合図は 2P の 半分だけに 出て、120 ステップ あとに 消える ----
  await page.evaluate((c) => {
    const h = (window as any).__rikkun;
    h.duo.give(2, 'watering_can', 1); // からっぽの じょうろ
    h.duo.aimAt(2, { x: c.x, y: c.y - 1, z: c.z }); // はたけの 上
    h.step(2);
  }, cell);
  await tapPad(page, PAD_ZL);
  expect(await farmHintOf(page, 2), '2P の 合図（からっぽの じょうろ）').toBe('fill');
  expect(await farmHintOf(page, 1), '1P の チップは 出ない').toBeNull();
  await expect(page.getByTestId('duo-farm-hint-p2')).toBeVisible();
  const hints = (await farmEvents(page)).filter((e) => e.type === 'hint');
  expect(hints[hints.length - 1]?.by, '合図の 出来事は 2P の 物').toBe(2);
  await stepN(page, FARM_HINT_STEPS - 20);
  expect(await farmHintOf(page, 2), '120 ステップ たつ 前は まだ 出ている').toBe('fill');
  await stepN(page, 40);
  expect(await farmHintOf(page, 2), '120 ステップ あとに 消える').toBeNull();
  await expect(page.getByTestId('duo-farm-hint-p2')).toBeHidden();
});
