import { expect, test, type Page } from '@playwright/test';
import { standOnGround } from './helpers/aim';
import { installFakePads, setFakePad } from './helpers/duoUi';
import { DUO_COLORS } from '../src/duo/tuning';
import type { DuoVec3 } from '../src/duo/types';

/**
 * COOP-1 作業 3a（#416。docs/design/COOP-1.md §2.5・§2.6・§9.5・§12.0・AC35・AC43）の E2E。実装の 前に 書いた 赤の テスト。
 * E2E は この 2 本だけ（仕様が「E2E 1 本」と 書いた 物）。ほかの AC35〜45c・AC15 は ユニット
 * （src/duo/p2Dig.test.ts・p2Life.test.ts・credit.test.ts・src/drops/DropField.duo.test.ts・src/yokai/ai/duo.test.ts・src/animals/duo.test.ts）。
 * 数・座標は 決め打ちせず、ゲーム（window.__rikkun.duo）に 聞く。進めるのは step の 数で、時間（ms）では 合否を 決めない（#255）。
 *
 * ---- 開発への つなぎ目の 約束（`window.__rikkun.duo` に 足す 口。仕様 §12.0 の 表に 足してほしい → designer へ）----
 *   どれも `?duo=dev` の ときだけ 効く（遊びに ない 動きを 作る 物）。ふつうの URL では 何もしない / 読む 口は 同じ。
 *   duo.aimAt(who: 1 | 2, cell: DuoVec3): void       … その 人を、マス cell の 中心を ねらう 向き（yaw・pitch）にする。1P の 向きも かわる。
 *   duo.target(who): { block: DuoVec3; place: DuoVec3; id: string } | null  … その 人の いまの ねらい（1P は 今の `target.get()` と 同じ マス）。
 *   duo.frame(who): { visible: boolean; color: string }  … ねらった ブロックの わく。2P は 2P の 色（DUO_COLORS.p2）、1P は DUO_COLORS.p1。ねらっていなければ visible=false。
 *   duo.give(who, item, count): void                 … その 人の 持ち物に 足す（2P の ホットバー 0 番に 入れて 選ぶ）。
 *   duo.count(who, item): number                     … その 人の 持ち物に ある item の 数。
 *   duo.hearts(who): { hp: number; maxHp: number; down: boolean }  … 2P の ハート（1P は `combat.get()` と 同じ 数）。down = 倒れているあいだ。
 *   duo.hurt(who, amount): void                      … 妖怪の こうげきとして ダメージ（2P は P2Life.damage(amount, {type:'yokai'})。1P は `combat.damage`）。
 *   画面: 2P が 倒れている あいだ だけ data-testid="duo-p2-down"（文字は「たおれちゃった」）が 見える。
 *   2P の 入力: 偽パッド 番号 1 の ZR（ボタン 7）= ほる・ZL（ボタン 6）= おく。
 */

const ZL = 6;
const ZR = 7;

async function open(page: Page, query = '?nosave=1&duo=dev'): Promise<void> {
  await page.goto('/' + query);
  await page.waitForFunction(() => (window as any).__rikkun?.ready === true);
  await page.evaluate(() => {
    const h = (window as any).__rikkun;
    h.pause();
    h.achievements.mute(true);
    h.lock.simulate(true); // 「クリックして あそぼう」を とじる
    h.step(2);
  });
}
const step = (page: Page, n: number) => page.evaluate((n) => (window as any).__rikkun.step(n), n);
const pos = (page: Page, who: 1 | 2) => page.evaluate((who) => (window as any).__rikkun.duo.pos(who) as DuoVec3 | null, who);
const block = (page: Page, c: DuoVec3) => page.evaluate((c) => (window as any).__rikkun.world.getBlock(c.x, c.y, c.z) as string, c);
const count = (page: Page, who: 1 | 2, item: string) => page.evaluate(({ who, item }) => (window as any).__rikkun.duo.count(who, item) as number, { who, item });
const hearts = (page: Page, who: 1 | 2) => page.evaluate((who) => (window as any).__rikkun.duo.hearts(who) as { hp: number; maxHp: number; down: boolean }, who);

async function startDuo(page: Page): Promise<void> {
  await open(page);
  await standOnGround(page, 100.5, 100.5, { yaw: 90 });
  await installFakePads(page, 2); // 番号 0 = 1P の 候補、番号 1 = 2P
  expect(await page.evaluate(() => (window as any).__rikkun.duo.join())).toBe(true);
  await step(page, 30);
}

