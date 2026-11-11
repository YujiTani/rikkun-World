import { expect, test, type Page } from '@playwright/test';
import { installFakePads, openDuoHud, setFakePad } from './helpers/duoUi';
import { PAD, padSteer, stepN, tapPad, invOf } from './helpers/duoInv';

/**
 * もちもの画面とコントローラーの案内（/mnt/project-files/inv-pad-help/PLAN.md の要望 1〜4）。
 * 1: パッドのとき ヘルプ帯が ボタン印（.pad-badge）・マウスで もとに もどる
 * 2: 十字で えらんだ マスに 名前札（#tooltip）・つかんだ 物の 下に 名前札（.inv-cursor-name）
 * 3: もちもの中 X = 1 こ すてる・R3 = ぜんぶ すてる・Y = とじる
 * 4: 1 人でも パッドなら アクションヒントが パッド絵（.action-hint[data-pad=pad]）
 * 5: 2 人の とき 2P の もちもので X・R3 で すてられる（未実装 = 赤）
 *   2P の つなぎ目: `duo.inv(2).focus`（えらび）・`duo.count(2, item)`（個数）・偽パッドの X = 3・R3 = 11 を `tapPad(page, 1, …)` で 押す
 */
const X = 3;
const R3 = 11;
const Y = 2;

async function open1P(page: Page): Promise<void> {
  await page.goto('/?nosave=1');
  await page.waitForFunction(() => window.__rikkun?.ready === true);
  await page.evaluate(() => {
    const h = window.__rikkun! as any;
    h.pause();
    h.lock.simulate(true);
    h.step(2);
    h.inventory.clear();
    h.inventory.add('dirt', 10);
    h.inventory.add('stone', 5);
  });
  await installFakePads(page, 1);
}

/** つちの はいっている マスの 番号（ゲームに 聞く。決め打ちしない） */
const dirtSlot = (page: Page) => page.evaluate(() => (window.__rikkun as any).inventory.get().slots.findIndex((s: any) => s?.item === 'dirt') as number);

const openInv = (page: Page) =>
  page.evaluate(() => {
    const h = window.__rikkun! as any;
    h.input.press('toggleInventory');
    h.input.release('toggleInventory');
    h.step(3);
  });

/** 偽パッド 0 の ボタンを 1 回 おして はなす */
const tap = (page: Page, b: number) => tapPad(page, 0, b);

/** 十字だけで、もちものの マス slot に フォーカスを 動かす。向きは 今の フォーカスと 行き先の 画面の 位置から きめる。動かなければ もう 1 つの 軸 */
async function dpadToSlot(page: Page, slot: number): Promise<void> {
  const where = () =>
    page.evaluate((slot) => {
      const t = document.querySelector(`.inv-slot[data-index="${slot}"]`)!.getBoundingClientRect();
      const a = document.activeElement as HTMLElement | null;
      if (a?.dataset?.index === String(slot)) return null;
      const r = a?.getBoundingClientRect();
      return r ? { dx: t.left - r.left, dy: t.top - r.top } : { dx: 1, dy: 1 };
    }, slot);
  let lastKey = '';
  let flip = false;
  for (let i = 0; i < 60; i++) {
    const w = await where();
    if (w === null) return;
    const key = `${Math.round(w.dx)},${Math.round(w.dy)}`;
    flip = key === lastKey ? !flip : false; // 動かなかったら もう 1 つの 軸を ためす
    lastKey = key;
    const horizontal = Math.abs(w.dx) > 4 && (Math.abs(w.dy) <= 4 || Math.abs(w.dx) >= Math.abs(w.dy)) !== flip;
    await tap(page, horizontal ? (w.dx > 0 ? 15 : 14) : w.dy > 0 ? 13 : 12);
  }
  throw new Error(`十字で slot ${slot} に とどかない`);
}

test('1: パッドのとき ヘルプ帯が ボタン印に かわり、マウスに もどると もとに もどる', async ({ page }) => {
  await open1P(page);
  await openInv(page);
  const hints = page.locator('.inv-hints');
  await expect(hints).toContainText('1こ すてる');
  await expect(hints.locator('.pad-badge')).toHaveCount(0);
  await expect(hints).toContainText('ひっぱる'); // キーボード版

  await page.evaluate(() => (window.__rikkun as any).gamepad.setLastInput('gamepad'));
  await stepN(page, 2);
  await expect(hints.locator('.pad-badge').first()).toBeVisible();
  await expect(hints).toContainText('えらぶ');
  await expect(hints).toContainText('つかむ');
  await expect(hints).toContainText('1こ すてる');
  await expect(hints).toContainText('ぜんぶ すてる');
  await expect(hints).toContainText('とじる');
  await expect(hints).not.toContainText('ひっぱる');

  await page.evaluate(() => (window.__rikkun as any).gamepad.setLastInput('mouse'));
  await stepN(page, 2);
  await expect(hints.locator('.pad-badge')).toHaveCount(0);
  await expect(hints).toContainText('ひっぱる');
});