test('AC35: 2P が ZR で ほって ZL で おく（2P の 色の わく・持ち物は 2P の 物だけ・1P は 動かない）', async ({ page }) => {
  await startDuo(page);
  const p1Before = (await pos(page, 1))!;
  const p2 = (await pos(page, 2))!;
  // 2P の 前（+x）2 マス先、目の 高さに ほれる ブロックを 1 つ 作る（まわりは 空気）
  const cell: DuoVec3 = { x: Math.floor(p2.x) + 2, y: Math.floor(p2.y) + 1, z: Math.floor(p2.z) };
  await page.evaluate((c) => {
    const w = (window as any).__rikkun.world;
    w.fill(c.x - 1, c.y - 1, c.z - 1, c.x + 1, c.y + 1, c.z + 1, 'air');
    w.fill(c.x, c.y, c.z, c.x, c.y, c.z, 'dirt');
  }, cell);
  await page.evaluate((c) => (window as any).__rikkun.duo.aimAt(2, { x: c.x, y: c.y, z: c.z }), cell);
  await step(page, 2);

  // ねらった ブロックが 2P の 色の わくで 光る
  const t = await page.evaluate(() => (window as any).__rikkun.duo.target(2));
  expect(t?.block).toEqual(cell);
  const frame = await page.evaluate(() => (window as any).__rikkun.duo.frame(2) as { visible: boolean; color: string });
  expect(frame.visible).toBe(true);
  expect(frame.color.toLowerCase()).toBe(DUO_COLORS.p2);
  const frame1 = await page.evaluate(() => (window as any).__rikkun.duo.frame(1) as { visible: boolean; color: string });
  expect(frame1.color.toLowerCase(), '1P の わくは 1P の 色').toBe(DUO_COLORS.p1);

  // ZR を 押しつづけて ほる（ひびが MAX の あと 押し直して こわす）
  const dirtBefore = await count(page, 2, 'dirt');
  let broken = false;
  for (let i = 0; i < 60 && !broken; i++) {
    await setFakePad(page, 1, { buttons: [ZR] });
    await step(page, 30);
    await setFakePad(page, 1, {});
    await step(page, 2);
    await setFakePad(page, 1, { buttons: [ZR] });
    await step(page, 2);
    await setFakePad(page, 1, {});
    broken = (await block(page, cell)) === 'air';
  }
  expect(broken, '2P が ブロックを こわした').toBe(true);
  expect(await count(page, 2, 'dirt'), 'ほった物は 2P の 持ち物').toBeGreaterThan(dirtBefore);
  expect(await count(page, 1, 'dirt'), '1P の 持ち物には 入らない').toBe(0);

  // ZL で 置く: 床の 上の 面を ねらって、持ち物の 数が 1 つ へる
  const floor: DuoVec3 = { x: cell.x, y: cell.y - 1, z: cell.z };
  await page.evaluate((c) => (window as any).__rikkun.world.fill(c.x, c.y, c.z, c.x, c.y, c.z, 'stone'), floor);
  await page.evaluate((c) => {
    const h = (window as any).__rikkun;
    h.duo.give(2, 'dirt', 5);
    h.duo.aimAt(2, { x: c.x, y: c.y, z: c.z });
  }, floor);
  await step(page, 2);
  const target = (await page.evaluate(() => (window as any).__rikkun.duo.target(2)))!;
  expect(target.block).toEqual(floor);
  const have = await count(page, 2, 'dirt');
  await setFakePad(page, 1, { buttons: [ZL] });
  await step(page, 3);
  await setFakePad(page, 1, {});
  await step(page, 2);
  expect(await block(page, target.place), 'ねらった 面の となりに 置かれた').toBe('dirt');
  expect(await count(page, 2, 'dirt'), '2P の 持ち物が 1 つ へった').toBe(have - 1);
  expect(await count(page, 1, 'dirt'), '1P の 持ち物は そのまま').toBe(0);

  // 2P の 操作で 1P は 動かない
  const p1After = (await pos(page, 1))!;
  expect(Math.hypot(p1After.x - p1Before.x, p1After.z - p1Before.z)).toBeLessThan(0.3);
});

test('AC43: 2P の ハートが 0 → 3 秒（180 ステップ）後に 1P の 横に 満タンで 戻る。1P は 倒れた 画面に ならない', async ({ page }) => {
  await startDuo(page);
  const before = await hearts(page, 2);
  expect(before.down).toBe(false);
  expect(before.hp).toBe(before.maxHp);
  const p1 = (await pos(page, 1))!;
  // 2P を 1P から はなして から 倒す（戻る とき 1P の 横に 来る ことを 見る）
  await page.evaluate((p) => (window as any).__rikkun.duo.place(2, { x: p.x + 12, y: p.y, z: p.z }), p1);
  await step(page, 5);
  await page.evaluate((n) => (window as any).__rikkun.duo.hurt(2, n), before.maxHp);
  await step(page, 1);
  let h2 = await hearts(page, 2);
  expect(h2.hp).toBe(0);
  expect(h2.down).toBe(true);
  await expect(page.getByTestId('duo-p2-down')).toBeVisible();
  // 1P は 倒れた 画面に ならない（遊びつづけられる）
  expect((await page.evaluate(() => (window as any).__rikkun.combat.get())).dead).toBe(false);

  await step(page, 170);
  h2 = await hearts(page, 2);
  expect(h2.down, '180 ステップ たつ 前は 倒れたまま').toBe(true);
  await step(page, 15);
  h2 = await hearts(page, 2);
  expect(h2.down).toBe(false);
  expect(h2.hp).toBe(h2.maxHp);
  await expect(page.getByTestId('duo-p2-down')).toHaveCount(0);
  expect((await page.evaluate(() => (window as any).__rikkun.combat.get())).dead, '1P は ずっと 倒れていない').toBe(false);
  const p1Now = (await pos(page, 1))!;
  const p2Now = (await pos(page, 2))!;
  expect(Math.hypot(p2Now.x - p1Now.x, p2Now.z - p1Now.z), '1P の 横に 戻った').toBeLessThan(4);
});