test('1: 2 人用の つくる ページにも パッドの 帯が 出る', async ({ page }) => {
  await openDuoHud(page);
  await installFakePads(page, 2);
  await tapPad(page, 1, PAD.inventory);
  await stepN(page, 4);
  await padSteer(page, 'tab:craft');
  await tapPad(page, 1, PAD.confirm);
  await stepN(page, 4);
  expect((await invOf(page, 2)).page).toBe('craft');
  const hints = page.getByTestId('duo-inv-p2').locator('.inv-hints');
  await expect(hints).toBeVisible();
  await expect(hints.locator('.pad-badge').first()).toBeVisible();
  await expect(hints).toContainText('つくる');
  await expect(hints).toContainText('とじる');
});

test('2: 十字で えらんだ マスに 名前札、つかんだ 物の 下に 名前札', async ({ page }) => {
  await open1P(page);
  await openInv(page);
  await page.evaluate(() => (window.__rikkun as any).gamepad.setLastInput('gamepad'));
  await stepN(page, 2);
  const slotNo = await dirtSlot(page);
  expect(slotNo).toBeGreaterThanOrEqual(0);
  await dpadToSlot(page, slotNo);
  await stepN(page, 2);
  const tip = page.locator('#tooltip');
  await expect(tip).toBeVisible();
  const rects = await page.evaluate(() => {
    const a = document.activeElement as HTMLElement;
    const r = a.getBoundingClientRect();
    const t = document.querySelector('#tooltip')!.getBoundingClientRect();
    return { slot: { l: r.left, t: r.top, r: r.right, b: r.bottom }, tip: { l: t.left, t: t.top } };
  });
  // 名札は えらんだ マスの 右下の あたり（右か 下に ある）
  expect(rects.tip.l >= rects.slot.r - 40 || rects.tip.t >= rects.slot.b - 40).toBe(true);

  // つかむ（B = 決定 0）→ つかんだ 絵の 下に 名前札
  await tap(page, PAD.confirm);
  await stepN(page, 2);
  const held = await page.evaluate(() => (window.__rikkun as any).inventory.get().cursor);
  expect(held).not.toBeNull();
  const name = page.locator('.inv-cursor-name');
  await expect(name).toBeVisible();
  const itemName = await page.evaluate(() => document.querySelector('.inv-cursor-name')!.textContent ?? '');
  expect(itemName.trim().length).toBeGreaterThan(0);
  const pos = await page.evaluate(() => {
    const n = document.querySelector('.inv-cursor-name')!.getBoundingClientRect();
    const i = document.querySelector('.inv-cursor img')!.getBoundingClientRect();
    return { nameTop: n.top, iconBottom: i.bottom };
  });
  expect(pos.nameTop).toBeGreaterThanOrEqual(pos.iconBottom - 2);
});

test('2: マウスで つかんでも 名前札が 出る', async ({ page }) => {
  await open1P(page);
  await openInv(page);
  const no = await dirtSlot(page);
  await page.evaluate((i) => (window.__rikkun as any).inventory.click(i), no);
  await stepN(page, 2);
  await page.mouse.move(300, 300);
  await expect(page.locator('.inv-cursor-name')).toBeVisible();
});

test('3: もちもの中 X で 1 こ・R3 で ぜんぶ すてる・Y で とじる', async ({ page }) => {
  await open1P(page);
  await openInv(page);
  await page.evaluate(() => (window.__rikkun as any).gamepad.setLastInput('gamepad'));
  await stepN(page, 2);
  const no = await dirtSlot(page);
  await dpadToSlot(page, no);
  const count = () => page.evaluate((i) => (window.__rikkun as any).inventory.get().slots[i]?.count ?? 0, no);
  const before = await count();
  expect(before).toBeGreaterThan(2);

  await tap(page, X);
  expect(await count()).toBe(before - 1);

  await tap(page, R3);
  expect(await count()).toBe(0);

  await tap(page, Y);
  expect(await page.evaluate(() => (window.__rikkun as any).inventory.get().open)).toBe(false);
});

test('4: 1 人でも パッドなら アクションヒントが パッド絵、マウスで もどる', async ({ page }) => {
  await open1P(page);
  const pad = () => page.evaluate(() => document.querySelector<HTMLElement>('.action-hint')?.dataset.pad ?? null);
  await stepN(page, 3);
  expect(await pad()).toBe('mouse');
  await page.evaluate(() => (window.__rikkun as any).gamepad.setLastInput('gamepad'));
  await stepN(page, 3);
  expect(await pad()).toBe('pad');
  await page.evaluate(() => (window.__rikkun as any).gamepad.setLastInput('mouse'));
  await stepN(page, 3);
  expect(await pad()).toBe('mouse');
});

test('5: 2 人の とき 2P の もちもので X・R3 で すてられる（未実装 = 赤）', async ({ page }) => {
  await openDuoHud(page);
  await installFakePads(page, 2);
  await page.evaluate(() => {
    const h = (window as any).__rikkun;
    h.duo.give(2, 'dirt', 10, 0);
    h.step(2);
  });
  await tapPad(page, 1, PAD.inventory); // 2P の もちもの画面
  await stepN(page, 4);
  expect((await invOf(page, 2)).open).toBe(true);
  await padSteer(page, 'slot:0');
  const n = () => page.evaluate(() => (window as any).__rikkun.duo.count(2, 'dirt') as number);
  const before = await n();
  expect(before).toBe(10);

  await tapPad(page, 1, X);
  expect(await n()).toBe(before - 1);

  await tapPad(page, 1, R3);
  expect(await n()).toBe(0);
  await setFakePad(page, 1, {});
});
